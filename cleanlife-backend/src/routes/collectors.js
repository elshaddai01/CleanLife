const express = require('express');
const { pool, withTenant } = require('../db/pool');
const { hashPassword } = require('../utils/password');
const { requireAdminKey, requireAuth } = require('../middleware/auth');
const { handleDbError } = require('../utils/dbErrors');

const router = express.Router();

// [ONBOARD-03a] Independent self-registration — public endpoint.
// Body: { username, password, subscription_tier? } (defaults to 'Silver')
router.post('/register', async (req, res) => {
    const { username, password, subscription_tier } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const tier = subscription_tier || 'Silver';
    if (!['Premium', 'Gold', 'Silver'].includes(tier)) {
        return res.status(400).json({ error: 'subscription_tier must be Premium, Gold, or Silver' });
    }

    try {
        const password_hash = await hashPassword(password);

        const created = await withTenant(null, async (client) => {
            const result = await client.query(
                `INSERT INTO collectors (username, password_hash, collector_type, company_id, subscription_tier)
                 VALUES ($1, $2, 'independent', NULL, $3)
                 RETURNING id, username, collector_type, company_id, subscription_tier, created_at`,
                [username, password_hash, tier]
            );
            return result.rows[0];
        });

        return res.status(201).json(created);
    } catch (err) {
        return handleDbError(err, res, 'collector registration');
    }
});

// [ONBOARD-03b] Corporate on-site registration by admin — gated by X-Admin-Key.
// The collector's subscription_tier is FORCED to inherit the company's tier;
// any tier sent in the body is ignored, per SRS 4.3 tier-inheritance rule.
// Body: { username, password, company_code }
router.post('/admin-create', requireAdminKey, async (req, res) => {
    const { username, password, company_code } = req.body;

    if (!username || !password || !company_code) {
        return res.status(400).json({ error: 'username, password, and company_code are required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    try {
        const companyResult = await pool.query(
            'SELECT id, company_name, subscription_tier FROM companies WHERE lower(company_code) = $1',
            [String(company_code).trim().toLowerCase()]
        );
        if (companyResult.rows.length === 0) {
            return res.status(400).json({ error: 'invalid company_code' });
        }
        const company = companyResult.rows[0];
        const password_hash = await hashPassword(password);

        const created = await withTenant(company.id, async (client) => {
            const result = await client.query(
                `INSERT INTO collectors (username, password_hash, collector_type, company_id, subscription_tier)
                 VALUES ($1, $2, 'corporate', $3, $4)
                 RETURNING id, username, collector_type, company_id, subscription_tier, created_at`,
                [username, password_hash, company.id, company.subscription_tier]
            );
            return result.rows[0];
        });

        return res.status(201).json({ ...created, company_name: company.company_name });
    } catch (err) {
        return handleDbError(err, res, 'admin collector creation');
    }
});

// [KYC-02] Collector submits their own KYC document — self-service, own tenant.
// Body: { document_url, document_name? }
router.post('/:id/kyc', requireAuth, async (req, res) => {
    const collectorId = Number(req.params.id);
    if (req.collector.sub !== collectorId) {
        return res.status(403).json({ error: 'you can only submit KYC for your own account' });
    }
    const { document_url, document_name } = req.body;
    if (!document_url) {
        return res.status(400).json({ error: 'document_url is required' });
    }

    try {
        const updated = await withTenant(req.collector.company_id, async (client) => {
            const result = await client.query(
                `UPDATE collectors
                 SET kyc_status = 'pending', kyc_document_url = $1, kyc_document_name = $2, kyc_submitted_at = now()
                 WHERE id = $3
                 RETURNING id, kyc_status, kyc_submitted_at`,
                [document_url, document_name || null, collectorId]
            );
            return result.rows[0];
        });
        return res.json(updated);
    } catch (err) {
        return handleDbError(err, res, 'KYC submission');
    }
});

// [KYC-03] Admin review — approve or reject. Same admin-key caveat as every
// other admin action: no real admin/staff entity exists yet.
// Body: { status } where status is 'verified' or 'rejected'
router.post('/:id/kyc/review', requireAdminKey, async (req, res) => {
    const collectorId = Number(req.params.id);
    const { status } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status must be verified or rejected' });
    }

    try {
        const result = await pool.query('SELECT * FROM review_kyc($1, $2)', [collectorId, status]);
        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'collector not found or KYC not currently pending' });
        }
        return res.json(result.rows[0]);
    } catch (err) {
        return handleDbError(err, res, 'KYC review');
    }
});

module.exports = router;
