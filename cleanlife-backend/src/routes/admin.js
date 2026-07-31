const express = require('express');
const { pool } = require('../db/pool');
const { requireAdminKey } = require('../middleware/auth');
const { finiteNumber, nonEmptyString } = require('../utils/validation');
const { handleDbError } = require('../utils/dbErrors');

const router = express.Router();
router.use(requireAdminKey);

router.post('/companies', async (req, res) => {
    const companyName = nonEmptyString(req.body.company_name);
    const companyCode = nonEmptyString(req.body.company_code);
    const subscriptionTier = req.body.subscription_tier;
    if (!companyName || !companyCode || !['Premium', 'Gold', 'Silver'].includes(subscriptionTier)) {
        return res.status(400).json({ error: 'company_name, company_code, and a valid subscription_tier are required' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO companies (company_name, company_code, subscription_tier)
             VALUES ($1, lower($2), $3)
             RETURNING id, company_name, company_code, subscription_tier, created_at`,
            [companyName, companyCode, subscriptionTier]
        );
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        return handleDbError(error, res, 'company creation');
    }
});

router.get('/companies', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, company_name, company_code, subscription_tier, created_at FROM companies ORDER BY company_name');
        return res.json(result.rows);
    } catch (error) {
        return handleDbError(error, res, 'company listing');
    }
});

router.post('/dumpsters', async (req, res) => {
    const latitude = finiteNumber(req.body.latitude, { min: -90, max: 90 });
    const longitude = finiteNumber(req.body.longitude, { min: -180, max: 180 });
    const binCode = nonEmptyString(req.body.bin_code);
    if (latitude === null || longitude === null || !binCode) {
        return res.status(400).json({ error: 'valid latitude, longitude, and bin_code are required' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO dumpsters (latitude, longitude, bin_code)
             VALUES ($1, $2, upper($3))
             RETURNING id, latitude, longitude, bin_code`,
            [latitude, longitude, binCode]
        );
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        return handleDbError(error, res, 'dumpster creation');
    }
});

module.exports = router;
