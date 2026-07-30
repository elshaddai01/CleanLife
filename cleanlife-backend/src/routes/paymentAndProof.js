const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { handleDbError } = require('../utils/dbErrors');
const { verifyDisposal } = require('../services/proofOfWorkVerification');

const router = express.Router();

// [PAY-02] Collector marks arrival at the client's location. For MoMo, this
// is the ONLY moment the Request-to-Pay push goes out (SRS: never before
// physical arrival — protects the client from a premature charge prompt).
// NOTE: no real MTN/Orange MoMo integration exists — this logs/simulates
// the push. Swap logMomoPush() for a real provider call when integrating.
router.post('/:id/arrive', requireAuth, async (req, res) => {
    const requestId = Number(req.params.id);
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
router.post('/:id/collect-cash', requireAuth, async (req, res) => {
    const requestId = Number(req.params.id);
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
    if (!secret || secret !== process.env.MOMO_WEBHOOK_SECRET) {
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
// Either bin_code OR both exif_latitude/exif_longitude must be given.
router.post('/:id/proof-of-work', requireAuth, async (req, res) => {
    const requestId = Number(req.params.id);
    const { photo_storage_url, exif_latitude, exif_longitude, bin_code } = req.body;

    if (!photo_storage_url) {
        return res.status(400).json({ error: 'photo_storage_url is required' });
    }
    if (!bin_code && (exif_latitude == null || exif_longitude == null)) {
        return res.status(400).json({ error: 'either bin_code or both exif_latitude and exif_longitude are required' });
    }

    try {
        const { isVerified, verificationMethod, dumpsterId } = await verifyDisposal({
            exifLatitude: exif_latitude,
            exifLongitude: exif_longitude,
            binCode: bin_code,
        });

        const inserted = await pool.query(
            'SELECT * FROM insert_proof_of_work($1, $2, $3, $4, $5, $6, $7, $8)',
            [requestId, req.collector.sub, photo_storage_url, exif_latitude, exif_longitude, verificationMethod, dumpsterId, isVerified]
        );

        if (inserted.rows.length === 0) {
            return res.status(409).json({ error: 'request not found, not yours, or not currently assigned' });
        }

        if (!isVerified) {
            return res.status(422).json({
                error: bin_code
                    ? 'bin_code not recognized'
                    : `disposal photo location is not within the required ${100}m of an authorized dumpster`,
                proof_of_work: inserted.rows[0],
            });
        }

        const completed = await pool.query(
            'SELECT * FROM complete_pickup_request($1, $2)',
            [requestId, req.collector.sub]
        );

        // [WALLET-05] Escrow release IS the earnings event — credit the
        // collector's wallet in the same step, not a separate one, so a
        // "completed" job can never exist without a matching payout record.
        let walletCredit = null;
        const price = completed.rows[0]?.estimated_price_fcfa;
        if (price && Number(price) > 0) {
            const creditResult = await pool.query(
                'SELECT * FROM create_wallet_transaction($1, $2, $3, $4, $5, $6)',
                ['collector', req.collector.sub, 'job_earnings', price, `Job earnings for pickup request ${requestId}`, requestId]
            );
            walletCredit = creditResult.rows[0];
        }

        return res.json({
            proof_of_work: inserted.rows[0],
            pickup_request: completed.rows[0],
            wallet_credit: walletCredit,
        });
    } catch (err) {
        return handleDbError(err, res, 'proof-of-work submission');
    }
});

module.exports = router;
