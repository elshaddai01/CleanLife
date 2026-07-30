const { verifyToken } = require('../utils/jwt');

// Protects collector-facing routes. Expects "Authorization: Bearer <token>".
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'missing or malformed Authorization header' });
    }

    try {
        req.collector = verifyToken(token);
        return next();
    } catch (err) {
        return res.status(401).json({ error: 'invalid or expired token' });
    }
}

// Protects the on-site corporate collector creation endpoint.
// NOTE: the ER diagram has no admin/staff table yet, so this is a stand-in
// shared-secret gate (ADMIN_API_KEY in .env) until a real admin/company-staff
// entity and its own auth are designed. Flagging this so it isn't mistaken
// for a production-grade admin auth system.
function requireAdminKey(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (!key || key !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'invalid admin key' });
    }
    return next();
}

// Restricts a route to a specific JWT role ('client' or 'collector').
// Must run after requireAuth.
function requireRole(role) {
    return (req, res, next) => {
        if (!req.collector || req.collector.role !== role) {
            return res.status(403).json({ error: `this action requires a ${role} account` });
        }
        return next();
    };
}

module.exports = { requireAuth, requireAdminKey, requireRole };