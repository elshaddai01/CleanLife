const fs = require('fs/promises');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config/env');

async function migrate() {
    const client = new Client({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : false });
    await client.connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        const directory = path.resolve(__dirname, '../migrations');
        const filenames = (await fs.readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
        const result = await client.query('SELECT filename FROM schema_migrations');
        const applied = new Set(result.rows.map((row) => row.filename));
        for (const filename of filenames) {
            if (applied.has(filename)) continue;
            process.stdout.write(`Applying ${filename} ... `);
            await client.query('BEGIN');
            try {
                await client.query(await fs.readFile(path.join(directory, filename), 'utf8'));
                await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
                await client.query('COMMIT');
                console.log('done');
            } catch (error) {
                await client.query('ROLLBACK');
                console.log('failed');
                throw error;
            }
        }
        console.log(`Database ${config.databaseName} is up to date.`);
    } finally {
        await client.end();
    }
}

migrate().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
