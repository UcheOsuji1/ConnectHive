-- Prompt 73 structural baseline; included by schema.sql/migrate.js, never auto-run by API.
-- NO CASCADE: billing/audit references deliberately prevent financial history deletion.
CREATE TABLE IF NOT EXISTS billing_accounts (
 user_id UUID PRIMARY KEY REFERENCES users(user_id),
 stripe_account_id TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'verification_pending',
 checked_at TIMESTAMPTZ,
 payouts_resolved BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS hive_monetization (
 hive_id UUID PRIMARY KEY REFERENCES hives(hive_id),
 owner_id UUID NOT NULL REFERENCES users(user_id),
 state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','awaiting_verification','pending_approval','approved','active','paused','closing','closed')),
 monthly_price_cents INTEGER NOT NULL CHECK (monthly_price_cents >= 50),
 currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
 benefits TEXT NOT NULL,
 description TEXT NOT NULL,
 cancellation_policy TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 approved_revision INTEGER,
 approved_by UUID REFERENCES users(user_id),
 review_note TEXT,
 approved_at TIMESTAMPTZ,
 closed_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS billing_subscriptions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(user_id),
 hive_id UUID REFERENCES hives(hive_id),
 kind TEXT NOT NULL CHECK (kind IN ('plus','hive')),
 CHECK ((kind = 'plus' AND hive_id IS NULL) OR (kind = 'hive' AND hive_id IS NOT NULL)),
 stripe_account_id TEXT NOT NULL DEFAULT 'platform',
 stripe_subscription_id TEXT,
 stripe_customer_id TEXT,
 status TEXT NOT NULL DEFAULT 'processing',
 interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month','year')),
 price_cents INTEGER NOT NULL CHECK (price_cents > 0),
 paid_through TIMESTAMPTZ,
 access_until TIMESTAMPTZ,
 cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
 access_revoked BOOLEAN NOT NULL DEFAULT FALSE,
 last_event_created BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(stripe_account_id, stripe_subscription_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_one_open_hive ON billing_subscriptions(user_id,hive_id)
 WHERE kind='hive' AND status NOT IN ('canceled','expired','incomplete_expired','refunded');
CREATE UNIQUE INDEX IF NOT EXISTS billing_one_open_plus ON billing_subscriptions(user_id)
 WHERE kind='plus' AND status NOT IN ('canceled','expired','incomplete_expired','refunded');
CREATE INDEX IF NOT EXISTS billing_subscription_hive ON billing_subscriptions(hive_id,access_until);
CREATE TABLE IF NOT EXISTS billing_checkouts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id),
 stripe_session_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','open','complete','expired')),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '35 minutes',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS billing_events (
 event_id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 event_created BIGINT NOT NULL,
 processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE billing_checkouts ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '35 minutes';
CREATE TABLE IF NOT EXISTS billing_invoices (
 stripe_account_id TEXT NOT NULL,
 stripe_invoice_id TEXT NOT NULL,
 subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id),
 charge_id TEXT,
 amount_paid_cents BIGINT NOT NULL DEFAULT 0,
 platform_fee_cents BIGINT,
 processing_fee_cents BIGINT,
 refunded_cents BIGINT NOT NULL DEFAULT 0,
 paid_through TIMESTAMPTZ,
 hosted_invoice_url TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(stripe_account_id,stripe_invoice_id)
);
CREATE TABLE IF NOT EXISTS billing_disputes (
 stripe_dispute_id TEXT PRIMARY KEY,
 subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id),
 status TEXT NOT NULL,
 amount_cents BIGINT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_invoice_charge ON billing_invoices(stripe_account_id,charge_id);
ALTER TABLE billing_invoices ALTER COLUMN platform_fee_cents DROP NOT NULL;
CREATE TABLE IF NOT EXISTS billing_audit (
 id BIGSERIAL PRIMARY KEY,
 actor_id UUID REFERENCES users(user_id),
 hive_id UUID REFERENCES hives(hive_id),
 action TEXT NOT NULL,
 detail JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS billing_refunds (
 stripe_refund_id TEXT PRIMARY KEY,
 subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id),
 amount_cents BIGINT NOT NULL,
 status TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS billing_refund_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id),
 stripe_invoice_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','resolved')),
 owner_response TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(subscription_id,stripe_invoice_id)
);
CREATE TABLE IF NOT EXISTS billing_tasks (
 id BIGSERIAL PRIMARY KEY,
 subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id),
 action TEXT NOT NULL CHECK(action IN ('cancel_at_period_end')),
 attempts INTEGER NOT NULL DEFAULT 0,
 done_at TIMESTAMPTZ,
 UNIQUE(subscription_id,action)
);
-- Reused by trigger and API so concurrency cannot bypass the product limits.
CREATE OR REPLACE FUNCTION billing_has_plus(uid UUID) RETURNS BOOLEAN AS $$
 SELECT EXISTS(SELECT 1 FROM billing_subscriptions s JOIN users u ON u.user_id=s.user_id WHERE s.user_id=uid AND s.kind='plus'
 AND u.account_status='active' AND s.access_until > NOW() AND NOT s.access_revoked AND s.status NOT IN ('refunded','incomplete_expired'));
