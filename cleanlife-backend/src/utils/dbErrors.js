// Maps common Postgres error codes to safe HTTP responses.
// Never leaks raw SQL/stack traces to the client.
function handleDbError(err, res, context = 'operation') {
    if (err.code === '23505') {
        // unique_violation
        return res.status(409).json({ error: 'a record with that value already exists' });
    }
    if (err.code === '42501') {
        // insufficient_privilege — includes RLS policy violations.
        // If this fires in practice, it means a route tried to write/read
        // across tenant boundaries — almost always a bug (missing withTenant
        // scoping), not a legitimate user action, so log loudly.
        console.error(`RLS violation during ${context}:`, err.message);
        return res.status(403).json({ error: 'not permitted for this account' });
    }
    if (err.code === '23503') {
        // foreign_key_violation
        return res.status(400).json({ error: 'referenced record does not exist' });
    }
    console.error(`${context} failed:`, err.message);
    return res.status(500).json({ error: `${context} failed` });
}

module.exports = { handleDbError };
