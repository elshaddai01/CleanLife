const { pool } = require('../db/pool');
const config = require('../config/env');

// [DISP-04] Admin-hold expiry: if a corporate request is still unclaimed
// after the 2-minute window, it escalates to public broadcast (per SRS 4.3),
// starting the same Premium->Gold->Silver cascade independent requests use.
async function handleAdminHoldExpiry(pickupRequestId) {
    try {
        const result = await pool.query('SELECT * FROM escalate_admin_hold($1)', [pickupRequestId]);

        if (result.rows.length > 0) {
            console.log(`[dispatch] request ${pickupRequestId} escalated: corporate hold expired, now public + cascading`);
        }
    } catch (err) {
        console.error(`[dispatch] admin-hold-expiry failed for ${pickupRequestId}:`, err.message);
    }
}

// [DISP-05] Tier-cascade step: opens visibility to the next tier down,
// but only if the request is still open (unclaimed) and hasn't already
// moved past this stage.
async function handleStageEscalation(pickupRequestId, targetRank) {
    try {
        const result = await pool.query('SELECT * FROM escalate_stage($1, $2)', [pickupRequestId, targetRank]);

        if (result.rows.length > 0) {
            console.log(`[dispatch] request ${pickupRequestId} cascaded to stage rank ${targetRank}`);
        }
    } catch (err) {
        console.error(`[dispatch] stage-escalation failed for ${pickupRequestId}:`, err.message);
    }
}

function startDispatchWorker() {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const dueHolds = await pool.query(
                `SELECT id FROM pickup_requests
                 WHERE routing_status = 'searching_corporate'
                   AND collector_id IS NULL
                   AND admin_hold_expires_at <= now()`
            );
            for (const row of dueHolds.rows) await handleAdminHoldExpiry(row.id);

            const dueStages = await pool.query(
                `SELECT id,
                        CASE
                            WHEN created_at <= now() - ($1 * interval '1 millisecond') THEN 3
                            WHEN created_at <= now() - ($2 * interval '1 millisecond') THEN 2
                            ELSE current_stage_rank
                        END AS target_rank
                 FROM pickup_requests
                 WHERE routing_status = 'broadcast_public'
                   AND collector_id IS NULL
                   AND current_stage_rank < 3`,
                [config.tierCascadeStepMs * 2, config.tierCascadeStepMs]
            );
            for (const row of dueStages.rows) {
                if (row.target_rank > 1) await handleStageEscalation(row.id, row.target_rank);
            }
        } catch (error) {
            console.error('[dispatch] polling failed:', error.message);
        } finally {
            running = false;
        }
    };

    const timer = setInterval(tick, config.dispatchPollMs);
    timer.unref();
    void tick();
    return { close: () => clearInterval(timer) };
}

module.exports = { startDispatchWorker };
