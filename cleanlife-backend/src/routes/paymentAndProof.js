const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { positiveInteger, finiteNumber } = require('../utils/validation');
const config = require('../config/env');
const { handleDbError } = require('../utils/dbErrors');
const { verifyDisposal } = require('../services/proofOfWorkVerification');

const router = express.Router();

// [PAY-02] Collector marks arrival at the client's location. For MoMo, this
// is the ONLY moment the Request-to-Pay push goes out (SRS: never before
// physical arrival — protects the client from a premature charge prompt).
// NOTE: no real MTN/Orange MoMo integration exists — this logs/simulates
// the push. Swap logMomoPush() for a real provider call when integrating.
router.post('/:id/arrive', requireAuth, requireRole('collector'), async (req, res) => {
    const requestId = positiveInteger(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'invalid pickup request id' });
    try {
        const result = await pool.query(
            'SELECT * FROM mark_collector_arrived($1, $2)',
            [requestId, req.collector.sub]
        );
        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'request not found, not yours, or not currently assigned' });
        }
        const row = result.rows[0];

        if (row.payment_method === 'MOMO') {
            // SIMULATED — replace with a real MTN/Orange Request-to-Pay API call.
            console.log(`[momo] SIMULATED Request-to-Pay push sent for request ${requestId}`);
        }

        return res.json(row);
    } catch (err) {
        return handleDbError(err, res, 'arrival confirmation');
    }
});

// [PAY-03] Cash handoff confirmation — collector-initiated, on-site.
router.post('/:id/collect-cash', requireAuth, requireRole('collector'), async (req, res) => {
    const requestId = positiveInteger(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'invalid pickup request id' });
    try {
        const result = await pool.query(
            'SELECT * FROM confirm_cash_collected($1, $2)',
            [requestId, req.collector.sub]
        );
        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'request not found, not yours, or not a CASH payment' });
        }
        // Real system: fire the commission-processing webhook here.
        console.log(`[payment] SIMULATED commission webhook fired for cash request ${requestId}`);
        return res.json(result.rows[0]);
    } catch (err) {
        return handleDbError(err, res, 'cash confirmation');
    }
});

// [PAY-04] SIMULATED provider webhook — stands in for MTN/Orange calling
// back once the client approves the Request-to-Pay prompt on their phone.
// Gated by a shared secret since this would be a public-facing endpoint in
// a real deployment; a real integration would verify the provider's own
// signature scheme instead of a static header.
router.post('/momo/webhook', async (req, res) => {
    const secret = req.headers['x-momo-webhook-secret'];
    if (!secret || secret !== config.momoWebhookSecret) {
        return res.status(401).json({ error: 'invalid webhook secret' });
    }
    const { pickup_request_id } = req.body;
    if (!pickup_request_id) {
        return res.status(400).json({ error: 'pickup_request_id is required' });
    }
    try {
        const result = await pool.query('SELECT * FROM confirm_momo_payment($1)', [pickup_request_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'request not found or not a MOMO payment' });
        }
        return res.json(result.rows[0]);
    } catch (err) {
        return handleDbError(err, res, 'momo webhook');
    }
});

// [POW-06] Proof-of-work submission — the ONLY action that completes a
// request and releases escrow (SRS 3.4), regardless of payment method.
// Body: { photo_storage_url, exif_latitude?, exif_longitude?, bin_code? }
// A freshly captured snapshot URL and both GPS coordinates are required.
router.post('/:id/proof-of-work', requireAuth, requireRole('collector'), async (req, res) => {
    const requestId = positiveInteger(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'invalid pickup request id' });
    const { photo_storage_url, exif_latitude, exif_longitude, bin_code } = req.body;

    if (!photo_storage_url) {
        return res.status(400).json({ error: 'photo_storage_url is required' });
    }
    try {
        const photoUrl = new URL(photo_storage_url);
        if (!photoUrl.pathname.startsWith('/uploads/proofs/')) {
            return res.status(400).json({ error: 'proof must use a snapshot uploaded through the CleanLife camera flow' });
        }
    } catch {
        return res.status(400).json({ error: 'invalid proof snapshot URL' });
    }
    if (exif_latitude == null || exif_longitude == null) {
        return res.status(400).json({ error: 'both exif_latitude and exif_longitude are required' });
    }
    if (exif_latitude != null && finiteNumber(exif_latitude, { min: -90, max: 90 }) === null) {
        return res.status(400).json({ error: 'exif_latitude must be between -90 and 90' });
    }
    if (exif_longitude != null && finiteNumber(exif_longitude, { min: -180, max: 180 }) === null) {
        return res.status(400).json({ error: 'exif_longitude must be between -180 and 180' });
    }

    try {
        const { isVerified, verificationMethod, dumpsterId, nearestDistanceMeters } = await verifyDisposal({
            exifLatitude: exif_latitude,
            exifLongitude: exif_longitude,
            binCode: bin_code,
        });

        const proofParams = [requestId, req.collector.sub, photo_storage_url, exif_latitude, exif_longitude, verificationMethod, dumpsterId, isVerified];

        if (!isVerified) {
            const inserted = await pool.query(
                'SELECT * FROM insert_proof_of_work($1, $2, $3, $4, $5, $6, $7, $8)',
                proofParams
            );
            if (inserted.rows.length === 0) {
                return res.status(409).json({ error: 'request not found, not yours, or not currently assigned' });
            }
            return res.status(422).json({
                error: bin_code
                    ? 'bin_code not recognized'
                    : `disposal photo location is not within the required 100m of an authorized dumpster` +
                      (nearestDistanceMeters != null ? ` (nearest is ${Math.round(nearestDistanceMeters)}m away)` : ''),
                proof_of_work: inserted.rows[0],
            });
        }

        const client = await pool.connect();
        await client.query('BEGIN');
        try {
            const inserted = await client.query(
                'SELECT * FROM insert_proof_of_work($1, $2, $3, $4, $5, $6, $7, $8)',
                proofParams
            );

            if (inserted.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'request not found, not yours, or not currently assigned' });
            }

            const completed = await client.query(
                'SELECT * FROM complete_pickup_request($1, $2)',
                [requestId, req.collector.sub]
            );
            if (completed.rows.length === 0) throw new Error('pickup request could not be completed');

        // [WALLET-05] Escrow release IS the earnings event — credit the
        // collector's wallet in the same step, not a separate one, so a
        // "completed" job can never exist without a matching payout record.
            let walletCredit = null;
            const price = completed.rows[0].estimated_price_fcfa;
            if (price && Number(price) > 0) {
                const creditResult = await client.query(
                    'SELECT * FROM create_wallet_transaction($1, $2, $3, $4, $5, $6)',
                    ['collector', req.collector.sub, 'job_earnings', price, `Job earnings for pickup request ${requestId}`, requestId]
                );
                walletCredit = creditResult.rows[0];
            }

            await client.query('COMMIT');

            return res.json({
                proof_of_work: inserted.rows[0],
                pickup_request: completed.rows[0],
                wallet_credit: walletCredit,
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (err) {
        return handleDbError(err, res, 'proof-of-work submission');
    }
});

module.exports = router;
