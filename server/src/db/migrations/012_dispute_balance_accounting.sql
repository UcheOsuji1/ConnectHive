-- Unknown historical balances remain NULL until retrieved from Stripe.
ALTER TABLE billing_disputes ADD COLUMN IF NOT EXISTS balance_amount_cents BIGINT;
ALTER TABLE billing_disputes ADD COLUMN IF NOT EXISTS balance_fee_cents BIGINT;
ALTER TABLE billing_disputes ADD COLUMN IF NOT EXISTS balance_net_cents BIGINT;
ALTER TABLE billing_disputes ADD COLUMN IF NOT EXISTS balance_transactions JSONB;
ALTER TABLE billing_disputes ADD COLUMN IF NOT EXISTS balance_checked_at TIMESTAMPTZ;
