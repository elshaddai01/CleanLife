-- [WALLET-07] Bug: RETURNS TABLE(id INTEGER, new_balance DECIMAL) implicitly
-- declares plpgsql variables named `id` and `new_balance` in scope for the
-- whole function body. The WHERE clauses used bare `id = p_owner_id`,
-- which Postgres couldn't tell apart from the OUT variable `id` —
-- "column reference id is ambiguous". Fix: qualify every column reference.

CREATE OR REPLACE FUNCTION create_wallet_transaction(
    p_owner_type TEXT,
    p_owner_id INTEGER,
    p_type TEXT,
    p_amount DECIMAL,
    p_description TEXT,
    p_reference_pickup_request_id INTEGER
)
RETURNS TABLE (id INTEGER, new_balance DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id INTEGER;
    v_delta DECIMAL;
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be positive';
    END IF;

    IF p_type IN ('top_up', 'job_earnings', 'referral_bonus') THEN
        v_delta := p_amount;
    ELSIF p_type IN ('withdraw', 'pickup_payment') THEN
        v_delta := -p_amount;
    ELSE
        RAISE EXCEPTION 'invalid wallet transaction type: %', p_type;
    END IF;

    IF p_owner_type = 'client' THEN
        SELECT clients.balance INTO v_current_balance FROM clients WHERE clients.id = p_owner_id FOR UPDATE;
    ELSIF p_owner_type = 'collector' THEN
        SELECT collectors.balance INTO v_current_balance FROM collectors WHERE collectors.id = p_owner_id FOR UPDATE;
    ELSE
        RAISE EXCEPTION 'invalid owner_type: %', p_owner_type;
    END IF;

    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'owner not found';
    END IF;

    IF v_delta < 0 AND (v_current_balance + v_delta) < 0 THEN
        RAISE EXCEPTION 'insufficient balance';
    END IF;

    v_new_balance := v_current_balance + v_delta;

    IF p_owner_type = 'client' THEN
        UPDATE clients SET balance = v_new_balance WHERE clients.id = p_owner_id;
    ELSE
        UPDATE collectors SET balance = v_new_balance WHERE collectors.id = p_owner_id;
    END IF;

    INSERT INTO wallet_transactions (owner_type, owner_id, type, amount, description, reference_pickup_request_id)
    VALUES (p_owner_type::owner_type_enum, p_owner_id, p_type::wallet_tx_type_enum, p_amount, p_description, p_reference_pickup_request_id)
    RETURNING wallet_transactions.id INTO v_id;

    RETURN QUERY SELECT v_id, v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION create_wallet_transaction(TEXT, INTEGER, TEXT, DECIMAL, TEXT, INTEGER) TO app_user;
