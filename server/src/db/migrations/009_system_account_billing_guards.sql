-- System account admission exemptions. Keep functions in sync with billing.sql.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION billing_hive_create_guard() RETURNS TRIGGER AS $$
DECLARE n INT; plus BOOLEAN;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD.hive_status='active' OR NEW.hive_status<>'active' THEN RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM users WHERE user_id=NEW.creator_user_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM users WHERE user_id=NEW.creator_user_id AND is_system) THEN RETURN NEW; END IF;
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
 -- Only the joining account is exempt. Seed Hive joins still count for real users.
 IF EXISTS(SELECT 1 FROM users WHERE user_id=NEW.user_id AND is_system) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM hive_monetization WHERE hive_id=NEW.hive_id) THEN
   IF NEW.role='owner' THEN RETURN NEW; END IF;
   PERFORM 1 FROM hives WHERE hive_id=NEW.hive_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM hives h WHERE h.hive_id=NEW.hive_id AND h.max_members IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM users WHERE user_id=h.creator_user_id AND is_system)
     AND h.max_members <= (SELECT COUNT(*) FROM hive_members hm JOIN users u USING(user_id) WHERE hm.hive_id=NEW.hive_id AND hm.membership_status='active' AND hm.user_id<>NEW.user_id AND NOT u.is_system)) THEN
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
 IF EXISTS(SELECT 1 FROM users WHERE user_id=NEW.creator_user_id AND is_system) THEN RETURN NEW; END IF;
 IF NEW.max_members IS NULL OR NOT EXISTS(SELECT 1 FROM hive_monetization WHERE hive_id=NEW.hive_id) THEN RETURN NEW; END IF;
 SELECT COUNT(*) INTO used FROM hive_members hm JOIN users u USING(user_id) WHERE hm.hive_id=NEW.hive_id AND hm.membership_status='active' AND NOT u.is_system;
 SELECT used + COUNT(DISTINCT s.id) INTO used FROM billing_subscriptions s JOIN billing_checkouts c ON c.subscription_id=s.id
 WHERE s.hive_id=NEW.hive_id AND ((c.status IN ('creating','open') AND c.expires_at>NOW()) OR (c.status='complete' AND s.status IN ('processing','incomplete')))
 AND NOT EXISTS(SELECT 1 FROM users WHERE user_id=s.user_id AND is_system)
 AND NOT EXISTS(SELECT 1 FROM hive_members hm WHERE hm.hive_id=s.hive_id AND hm.user_id=s.user_id AND hm.membership_status='active');
 IF NEW.max_members < used THEN RAISE EXCEPTION 'Capacity cannot be below active members and reserved paid memberships.' USING ERRCODE='P7304'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS billing_reserved_capacity ON hives;
CREATE TRIGGER billing_reserved_capacity BEFORE UPDATE OF max_members ON hives FOR EACH ROW EXECUTE FUNCTION billing_capacity_guard();
