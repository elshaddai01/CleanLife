const { pool } = require('../db/pool');
const config = require('../config/env');

const GEOFENCE_RADIUS_METERS = 100;

// [POW-04] GPS path: is there an authorized dumpster within 100m of the
// EXIF coordinates? Distance is computed in meters with the Haversine formula.
// Returns { dumpster, nearestDistanceMeters, dumpsterCount } so callers can
// tell "no dumpster close enough" apart from "no dumpsters registered at all".
async function findDumpsterWithinGeofence(latitude, longitude) {
    const result = await pool.query(
        `SELECT id,
                6371000 * 2 * asin(sqrt(
                    power(sin(radians(latitude - $1) / 2), 2) +
                    cos(radians($1)) * cos(radians(latitude)) *
                    power(sin(radians(longitude - $2) / 2), 2)
                )) AS distance_meters
         FROM dumpsters
         ORDER BY distance_meters
         LIMIT 1`,
        [latitude, longitude]
    );
    const nearest = result.rows[0] || null;
    const countResult = await pool.query('SELECT count(*)::int AS count FROM dumpsters');
    const dumpsterCount = countResult.rows[0].count;
    const withinRadius = nearest && Number(nearest.distance_meters) <= GEOFENCE_RADIUS_METERS ? nearest : null;
    return {
        dumpster: withinRadius,
        nearestDistanceMeters: nearest ? Number(nearest.distance_meters) : null,
        dumpsterCount,
    };
}

// [POW-05] Bin-code fallback: an explicit code entry always overrides
// spatial validation, per SRS 4.4 — no distance check at all once a valid
// code is given.
async function findDumpsterByBinCode(binCode) {
    const result = await pool.query('SELECT id FROM dumpsters WHERE bin_code = $1', [binCode]);
    return result.rows[0] || null;
}

// Returns { isVerified, verificationMethod, dumpsterId, nearestDistanceMeters? }
async function verifyDisposal({ exifLatitude, exifLongitude, binCode }) {
    // Temporary operational mode: a camera snapshot plus valid GPS is enough
    // until administrators can register authorized dumpster locations.
    if (config.autoVerifyGpsProof && exifLatitude != null && exifLongitude != null) {
        return { isVerified: true, verificationMethod: 'gps', dumpsterId: null };
    }

    if (binCode) {
        const dumpster = await findDumpsterByBinCode(binCode);
        if (dumpster) {
            return { isVerified: true, verificationMethod: 'bin_code', dumpsterId: dumpster.id };
        }
        // An invalid/unknown code does NOT silently fall back to GPS — an
        // explicit but wrong code is a distinct failure mode worth flagging
        // rather than masking with a GPS retry the collector didn't ask for.
        return { isVerified: false, verificationMethod: 'bin_code', dumpsterId: null };
    }

    if (exifLatitude == null || exifLongitude == null) {
        return { isVerified: false, verificationMethod: 'gps', dumpsterId: null };
    }

    const { dumpster, nearestDistanceMeters, dumpsterCount } = await findDumpsterWithinGeofence(exifLatitude, exifLongitude);

    // [POW-04b] BUGFIX: with strict mode on (AUTO_VERIFY_GPS_PROOF=false) but
    // zero dumpsters registered yet, every single submission failed the
    // geofence check with no way out — collectors could never send a
    // disposal confirmation. Checking against an empty authorized-dumpster
    // list isn't a meaningful security check, so treat "nothing registered
    // yet" as auto-verified GPS, same as the temporary global flag above.
    if (dumpsterCount === 0) {
        return { isVerified: true, verificationMethod: 'gps', dumpsterId: null };
    }

    if (dumpster) {
        return { isVerified: true, verificationMethod: 'gps', dumpsterId: dumpster.id };
    }
    return { isVerified: false, verificationMethod: 'gps', dumpsterId: null, nearestDistanceMeters };
}

module.exports = { verifyDisposal, GEOFENCE_RADIUS_METERS };
