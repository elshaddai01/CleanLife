const config = require('./src/config/env');
const express = require('express');
const cors = require('cors');
const clientsRouter = require('./src/routes/clients');
const collectorsRouter = require('./src/routes/collectors');
const authRouter = require('./src/routes/auth');
const telemetryRouter = require('./src/routes/telemetry');
const pickupRequestsRouter = require('./src/routes/pickupRequests');
const paymentAndProofRouter = require('./src/routes/paymentAndProof');
const walletRouter = require('./src/routes/wallet');
const adminRouter = require('./src/routes/admin');
const uploadsRouter = require('./src/routes/uploads');
const path = require('path');
const { startDispatchWorker } = require('./src/queues/dispatchWorker');
const { pool, checkDatabaseConnection } = require('./src/db/pool');

const app = express();
app.disable('x-powered-by');
app.use(cors({
    origin(origin, callback) {
        if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('origin is not allowed by CORS'));
    },
}));
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads'), { maxAge: '1d' }));

app.use('/clients', clientsRouter);
app.use('/collectors', collectorsRouter);
app.use('/auth', authRouter);
app.use('/telemetry', telemetryRouter);
app.use('/pickup-requests', pickupRequestsRouter);
app.use('/pickup-requests', paymentAndProofRouter);
app.use('/wallet', walletRouter);
app.use('/admin', adminRouter);
app.use('/uploads', uploadsRouter);

app.get('/health', async (req, res) => {
    try {
        const database = await checkDatabaseConnection();
        return res.json({ status: 'ok', database: database.database_name });
    } catch {
        return res.status(503).json({ status: 'error', database: 'unavailable' });
    }
});

app.use((req, res) => res.status(404).json({ error: 'route not found' }));
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ error: 'invalid JSON body' });
    }
    if (error.message === 'origin is not allowed by CORS') return res.status(403).json({ error: error.message });
    console.error('Unhandled request error:', error);
    return res.status(500).json({ error: 'internal server error' });
});

async function startServer() {
    const database = await checkDatabaseConnection();
    if (database.database_name !== config.databaseName) {
        throw new Error(`Connected to ${database.database_name}, expected ${config.databaseName}`);
    }

    const dispatchWorker = startDispatchWorker();
    const server = app.listen(config.port, '0.0.0.0', () => {
        console.log(`CleanLife API listening on http://0.0.0.0:${config.port} (database: ${database.database_name})`);
    });

    const shutdown = (signal) => {
        console.log(`${signal} received; shutting down`);
        dispatchWorker.close();
        server.close(async () => {
            await pool.end();
            process.exit(0);
        });
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    return server;
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error('Failed to start CleanLife API:', error.message);
        process.exit(1);
    });
}

module.exports = { app, startServer };
