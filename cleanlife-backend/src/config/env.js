const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function required(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required. Copy .env.example to .env and configure it.`);
    }
    return value;
}

function secret(name) {
    const value = required(name);
    if (/^(change_this|YOUR_)/i.test(value)) {
        throw new Error(`${name} still contains a placeholder value in .env`);
    }
    return value;
}

function positiveInteger(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
}

const databaseUrl = required('DATABASE_URL');
if (databaseUrl.includes('YOUR_POSTGRES_PASSWORD')) {
    throw new Error('Set your real PostgreSQL password in DATABASE_URL inside .env');
}
let databaseName;
try {
    databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
} catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
}

if (!databaseName) throw new Error('DATABASE_URL must include a database name');

module.exports = Object.freeze({
    nodeEnv: process.env.NODE_ENV || 'development',
    port: positiveInteger('PORT', 3000),
    databaseUrl,
    databaseName,
    databaseSsl: process.env.DATABASE_SSL === 'true',
    jwtSecret: secret('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
    adminApiKey: secret('ADMIN_API_KEY'),
    momoWebhookSecret: secret('MOMO_WEBHOOK_SECRET'),
    corsOrigins: (process.env.CORS_ORIGIN || '*').split(',').map((value) => value.trim()).filter(Boolean),
    dispatchPollMs: positiveInteger('DISPATCH_POLL_MS', 15000),
    adminHoldMs: positiveInteger('ADMIN_HOLD_MS', 120000),
    tierCascadeStepMs: positiveInteger('TIER_CASCADE_STEP_MS', 300000),
    autoVerifyGpsProof: process.env.AUTO_VERIFY_GPS_PROOF !== 'false',
});
