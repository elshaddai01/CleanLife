const express = require('express');
const { pool } = require('../db/pool');
const { comparePassword } = require('../utils/password');
const { signCollectorToken, signClientToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
    }

    try {
        const result = await pool.query('SELECT * FROM find_collector_by_username($1)', [username]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'invalid username or password' });
        }

        const collector = result.rows[0];
        const passwordOk = await comparePassword(password, collector.password_hash);

        if (!passwordOk) {
            return res.status(401).json({ error: 'invalid username or password' });
        }

        const token = signCollectorToken(collector);

        return res.json({
            token,
            collector: {
                id: collector.id,
                username: collector.username,
                collector_type: collector.collector_type,
                company_id: collector.company_id,
                subscription_tier: collector.subscription_tier,
            },
        });
    } catch (err) {
        console.error('login failed:', err.message);
        return res.status(500).json({ error: 'login failed' });
    }
});

router.post('/client/login', async (req, res) => {
    const { phone_number, password } = req.body;
    if (!phone_number || !password) {
        return res.status(400).json({ error: 'phone_number and password are required' });
    }

    try {
        const result = await pool.query('SELECT * FROM find_client_by_phone($1)', [phone_number]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'invalid phone_number or password' });
        }
        const client = result.rows[0];
        if (!client.password_hash) {
            return res.status(401).json({ error: 'this account has no password set — it predates client login' });
        }
        const passwordOk = await comparePassword(password, client.password_hash);
        if (!passwordOk) {
            return res.status(401).json({ error: 'invalid phone_number or password' });
        }

        const token = signClientToken(client);
        return res.json({
            token,
            client: { id: client.id, name: client.name, phone_number: client.phone_number, company_id: client.company_id },
        });
    } catch (err) {
        console.error('client login failed:', err.message);
        return res.status(500).json({ error: 'login failed' });
    }
});

router.get('/me', requireAuth, (req, res) => {
    return res.json({ collector: req.collector });
});

module.exports = router;