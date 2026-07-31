const express = require('express');
const { pool, withTenant } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { handleDbError } = require('../utils/dbErrors');

const router = express.Router();

// [OFF-03] Single heartbeat — collector checks into a static sector.
// Called on app state-change or at most once per 15 minutes. NEVER call this
// on a continuous timer shorter than 15 min or on every GPS tick — that is
// exactly the battery/data drain pattern this design avoids.
// Body: { area_id }
router.post('/heartbeat', requireAuth, async (req, res) => {
    const { area_id } = req.body;
    if (!area_id || typeof area_id !== 'string') {
        return res.status(400).json({ error: 'area_id is required' });
    }

    try {
        const updated = await withTenant(req.collector.company_id, async (client) => {
            const result = await client.query(
                `UPDATE collectors
                 SET current_area_id = $1, last_heartbeat_at = now()
                 WHERE id = $2
                 RETURNING id, current_area_id, last_heartbeat_at`,
                [area_id, req.collector.sub]
            );
            return result.rows[0];
        });

        if (!updated) {
            return res.status(404).json({ error: 'collector not found' });
        }
        return res.json(updated);
    } catch (err) {
        return handleDbError(err, res, 'heartbeat');
    }
});

// [OFF-03b] Batch heartbeat — flush a queue of check-ins recorded locally
// while the device was offline. Only the LATEST entry (by client_timestamp)
// is kept as current state; this is a state check-in, not an event log, so
// intermediate offline entries are superseded rather than replayed.
// Body: { entries: [{ area_id, client_timestamp }, ...] }
router.post('/heartbeat/batch', requireAuth, async (req, res) => {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'entries must be a non-empty array' });
    }
    for (const e of entries) {
        if (!e.area_id || !e.client_timestamp) {
            return res.status(400).json({ error: 'each entry needs area_id and client_timestamp' });
        }
    }

    const latest = entries.reduce((a, b) =>
        new Date(a.client_timestamp) > new Date(b.client_timestamp) ? a : b
    );

    try {
        const updated = await withTenant(req.collector.company_id, async (client) => {
            const result = await client.query(
                `UPDATE collectors
                 SET current_area_id = $1, last_heartbeat_at = $2
                 WHERE id = $3
                 RETURNING id, current_area_id, last_heartbeat_at`,
                [latest.area_id, latest.client_timestamp, req.collector.sub]
            );
            return result.rows[0];
        });

        if (!updated) {
            return res.status(404).json({ error: 'collector not found' });
        }
        return res.json({ applied_entries: entries.length, ...updated });
    } catch (err) {
        return handleDbError(err, res, 'batch heartbeat');
    }
});

// [OFF-02] Dumpster sync feed — mobile app pulls this once (or on a manual
// refresh) and caches it locally in SQLite/WatermelonDB, so proof-of-work
// geofence checks and "nearest dumpster" lookups work fully offline.
router.get('/dumpsters', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, latitude, longitude, bin_code
             FROM dumpsters`
        );
        return res.json(result.rows);
    } catch (err) {
        return handleDbError(err, res, 'dumpster sync');
    }
});

module.exports = router;
