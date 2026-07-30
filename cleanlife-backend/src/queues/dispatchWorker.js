const { Worker } = require('bullmq');
const { pool } = require('../db/pool');
const { connection, scheduleCascade } = require('./dispatchQueue');

// [DISP-04] Admin-hold expiry: if a corporate request is still unclaimed
// after the 2-minute window, it escalates to public broadcast (per SRS 4.3),
// starting the same Premium->Gold->Silver cascade independent requests use.
async function handleAdminHoldExpiry(job) {
    const { pickupRequestId } = job.data;
    try {
        const result = await pool.query('SELECT * FROM escalate_admin_hold($1)', [pickupRequestId]);

        if (result.rows.length > 0) {
            await scheduleCascade(pickupRequestId);
            console.log(`[dispatch] request ${pickupRequestId} escalated: corporate hold expired, now public + cascading`);
        }
    } catch (err) {
        console.error(`[dispatch] admin-hold-expiry failed for ${pickupRequestId}:`, err.message);
    }
}

// [DISP-05] Tier-cascade step: opens visibility to the next tier down,
// but only if the request is still open (unclaimed) and hasn't already
// moved past this stage.
async function handleStageEscalation(job) {
    const { pickupRequestId, targetRank } = job.data;
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
    const worker = new Worker(
        'dispatch',
        async (job) => {
            if (job.name === 'admin-hold-expiry') return handleAdminHoldExpiry(job);
            if (job.name === 'stage-escalation') return handleStageEscalation(job);
        },
        { connection }
    );

    worker.on('failed', (job, err) => {
        console.error(`[dispatch] job ${job?.id} failed:`, err.message);
    });

    return worker;
}

module.exports = { startDispatchWorker };
