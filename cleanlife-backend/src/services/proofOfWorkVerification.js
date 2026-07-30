const { pool } = require('../db/pool');

const GEOFENCE_RADIUS_METERS = 100;

// [POW-04] GPS path: is there an authorized dumpster within 100m of the
// EXIF coordinates? Uses ST_DWithin on geography for accurate meter-based
// distance (not degrees), per SRS 4.4.
async function findDumpsterWithinGeofence(latitude, longitude) {
    const result = await pool.query(
        `SELECT id
         FROM dumpsters
         WHERE ST_DWithin(
             location_coordinates::geography,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             $3
         )
         ORDER BY location_coordinates::geography <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         LIMIT 1`,
        [longitude, latitude, GEOFENCE_RADIUS_METERS]
    );
    return result.rows[0] || null;
}

// [POW-05] Bin-code fallback: an explicit code entry always overrides
// spatial validation, per SRS 4.4 — no distance check at all once a valid
// code is given.
async function findDumpsterByBinCode(binCode) {
    const result = await pool.query('SELECT id FROM dumpsters WHERE bin_code = $1', [binCode]);
    return result.rows[0] || null;
}

// Returns { isVerified, verificationMethod, dumpsterId }
async function verifyDisposal({ exifLatitude, exifLongitude, binCode }) {
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

    const dumpster = await findDumpsterWithinGeofence(exifLatitude, exifLongitude);
    if (dumpster) {
        return { isVerified: true, verificationMethod: 'gps', dumpsterId: dumpster.id };
    }
    return { isVerified: false, verificationMethod: 'gps', dumpsterId: null };
}

module.exports = { verifyDisposal, GEOFENCE_RADIUS_METERS };