$$ LANGUAGE SQL STABLE;
CREATE OR REPLACE FUNCTION billing_hive_create_guard() RETURNS TRIGGER AS $$
DECLARE n INT; plus BOOLEAN;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD.hive_status='active' OR NEW.hive_status<>'active' THEN RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM users WHERE user_id=NEW.creator_user_id FOR UPDATE;
 plus := billing_has_plus(NEW.creator_user_id);
 SELECT COUNT(*) INTO n FROM hives WHERE creator_user_id=NEW.creator_user_id AND hive_status='active' AND hive_id<>NEW.hive_id;
 IF n >= (CASE WHEN plus THEN 3 ELSE 1 END) THEN
   RAISE EXCEPTION 'Active Hive creation limit reached. Free: 1; Plus: 3.' USING ERRCODE='P7301';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS billing_hive_creation_limit ON hives;
CREATE TRIGGER billing_hive_creation_limit BEFORE INSERT OR UPDATE OF hive_status ON hives FOR EACH ROW EXECUTE FUNCTION billing_hive_create_guard();
CREATE OR REPLACE FUNCTION billing_membership_guard() RETURNS TRIGGER AS $$
DECLARE n INT;
BEGIN
 IF NEW.membership_status <> 'active' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
   IF OLD.membership_status='active' AND OLD.hive_id=NEW.hive_id AND OLD.user_id=NEW.user_id THEN RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM users WHERE user_id=NEW.user_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM hive_monetization WHERE hive_id=NEW.hive_id) THEN
   IF NEW.role='owner' THEN RETURN NEW; END IF;
   PERFORM 1 FROM hives WHERE hive_id=NEW.hive_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM hives h WHERE h.hive_id=NEW.hive_id AND h.max_members IS NOT NULL
     AND h.max_members <= (SELECT COUNT(*) FROM hive_members hm WHERE hm.hive_id=NEW.hive_id AND hm.membership_status='active' AND hm.user_id<>NEW.user_id)) THEN
     RAISE EXCEPTION 'Paid Hive capacity reached.' USING ERRCODE='P7304';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM billing_subscriptions WHERE hive_id=NEW.hive_id AND user_id=NEW.user_id
     AND access_until > NOW() AND NOT access_revoked) THEN
     RAISE EXCEPTION 'A verified paid subscription is required.' USING ERRCODE='P7302';
   END IF;
 ELSIF NOT billing_has_plus(NEW.user_id) THEN
   SELECT COUNT(*) INTO n FROM hive_members hm JOIN hives h USING(hive_id)
   WHERE hm.user_id=NEW.user_id AND hm.membership_status='active' AND h.hive_status='active'
     AND hm.hive_id<>NEW.hive_id AND NOT EXISTS(SELECT 1 FROM hive_monetization m WHERE m.hive_id=hm.hive_id);
   IF n>=5 THEN RAISE EXCEPTION 'Free accounts can join up to five free Hives.' USING ERRCODE='P7303'; END IF;
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS billing_membership_limit ON hive_members;
CREATE TRIGGER billing_membership_limit BEFORE INSERT OR UPDATE ON hive_members FOR EACH ROW EXECUTE FUNCTION billing_membership_guard();
CREATE OR REPLACE FUNCTION billing_capacity_guard() RETURNS TRIGGER AS $$
DECLARE used INT;
BEGIN
 IF NEW.max_members IS NULL OR NOT EXISTS(SELECT 1 FROM hive_monetization WHERE hive_id=NEW.hive_id) THEN RETURN NEW; END IF;
 SELECT COUNT(*) INTO used FROM hive_members WHERE hive_id=NEW.hive_id AND membership_status='active';
 SELECT used + COUNT(DISTINCT s.id) INTO used FROM billing_subscriptions s JOIN billing_checkouts c ON c.subscription_id=s.id
 WHERE s.hive_id=NEW.hive_id AND ((c.status IN ('creating','open') AND c.expires_at>NOW()) OR (c.status='complete' AND s.status IN ('processing','incomplete')))
 AND NOT EXISTS(SELECT 1 FROM hive_members hm WHERE hm.hive_id=s.hive_id AND hm.user_id=s.user_id AND hm.membership_status='active');
 IF NEW.max_members < used THEN RAISE EXCEPTION 'Capacity cannot be below active members and reserved paid memberships.' USING ERRCODE='P7304'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS billing_reserved_capacity ON hives;
CREATE TRIGGER billing_reserved_capacity BEFORE UPDATE OF max_members ON hives FOR EACH ROW EXECUTE FUNCTION billing_capacity_guard();
