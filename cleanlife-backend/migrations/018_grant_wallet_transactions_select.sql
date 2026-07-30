-- [WALLET-08] Bug: migration 014 created RLS policies on wallet_transactions
-- but never granted app_user base SELECT privilege on the table itself.
-- RLS restricts on top of an existing grant — it doesn't substitute for one.
-- Every read failed with "permission denied" (42501), caught by the shared
-- error handler and shown as "not permitted for this account", which looked
-- exactly like an RLS violation but was actually a missing GRANT.
GRANT SELECT ON wallet_transactions TO app_user;
GRANT USAGE, SELECT ON SEQUENCE wallet_transactions_id_seq TO app_user;
