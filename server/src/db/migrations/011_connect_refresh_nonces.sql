CREATE TABLE IF NOT EXISTS billing_connect_refresh_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS billing_connect_refresh_nonces_expiry ON billing_connect_refresh_nonces(expires_at);
