require('dotenv').config();
const express = require('express');
const cors = require('cors');
const clientsRouter = require('./routes/clients');
const collectorsRouter = require('./routes/collectors');
const authRouter = require('./routes/auth');
const telemetryRouter = require('./routes/telemetry');
const pickupRequestsRouter = require('./routes/pickupRequests');
const paymentAndProofRouter = require('./routes/paymentAndProof');
const walletRouter = require('./routes/wallet');
const { startDispatchWorker } = require('./queues/dispatchWorker');

const app = express();
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json());

app.use('/clients', clientsRouter);
app.use('/collectors', collectorsRouter);
app.use('/auth', authRouter);
app.use('/telemetry', telemetryRouter);
app.use('/pickup-requests', pickupRequestsRouter);
app.use('/pickup-requests', paymentAndProofRouter);
app.use('/wallet', walletRouter);

startDispatchWorker();

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CleanLife API listening on :${PORT}`));

module.exports = app;
