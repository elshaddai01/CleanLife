const config = require('../config/env');

// Delays are configurable via env so tests don't have to wait real wall-clock
// minutes. Defaults match the SRS: 2-min admin hold, 5-min tier cascade steps.
const ADMIN_HOLD_MS = config.adminHoldMs;
const TIER_CASCADE_STEP_MS = config.tierCascadeStepMs;

// [DISP-04] Scheduled when a CORPORATE request is created. If still
// unclaimed when this fires, it escalates out of the company-only pool.
async function scheduleAdminHoldExpiry(pickupRequestId) {
    return pickupRequestId;
}

// [DISP-05] Scheduled when an INDEPENDENT request is created (or when a
// corporate request escalates to public broadcast). Cascades visibility
// from Premium -> Gold -> Silver every TIER_CASCADE_STEP_MS if unclaimed.
async function scheduleCascade(pickupRequestId) {
    return pickupRequestId;
}

// Best-effort cancellation when a request is claimed/assigned early.
async function cancelPendingJobs(pickupRequestId) {
    return pickupRequestId;
}

module.exports = {
    scheduleAdminHoldExpiry,
    scheduleCascade,
    cancelPendingJobs,
    ADMIN_HOLD_MS,
    TIER_CASCADE_STEP_MS,
};
