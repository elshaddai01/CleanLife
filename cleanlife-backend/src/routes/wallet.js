const express = require('express');
const { pool, withTenant } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { handleDbError } = require('../utils/dbErrors');
const { finiteNumber } = require('../utils/validation');

const router = express.Router();

// GET /wallet/balance — works for either role, reads from the caller's own record.
router.get('/balance', requireAuth, async (req, res) => {
    const { role, sub, company_id } = req.collector;
    const table = role === 'client' ? 'clients' : 'collectors';

    try {
        const balance = await withTenant(company_id, async (client) => {
            const result = await client.query(`SELECT balance FROM ${table} WHERE id = $1`, [sub]);
            return result.rows[0];
        });
        if (!balance) {
            return res.status(404).json({ error: 'account not found' });
        }
        return res.json({ balance: balance.balance });
    } catch (err) {
        return handleDbError(err, res, 'balance lookup');
    }
});

// GET /wallet/transactions — the caller's own transaction history.
router.get('/transactions', requireAuth, async (req, res) => {
    const { role, sub, company_id } = req.collector;

    try {
        const rows = await withTenant(company_id, async (client) => {
            const result = await client.query(
                `SELECT id, type, amount, currency, status, description, reference_pickup_request_id, created_at
                 FROM wallet_transactions
                 WHERE owner_type = $1 AND owner_id = $2
                 ORDER BY created_at DESC`,
                [role, sub]
            );
            return result.rows;
        });
        return res.json(rows);
    } catch (err) {
        return handleDbError(err, res, 'transaction history lookup');
    }
});

// [WALLET-03] SIMULATED — stands in for a real MoMo/Orange top-up
// confirmation. A real integration would only credit balance from a
// verified provider webhook, the same way MoMo payment confirmation works
// in paymentAndProof.js — this is a placeholder until that's wired up here too.
// Body: { amount, description? }
router.post('/topup', requireAuth, requireRole('client'), async (req, res) => {
    const { description } = req.body;
    const amount = finiteNumber(req.body.amount, { min: 0.01 });
    if (amount === null) {
        return res.status(400).json({ error: 'amount must be a positive number' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM create_wallet_transaction($1, $2, $3, $4, $5, $6)',
            ['client', req.collector.sub, 'top_up', amount, description || 'Wallet top-up', null]
        );
        return res.status(201).json(result.rows[0]);
    } catch (err) {
        return handleDbError(err, res, 'top-up');
    }
});

// [WALLET-04] SIMULATED payout — stands in for a real disbursement to the
// collector's MoMo/bank account. Balance check (no overdraw) is enforced
// inside create_wallet_transaction.
// Body: { amount, description? }
router.post('/withdraw', requireAuth, requireRole('collector'), async (req, res) => {
    const { description } = req.body;
    const amount = finiteNumber(req.body.amount, { min: 0.01 });
    if (amount === null) {
        return res.status(400).json({ error: 'amount must be a positive number' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM create_wallet_transaction($1, $2, $3, $4, $5, $6)',
            ['collector', req.collector.sub, 'withdraw', amount, description || 'Withdrawal', null]
        );
        return res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.message && err.message.includes('insufficient balance')) {
            return res.status(422).json({ error: 'insufficient balance' });
        }
        return handleDbError(err, res, 'withdrawal');
    }
});

module.exports = router;
