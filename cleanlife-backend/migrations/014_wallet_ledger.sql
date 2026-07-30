-- [WALLET-01] Real wallet/ledger: balances on both clients and collectors,
-- an append-only transaction history, and one SECURITY DEFINER function
-- that keeps the balance update and the transaction row atomic (avoids the
-- classic bug of a transaction being recorded but the balance not matching,
-- or vice versa, under concurrent requests).

CREATE TYPE owner_type_enum AS ENUM ('client', 'collector');
CREATE TYPE wallet_tx_type_enum AS ENUM ('pickup_payment', 'job_earnings', 'withdraw', 'top_up', 'referral_bonus');
CREATE TYPE wallet_tx_status_enum AS ENUM ('completed', 'pending', 'failed');
CREATE TYPE currency_enum AS ENUM ('FCFA', 'USD', 'EUR');

ALTER TABLE clients ADD COLUMN balance DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE collectors ADD COLUMN balance DECIMAL(12,2) NOT NULL DEFAULT 0;

-- [PRICE-01] ASSUMPTION FLAGGED: no pricing rule exists anywhere in the SRS.
-- Using a flat rate (500 FCFA/bag) captured at request creation, purely so
-- the wallet has a real number to credit collectors with. This needs a real
-- pricing model from the product owner before going anywhere near production.
ALTER TABLE pickup_requests ADD COLUMN estimated_price_fcfa DECIMAL(10,2) NULL;

CREATE TABLE wallet_transactions (
    id                          SERIAL PRIMARY KEY,
    owner_type                  owner_type_enum NOT NULL,
    owner_id                    INTEGER NOT NULL,
    type                        wallet_tx_type_enum NOT NULL,
    amount                      DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    currency                    currency_enum NOT NULL DEFAULT 'FCFA',
    status                      wallet_tx_status_enum NOT NULL DEFAULT 'completed',
    description                 TEXT NULL,
    reference_pickup_request_id INTEGER NULL REFERENCES pickup_requests(id),
    created_at                  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_tx_owner ON wallet_transactions(owner_type, owner_id);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_tx_select ON wallet_transactions
    FOR SELECT
    USING (
        CASE owner_type
            WHEN 'client' THEN owner_id IN (
                SELECT id FROM clients
                WHERE CASE WHEN current_tenant() = 'public' THEN company_id IS NULL ELSE company_id = current_tenant()::integer END
            )
            WHEN 'collector' THEN owner_id IN (
                SELECT id FROM collectors
                WHERE CASE WHEN current_tenant() = 'public' THEN company_id IS NULL ELSE company_id = current_tenant()::integer END
            )
        END
    );
-- No direct INSERT/UPDATE policy — all writes go through the function below,
-- which is the only path that keeps the ledger and the balance consistent.

-- [WALLET-02] The one and only way to move money. Validates withdrawals
-- can't overdraw, and returns the resulting balance so the caller doesn't
-- need a second round-trip.
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
        SELECT balance INTO v_current_balance FROM clients WHERE id = p_owner_id FOR UPDATE;
    ELSIF p_owner_type = 'collector' THEN
        SELECT balance INTO v_current_balance FROM collectors WHERE id = p_owner_id FOR UPDATE;
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
        UPDATE clients SET balance = v_new_balance WHERE id = p_owner_id;
    ELSE
        UPDATE collectors SET balance = v_new_balance WHERE id = p_owner_id;
    END IF;

    INSERT INTO wallet_transactions (owner_type, owner_id, type, amount, description, reference_pickup_request_id)
    VALUES (p_owner_type::owner_type_enum, p_owner_id, p_type::wallet_tx_type_enum, p_amount, p_description, p_reference_pickup_request_id)
    RETURNING wallet_transactions.id INTO v_id;

    RETURN QUERY SELECT v_id, v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION create_wallet_transaction(TEXT, INTEGER, TEXT, DECIMAL, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_wallet_transaction(TEXT, INTEGER, TEXT, DECIMAL, TEXT, INTEGER) TO app_user;
