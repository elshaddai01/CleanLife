const express = require('express');
const { pool, withTenant } = require('../db/pool');
const { handleDbError } = require('../utils/dbErrors');
const { hashPassword } = require('../utils/password');

const router = express.Router();

// POST /clients/register
// Body: { name, phone_number, password, company_code? }
router.post('/register', async (req, res) => {
    const { name, phone_number, password, company_code } = req.body;

    if (!name || !phone_number || !password) {
        return res.status(400).json({ error: 'name, phone_number, and password are required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    try {
        let company = null;

        // [ONBOARD-01] Company Referral Code path
        if (company_code) {
            const normalizedCode = String(company_code).trim().toLowerCase();
            const companyResult = await pool.query(
                'SELECT id, company_name, subscription_tier FROM companies WHERE lower(company_code) = $1',
                [normalizedCode]
            );

            if (companyResult.rows.length === 0) {
                return res.status(400).json({ error: 'invalid company_code' });
            }
            company = companyResult.rows[0];
        }

        // [ONBOARD-02] Independent path when company is null -> company_id stays NULL
        const tenantId = company ? company.id : null;
        const password_hash = await hashPassword(password);

        const inserted = await withTenant(tenantId, async (client) => {
            const result = await client.query(
                `INSERT INTO clients (name, phone_number, company_id, password_hash)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, name, phone_number, company_id, created_at`,
                [name, phone_number, tenantId, password_hash]
            );
            return result.rows[0];
        });

        return res.status(201).json({
            id: inserted.id,
            name: inserted.name,
            phone_number: inserted.phone_number,
            company_id: inserted.company_id,
            company_name: company ? company.company_name : null,
            created_at: inserted.created_at,
        });
    } catch (err) {
        return handleDbError(err, res, 'client registration');
    }
});

module.exports = router;
