const { Pool } = require('pg');
const config = require('../config/env');

const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error.message);
});

async function checkDatabaseConnection() {
    const result = await pool.query('SELECT current_database() AS database_name, now() AS connected_at');
    return result.rows[0];
}

/**
 * Runs `fn(client)` inside a transaction with the RLS tenant context set via
 * SET LOCAL (scoped to this transaction only, never leaks across pooled connections).
 *
 * @param {string|number|null} companyId - company id for a tenant scope, or null/undefined for public/marketplace scope
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function withTenant(companyId, fn) {
    const client = await pool.connect();
    let released = false;
    try {
        await client.query('BEGIN');
        const tenantValue = companyId === null || companyId === undefined ? 'public' : String(companyId);
        await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', tenantValue]);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            // The connection is in an unknown/broken state — destroy it
            // rather than returning it to the pool, or a later, completely
            // unrelated query could reuse it and fail with a confusing,
            // unrelated-looking error.
            client.release(rollbackErr);
            released = true;
        }
        throw err;
    } finally {
        if (!released) client.release();
    }
}

module.exports = { pool, withTenant, checkDatabaseConnection };
