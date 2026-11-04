-- Only signature-verified, sandbox, destination-validated webhook envelopes enter here.
CREATE TABLE IF NOT EXISTS billing_event_inbox (
  event_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claim_token UUID,
  lease_until TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_error_code TEXT,
  CHECK (payload->>'id'=event_id AND payload->>'livemode'='false'),
  CHECK (COALESCE(payload->>'account','platform')=account_id)
);
CREATE INDEX IF NOT EXISTS billing_event_inbox_due ON billing_event_inbox(next_attempt_at)
  WHERE processed_at IS NULL AND failed_at IS NULL;
