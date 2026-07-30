const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const dispatchQueue = new Queue('dispatch', { connection });

// Delays are configurable via env so tests don't have to wait real wall-clock
// minutes. Defaults match the SRS: 2-min admin hold, 5-min tier cascade steps.
const ADMIN_HOLD_MS = Number(process.env.ADMIN_HOLD_MS || 2 * 60 * 1000);
const TIER_CASCADE_STEP_MS = Number(process.env.TIER_CASCADE_STEP_MS || 5 * 60 * 1000);

// [DISP-04] Scheduled when a CORPORATE request is created. If still
// unclaimed when this fires, it escalates out of the company-only pool.
async function scheduleAdminHoldExpiry(pickupRequestId) {
    return dispatchQueue.add(
        'admin-hold-expiry',
        { pickupRequestId },
        { delay: ADMIN_HOLD_MS, jobId: `admin-hold-${pickupRequestId}` }
    );
}

// [DISP-05] Scheduled when an INDEPENDENT request is created (or when a
// corporate request escalates to public broadcast). Cascades visibility
// from Premium -> Gold -> Silver every TIER_CASCADE_STEP_MS if unclaimed.
async function scheduleCascade(pickupRequestId) {
    await dispatchQueue.add(
        'stage-escalation',
        { pickupRequestId, targetRank: 2 },
        { delay: TIER_CASCADE_STEP_MS, jobId: `cascade-${pickupRequestId}-2` }
    );
    await dispatchQueue.add(
        'stage-escalation',
        { pickupRequestId, targetRank: 3 },
        { delay: TIER_CASCADE_STEP_MS * 2, jobId: `cascade-${pickupRequestId}-3` }
    );
}

// Best-effort cancellation when a request is claimed/assigned early.
async function cancelPendingJobs(pickupRequestId) {
    const ids = [
        `admin-hold-${pickupRequestId}`,
        `cascade-${pickupRequestId}-2`,
        `cascade-${pickupRequestId}-3`,
    ];
    for (const id of ids) {
        const job = await dispatchQueue.getJob(id);
        if (job) await job.remove().catch(() => {});
    }
}

module.exports = {
    dispatchQueue,
    connection,
    scheduleAdminHoldExpiry,
    scheduleCascade,
    cancelPendingJobs,
    ADMIN_HOLD_MS,
    TIER_CASCADE_STEP_MS,
};
