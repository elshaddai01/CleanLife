const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = '12h';

if (!SECRET) {
    throw new Error('JWT_SECRET is not set in environment (.env)');
}

function signCollectorToken(collector) {
    return jwt.sign(
        {
            sub: collector.id,
            role: 'collector',
            username: collector.username,
            collector_type: collector.collector_type,
            company_id: collector.company_id,
            subscription_tier: collector.subscription_tier,
        },
        SECRET,
        { expiresIn: EXPIRES_IN }
    );
}

function signClientToken(client) {
    return jwt.sign(
        {
            sub: client.id,
            role: 'client',
            name: client.name,
            phone_number: client.phone_number,
            company_id: client.company_id,
        },
        SECRET,
        { expiresIn: EXPIRES_IN }
    );
}

function verifyToken(token) {
    return jwt.verify(token, SECRET);
}

module.exports = { signCollectorToken, signClientToken, verifyToken };
