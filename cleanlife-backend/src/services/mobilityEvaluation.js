const { pool } = require('../db/pool');

// [DISP-03] Dynamic Mobility Evaluation (SRS 4.2).
// ASSUMPTION FLAGGED: the SRS states mobility is assigned "based on waste
// volume and distance to nearest dumpster" but does not give exact
// thresholds. These bag-count/distance bands are a reasonable starting
// point, not a specified business rule — tune with the product owner
// before relying on this in production.
const MOBILITY_RULES = [
    { name: 'Wheelbarrow', maxBags: 3, maxDistanceMeters: 500 },
    { name: 'Tricycle', maxBags: 8, maxDistanceMeters: 2000 },
    // anything larger/farther falls through to Van
];

// Finds the nearest dumpster (by geography distance in meters) to a point.
async function findNearestDumpster(latitude, longitude) {
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
    return result.rows[0] || null;
}

function assignMobilityType(bagCount, distanceMeters) {
    for (const rule of MOBILITY_RULES) {
        if (bagCount <= rule.maxBags && distanceMeters <= rule.maxDistanceMeters) {
            return rule.name;
        }
    }
    return 'Van';
}

// Full evaluation: returns { mobilityTypeName, nearestDumpsterId, distanceMeters }
// or nulls for dumpster/distance if no dumpster exists yet in the system.
async function evaluateMobility(bagCount, latitude, longitude) {
    const nearest = await findNearestDumpster(latitude, longitude);
    if (!nearest) {
        // No dumpster seeded at all — fall back to worst-case (Van) rather
        // than crash the request; this should be rare/never in a live system.
        return { mobilityTypeName: 'Van', nearestDumpsterId: null, distanceMeters: null };
    }
    const mobilityTypeName = assignMobilityType(bagCount, nearest.distance_meters);
    return {
        mobilityTypeName,
        nearestDumpsterId: nearest.id,
        distanceMeters: nearest.distance_meters,
    };
}

module.exports = { evaluateMobility, assignMobilityType, findNearestDumpster };
