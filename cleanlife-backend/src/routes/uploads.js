const crypto = require('crypto');
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const uploadDirectory = path.resolve(__dirname, '../../uploads/proofs');
const supportedTypes = new Map([
    ['image/jpeg', { extension: 'jpg', signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 }],
    ['image/png', { extension: 'png', signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
]);

router.post('/proof', requireAuth, requireRole('collector'), async (req, res, next) => {
    const type = supportedTypes.get(req.body.mime_type);
    if (!type || typeof req.body.base64 !== 'string') {
        return res.status(400).json({ error: 'a JPEG or PNG camera image is required' });
    }

    try {
        const bytes = Buffer.from(req.body.base64, 'base64');
        if (!bytes.length || !type.signature(bytes)) return res.status(400).json({ error: 'invalid image data' });
        if (bytes.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'proof image must be smaller than 8 MB' });

        await fs.mkdir(uploadDirectory, { recursive: true });
        const filename = `${Date.now()}-${crypto.randomUUID()}.${type.extension}`;
        await fs.writeFile(path.join(uploadDirectory, filename), bytes, { flag: 'wx' });
        return res.status(201).json({
            url: `${req.protocol}://${req.get('host')}/uploads/proofs/${filename}`,
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
