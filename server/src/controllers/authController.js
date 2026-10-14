import bcrypt       from 'bcryptjs';
import jwt           from 'jsonwebtoken';
import crypto        from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { query, getClient } from '../db/index.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAccountDeletionEmail,
} from '../lib/email.js';
import { invalidateTokenVersion } from '../middleware/auth.js';
import { disconnectUserSockets }  from '../realtime/socket.js';
import { POLICY_VERSION, MIN_AGE, ageFromDob } from '../lib/policy.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SALT_ROUNDS = 10;
const JWT_EXPIRY  = '7d';
const COOKIE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

const isProd       = process.env.NODE_ENV === 'production';
const CLIENT_URL   = process.env.CLIENT_URL;

// sameSite is 'lax' in every environment — the API is first-party at
// api.truehive.app (same site as truehive.app), so it doesn't need 'none'.
// 'none' was only ever needed for a cross-site API origin, and iOS Safari
// in particular refuses cross-site SameSite=None cookies in several cases.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure:   isProd,
  maxAge:   COOKIE_TTL,
  path:     '/',
};

// Short-lived cookie used only during the OAuth redirect round-trip.
const STATE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure:   isProd,
  maxAge:   10 * 60 * 1000, // 10 minutes
  path:     '/',
};

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function signToken(userId, tokenVersion) {
  return jwt.sign({ userId, tokenVersion }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// A login while account_status = 'pending_deletion' cancels the deletion —
// the account and any solo-owned Hives it soft-deleted come back. Only Hives
// deleted by THIS deletion event are restored (deleted_at >= the moment this
// deletion was requested), so a Hive the user deleted independently via
// deleteHive, before ever requesting account deletion, is never touched.
async function _cancelPendingDeletionIfAny(userId) {
  const { rows: [u] } = await query(
    `SELECT account_status, deletion_requested_at FROM users WHERE user_id = $1`,
    [userId],
  );
  if (!u || u.account_status !== 'pending_deletion') return;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE hives
          SET hive_status = 'active', deleted_at = NULL, deleted_by = NULL, purge_after = NULL, updated_at = NOW()
        WHERE deleted_by = $1 AND hive_status = 'deleted' AND deleted_at >= $2`,
      [userId, u.deletion_requested_at],
    );
    await client.query(
      `UPDATE users
          SET account_status = 'active', deletion_requested_at = NULL, deletion_scheduled_for = NULL
        WHERE user_id = $1`,
      [userId],
    );
    await client.query('COMMIT');
    console.log(`[auth] login cancelled pending deletion for user ${userId} — account and any solo-owned Hives restored.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[auth/_cancelPendingDeletionIfAny]', err);
    throw err;
  } finally {
    client.release();
  }
}

async function _createVerificationToken(userId) {
  const rawToken  = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await query('DELETE FROM auth_tokens WHERE user_id = $1 AND type = $2', [userId, 'email_verification']);
  await query(
    `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
     VALUES ($1, 'email_verification', $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
  return rawToken;
}

// ── register ──────────────────────────────────────────────────────────────────

export async function register(req, res) {
  try {
    const { email, password, acceptedTerms, dateOfBirth, newsOptIn } = req.body ?? {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!acceptedTerms) {
      return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy.' });
    }
    if (!dateOfBirth) {
      return res.status(400).json({ error: 'Date of birth is required.' });
    }
    const age = ageFromDob(dateOfBirth);
    if (isNaN(age) || age < MIN_AGE) {
      return res.status(400).json({ error: `You must be at least ${MIN_AGE} years old to create an account.` });
    }

    const existing = await query('SELECT user_id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // newsOptIn is opt-in only — the checkbox is never pre-ticked (S2), so a
    // missing/false value here just leaves email_news at its schema default
    // (false) with no opted_in_at, same as never touching this at all.
    const newsOptInBool = newsOptIn === true;
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, date_of_birth, terms_accepted_at, terms_policy_version,
                           email_news, email_news_opted_in_at)
       VALUES ($1, $2, $3, NOW(), $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END)
       RETURNING user_id, email, account_status, created_at, member_id, token_version`,
      [email.toLowerCase(), passwordHash, dateOfBirth, POLICY_VERSION, newsOptInBool],
    );
    const user = rows[0];

    // Send verification email (non-blocking — registration succeeds either way)
    _createVerificationToken(user.user_id)
      .then(rawToken => sendVerificationEmail(user.email, rawToken))
      .catch(e => console.error('[auth/register] verification email failed:', e.message));

    const token = signToken(user.user_id, user.token_version);
    res.cookie('token', token, COOKIE_OPTS);

    return res.status(201).json({
      user: {
        userId:        user.user_id,
        email:         user.email,
        accountStatus: user.account_status,
        createdAt:     user.created_at,
        memberId:      user.member_id,
        emailVerified: false,
      },
    });
  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Registration failed — please try again.' });
  }
}

// ── login ─────────────────────────────────────────────────────────────────────

export async function login(req, res) {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await query(
      `SELECT user_id, email, password_hash, account_status, token_version
       FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );
    const user = rows[0];

    const INVALID = 'Invalid credentials.';
    if (!user) return res.status(401).json({ error: INVALID });

    // Google-only accounts have no password — must not be able to log in here.
    if (!user.password_hash) return res.status(401).json({ error: INVALID });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: INVALID });

    if (user.account_status === 'suspended') {
      return res.status(403).json({ error: 'Your account is suspended. Contact hello@truehive.app.' });
    }

    await _cancelPendingDeletionIfAny(user.user_id);
    if (user.account_status === 'pending_deletion') user.account_status = 'active';

    query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id])
      .catch(e => console.error('[auth/login] last_login update failed:', e.message));

    const token = signToken(user.user_id, user.token_version);
    res.cookie('token', token, COOKIE_OPTS);

    return res.json({
      user: {
        userId:        user.user_id,
        email:         user.email,
        accountStatus: user.account_status,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Login failed — please try again.' });
  }
}

// ── logout ────────────────────────────────────────────────────────────────────

export async function logout(req, res) {
  // Invalidate all existing sessions for this user by bumping token_version.
  const raw = req.cookies?.token;
  if (raw) {
    try {
      const payload = jwt.verify(raw, process.env.JWT_SECRET);
      const userId = payload.userId;
      // Clear cache immediately so the 30s window doesn't shelter the old token.
      invalidateTokenVersion(userId);
      // Disconnect any open sockets for this user.
      disconnectUserSockets(userId);
      query('UPDATE users SET token_version = token_version + 1 WHERE user_id = $1', [userId])
        .catch(e => console.error('[auth/logout] version bump failed:', e.message));
    } catch { /* expired/invalid token — no bump needed */ }
  }
  // Reuse COOKIE_OPTS directly — a clearCookie with options that don't match
  // the cookie's original attributes silently fails to clear it.
  res.clearCookie('token', COOKIE_OPTS);
  return res.json({ message: 'Logged out.' });
}

// ── getMe ─────────────────────────────────────────────────────────────────────

export async function getMe(req, res) {
  try {
    const userId = req.userId;

    const userResult = await query(
      `SELECT user_id, email, account_status, created_at, member_id, email_verified
       FROM users WHERE user_id = $1`,
      [userId],
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userResult.rows[0];

    const profileResult = await query(
      'SELECT profile_id, full_name, profile_photo_url FROM profiles WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    const profile = profileResult.rows[0];

    const hiveResult = await query(
      `SELECT hive_member_id FROM hive_members
       WHERE user_id = $1 AND membership_status = 'active'
       LIMIT 1`,
      [userId],
    );

    const googleResult = await query(
      `SELECT id FROM auth_identities WHERE user_id = $1 AND provider = 'google' LIMIT 1`,
      [userId],
    );

    return res.json({
      user: {
        userId:          user.user_id,
        email:           user.email,
        accountStatus:   user.account_status,
        createdAt:       user.created_at,
        memberId:        user.member_id,
        emailVerified:   user.email_verified,
        hasProfile:      Boolean(profile),
        hasActiveHive:   hiveResult.rows.length > 0,
        fullName:        profile?.full_name         ?? null,
        profilePhotoUrl: profile?.profile_photo_url ?? null,
        hasGoogle:       googleResult.rows.length > 0,
      },
    });
  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

export function googleRedirect(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, STATE_COOKIE_OPTS);

  // Only the literal value is ever accepted — never a URL. Accepting an
  // arbitrary redirect target from a query string here would be an open
  // redirect the moment googleCallback trusted it back.
  if (req.query?.intent === 'confirm-delete') {
    res.cookie('oauth_intent', 'confirm-delete', STATE_COOKIE_OPTS);
  }

  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope:       ['openid', 'email', 'profile'],
    state,
  });
  return res.redirect(url);
}

export async function googleCallback(req, res) {
  const { code, state } = req.query;
  const storedState     = req.cookies?.oauth_state;

  // CSRF guard — reject if state param is absent or doesn't match the cookie.
  if (!state || !storedState || state !== storedState) {
    return res.redirect(`${CLIENT_URL}/login?error=oauth_state_mismatch`);
  }
  res.clearCookie('oauth_state', { ...STATE_COOKIE_OPTS, maxAge: 0 });

  // Read and clear unconditionally — whatever happens next, this single-use
  // cookie doesn't survive the round trip either way.
  const confirmDelete = req.cookies?.oauth_intent === 'confirm-delete';
  res.clearCookie('oauth_intent', { ...STATE_COOKIE_OPTS, maxAge: 0 });
  const postLoginUrl = confirmDelete ? `${CLIENT_URL}/settings?confirmDelete=1` : `${CLIENT_URL}/home`;

  try {
    const { tokens } = await googleClient.getToken(code);

    const ticket = await googleClient.verifyIdToken({
      idToken:  tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const gPayload = ticket.getPayload();

    // CRITICAL: the server never trusts email from the browser.
    // We read it from Google's verified response only.
    // Never match an existing account by email unless the provider asserts it is verified.
    if (!gPayload.email_verified) {
      return res.redirect(`${CLIENT_URL}/login?error=google_email_unverified`);
    }

    const googleId = gPayload.sub;
    const email    = gPayload.email.toLowerCase();
    const name     = gPayload.name ?? null;

    // 1. This Google account already linked to a TrueHive account?
    const { rows: identityRows } = await query(
      `SELECT u.user_id, u.token_version, u.account_status
       FROM auth_identities ai
       JOIN users u ON u.user_id = ai.user_id
       WHERE ai.provider = 'google' AND ai.provider_user_id = $1`,
      [googleId],
    );

    if (identityRows.length > 0 && identityRows[0].account_status === 'suspended') {
      return res.redirect(`${CLIENT_URL}/login?error=account_suspended`);
    }

    if (identityRows.length > 0) {
      const { user_id, token_version } = identityRows[0];
      await _cancelPendingDeletionIfAny(user_id);
      query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user_id]).catch(() => {});
      const jwtToken = signToken(user_id, token_version);
      res.cookie('token', jwtToken, COOKIE_OPTS);
      return res.redirect(postLoginUrl);
    }

    // 2. Does a TrueHive account with this email already exist?
    const { rows: userRows } = await query(
      'SELECT user_id, token_version, account_status FROM users WHERE email = $1',
      [email],
    );

    if (userRows.length > 0 && userRows[0].account_status === 'suspended') {
      return res.redirect(`${CLIENT_URL}/login?error=account_suspended`);
    }

    let userId;
    let tokenVersion;

    if (userRows.length > 0) {
      // Link Google identity to the existing account.
      userId       = userRows[0].user_id;
      tokenVersion = userRows[0].token_version;
      await _cancelPendingDeletionIfAny(userId);
      await query(
        `INSERT INTO auth_identities (user_id, provider, provider_user_id, email)
         VALUES ($1, 'google', $2, $3)
         ON CONFLICT (provider, provider_user_id) DO NOTHING`,
        [userId, googleId, email],
      );
      // Google verified the email — mark it verified in our DB too.
      await query(
        'UPDATE users SET email_verified = TRUE, last_login = NOW() WHERE user_id = $1',
        [userId],
      );
    } else {
      // 3. No existing account — create one (no password, email pre-verified).
      // Consent is recorded here because the "Sign up with Google" button on the
      // signup page is gated behind the Terms checkbox (client-side). The consent
      // timestamp and policy version are stored so the record exists server-side.
      const { rows: [newUser] } = await query(
        `INSERT INTO users (email, password_hash, email_verified, terms_accepted_at, terms_policy_version)
         VALUES ($1, NULL, TRUE, NOW(), $2)
         RETURNING user_id, token_version`,
        [email, POLICY_VERSION],
      );
      userId       = newUser.user_id;
      tokenVersion = newUser.token_version;

      await query(
        `INSERT INTO auth_identities (user_id, provider, provider_user_id, email)
         VALUES ($1, 'google', $2, $3)`,
        [userId, googleId, email],
      );

      // Pre-fill profile with name from Google.
      if (name) {
        await query(
          'INSERT INTO profiles (user_id, full_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, name],
        );
      }
    }

    const jwtToken = signToken(userId, tokenVersion);
    res.cookie('token', jwtToken, COOKIE_OPTS);
    return res.redirect(postLoginUrl);

  } catch (err) {
    console.error('[auth/googleCallback]', err);
    return res.redirect(`${CLIENT_URL}/login?error=oauth_failed`);
  }
}

// ── Email verification ────────────────────────────────────────────────────────

export async function resendVerification(req, res) {
  try {
    const { rows } = await query(
      'SELECT email, email_verified FROM users WHERE user_id = $1',
      [req.userId],
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    if (rows[0].email_verified) return res.json({ message: 'Email already verified.' });

    const rawToken = await _createVerificationToken(req.userId);
    sendVerificationEmail(rows[0].email, rawToken)
      .catch(e => console.error('[auth/resendVerification] email failed:', e.message));

    return res.json({ message: 'Verification email sent.' });
  } catch (err) {
    console.error('[auth/resendVerification]', err);
    return res.status(500).json({ error: 'Failed to send verification email.' });
  }
}

export async function verifyEmail(req, res) {
  try {
    const { token: rawToken } = req.body ?? {};
    if (!rawToken) return res.status(400).json({ error: 'Token is required.' });

    const tokenHash = hashToken(rawToken);
    const { rows } = await query(
      `SELECT id, user_id, used_at, expires_at
       FROM auth_tokens
       WHERE token_hash = $1 AND type = 'email_verification'`,
      [tokenHash],
    );

    if (!rows.length || rows[0].used_at || new Date(rows[0].expires_at) < new Date()) {
      return res.status(400).json({ error: 'This verification link is invalid or has expired.' });
    }

    const { id: tokenId, user_id: userId } = rows[0];
    await Promise.all([
      query('UPDATE auth_tokens SET used_at = NOW() WHERE id = $1', [tokenId]),
      query('UPDATE users SET email_verified = TRUE WHERE user_id = $1', [userId]),
    ]);

    return res.json({ message: 'Email verified.' });
  } catch (err) {
    console.error('[auth/verifyEmail]', err);
    return res.status(500).json({ error: 'Verification failed — please try again.' });
  }
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function forgotPassword(req, res) {
  const RESPONSE = { message: 'If an account with that email exists, a reset link has been sent.' };
  const { email } = req.body ?? {};

  // Respond immediately — uniform response time prevents user-existence enumeration
  // regardless of whether the email is registered or not.
  res.json(RESPONSE);

  if (!email || !isValidEmail(email)) return;

  // Token work happens asynchronously after the response is already sent.
  try {
    const { rows } = await query(
      'SELECT user_id FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    if (rows.length > 0) {
      const userId    = rows[0].user_id;
      const rawToken  = generateToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await query('DELETE FROM auth_tokens WHERE user_id = $1 AND type = $2', [userId, 'password_reset']);
      await query(
        `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
         VALUES ($1, 'password_reset', $2, $3)`,
        [userId, tokenHash, expiresAt],
      );

      sendPasswordResetEmail(email.toLowerCase(), rawToken)
        .catch(e => console.error('[auth/forgotPassword] email failed:', e.message));
    }
  } catch (err) {
    console.error('[auth/forgotPassword]', err);
  }
}

export async function resetPassword(req, res) {
  try {
    const { token: rawToken, password } = req.body ?? {};

    if (!rawToken || !password || password.length < 8) {
      return res.status(400).json({ error: 'Token and a password of at least 8 characters are required.' });
    }

    const tokenHash = hashToken(rawToken);
    // Join users to get email for the post-reset notification.
    const { rows } = await query(
      `SELECT at.id, at.user_id, at.used_at, at.expires_at, u.email
       FROM auth_tokens at
       JOIN users u ON u.user_id = at.user_id
       WHERE at.token_hash = $1 AND at.type = 'password_reset'`,
      [tokenHash],
    );

    if (!rows.length || rows[0].used_at || new Date(rows[0].expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const { id: tokenId, user_id: userId, email } = rows[0];
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Mark token used + update password + invalidate all sessions via token_version bump.
    await Promise.all([
      query('UPDATE auth_tokens SET used_at = NOW() WHERE id = $1', [tokenId]),
      query(
        'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE user_id = $2',
        [passwordHash, userId],
      ),
    ]);

    // Clear cache immediately and disconnect all open sockets for this user.
    invalidateTokenVersion(userId);
    disconnectUserSockets(userId);

    // Notify the account owner that their password changed (non-blocking).
    sendPasswordChangedEmail(email)
      .catch(e => console.error('[auth/resetPassword] notification email failed:', e.message));

    return res.json({ message: 'Password updated. Please log in with your new password.' });
  } catch (err) {
    console.error('[auth/resetPassword]', err);
    return res.status(500).json({ error: 'Password reset failed — please try again.' });
  }
}

// ── Account deletion ──────────────────────────────────────────────────────────

const ACCOUNT_PURGE_GRACE_DAYS = 30;
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

function _isLoginFresh(lastLogin) {
  return Boolean(lastLogin) && (Date.now() - new Date(lastLogin).getTime()) < REAUTH_WINDOW_MS;
}

// Hives this user owns with no other active member — these get soft-deleted
// alongside the account, the same way leaveHive archives a sole owner's Hive.
async function _soloOwnedHives(userId) {
  const { rows } = await query(
    `SELECT h.hive_id, h.hive_name
       FROM hive_members hm
       JOIN hives h ON h.hive_id = hm.hive_id AND h.hive_status = 'active'
      WHERE hm.user_id = $1 AND hm.role = 'owner' AND hm.membership_status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM hive_members hm2
           WHERE hm2.hive_id = h.hive_id AND hm2.user_id != $1 AND hm2.membership_status = 'active'
        )`,
    [userId],
  );
  return rows;
}

// Hives this user owns WITH other active members — account deletion refuses
// to silently empty-out a community of other people as a side effect of one
// person leaving. They must transfer ownership or delete the Hive themselves
// (deleteHive) first.
async function _ownershipBlockers(userId) {
  const { rows } = await query(
    `SELECT h.hive_id, h.hive_name,
            COUNT(*) FILTER (WHERE hm2.user_id != $1)::int AS other_members
       FROM hive_members hm
       JOIN hives h ON h.hive_id = hm.hive_id AND h.hive_status = 'active'
       JOIN hive_members hm2 ON hm2.hive_id = hm.hive_id AND hm2.membership_status = 'active'
      WHERE hm.user_id = $1 AND hm.role = 'owner' AND hm.membership_status = 'active'
      GROUP BY h.hive_id, h.hive_name
     HAVING COUNT(*) FILTER (WHERE hm2.user_id != $1) > 0`,
    [userId],
  );
  return rows;
}

export async function getDeletionCheck(req, res) {
  try {
    const userId = req.userId;
    const { rows: [user] } = await query(
      `SELECT password_hash, last_login FROM users WHERE user_id = $1`,
      [userId],
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const [blockers, soloOwnedHives] = await Promise.all([
      _ownershipBlockers(userId),
      _soloOwnedHives(userId),
    ]);

    const reauthRequired = _isLoginFresh(user.last_login) ? null : (user.password_hash ? 'password' : 'google');

    res.json({ blockers, soloOwnedHives, reauthRequired, canDelete: blockers.length === 0 });
  } catch (err) {
    console.error('[auth/getDeletionCheck]', err);
    res.status(500).json({ error: 'Failed to check deletion eligibility.' });
  }
}

export async function deleteAccount(req, res) {
  try {
    const userId = req.userId;
    const { password } = req.body ?? {};

    const { rows: [user] } = await query(
      `SELECT email, password_hash, last_login, account_status FROM users WHERE user_id = $1`,
      [userId],
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.account_status === 'pending_deletion') {
      return res.status(400).json({ error: 'Your account is already scheduled for deletion.' });
    }

    if (!_isLoginFresh(user.last_login)) {
      if (user.password_hash) {
        if (!password) {
          return res.status(403).json({ error: 'Confirm your password to continue.', reauth: 'password' });
        }
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(403).json({ error: 'Incorrect password.', reauth: 'password' });
      } else {
        return res.status(403).json({ error: 'Please sign in again with Google to continue.', reauth: 'google' });
      }
    }

    const blockers = await _ownershipBlockers(userId);
    if (blockers.length) {
      return res.status(400).json({
        error: 'Transfer ownership or delete these Hives before deleting your account.',
        blockers,
      });
    }

    const soloHives = await _soloOwnedHives(userId);
    const scheduledFor = new Date(Date.now() + ACCOUNT_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);

    const client = await getClient();
    try {
      await client.query('BEGIN');
      for (const h of soloHives) {
        await client.query(
          `UPDATE hives
              SET hive_status = 'deleted', deleted_at = NOW(), deleted_by = $2,
                  purge_after = NOW() + INTERVAL '${ACCOUNT_PURGE_GRACE_DAYS} days', updated_at = NOW()
            WHERE hive_id = $1`,
          [h.hive_id, userId],
        );
      }
      await client.query(
        `UPDATE users
            SET account_status = 'pending_deletion', deletion_requested_at = NOW(),
                deletion_scheduled_for = NOW() + INTERVAL '${ACCOUNT_PURGE_GRACE_DAYS} days',
                token_version = token_version + 1
          WHERE user_id = $1`,
        [userId],
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    invalidateTokenVersion(userId);
    disconnectUserSockets(userId);
    res.clearCookie('token', COOKIE_OPTS);

    sendAccountDeletionEmail(user.email, scheduledFor)
      .catch(e => console.error('[auth/deleteAccount] email failed:', e.message));

    res.json({ deleted: true, scheduledFor, soloHivesDeleted: soloHives.length });
  } catch (err) {
    console.error('[auth/deleteAccount]', err);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
}

// ── Consent (18+ age floor closure, POLICY_VERSION v2) ───────────────────────
// Closes requireConsent's gate for an account missing date_of_birth (every
// pre-existing account, plus every Google signup — OAuth never asked for a
// birth date) or still on an older terms_policy_version.
export async function submitConsent(req, res) {
  try {
    const { dateOfBirth, acceptedTerms, newsOptIn } = req.body ?? {};
    if (!dateOfBirth) {
      return res.status(400).json({ error: 'Date of birth is required.' });
    }
    if (!acceptedTerms) {
      return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy.' });
    }
    const age = ageFromDob(dateOfBirth);
    if (isNaN(age) || age < MIN_AGE) {
      return res.status(400).json({ error: `You must be at least ${MIN_AGE} years old to use TrueHive.` });
    }

    await query(
      `UPDATE users SET date_of_birth = $2, terms_accepted_at = NOW(), terms_policy_version = $3
        WHERE user_id = $1`,
      [req.userId, dateOfBirth, POLICY_VERSION],
    );

    // Same opt-in-only rule as register — only ever flips email_news TRUE
    // here (never clears it), so resubmitting this form with the box
    // unticked can't silently undo an opt-in made elsewhere (Settings).
    if (newsOptIn === true) {
      await query(
        `UPDATE users SET email_news = TRUE, email_news_opted_in_at = NOW() WHERE user_id = $1`,
        [req.userId],
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/submitConsent]', err);
    res.status(500).json({ error: 'Failed to save your details.' });
  }
}

// ── Email preferences (S1) ───────────────────────────────────────────────────
// Joining/digest/news flags, read and written from Account & Settings.
// Turning news on stamps email_news_opted_in_at; turning it off clears the
// flag but deliberately leaves that timestamp in place as a log of when the
// opt-in happened, and logs the opt-out loudly for the same reason.
export async function getEmailPrefs(req, res) {
  try {
    const { rows: [row] } = await query(
      `SELECT email_joins, email_digest, email_news FROM users WHERE user_id = $1`,
      [req.userId],
    );
    if (!row) return res.status(404).json({ error: 'User not found.' });
    res.json({
      prefs: {
        emailJoins:  row.email_joins,
        emailDigest: row.email_digest,
        emailNews:   row.email_news,
      },
    });
  } catch (err) {
    console.error('[auth/getEmailPrefs]', err);
    res.status(500).json({ error: 'Failed to load your email preferences.' });
  }
}

const EMAIL_PREF_FIELDS = { emailJoins: 'email_joins', emailDigest: 'email_digest', emailNews: 'email_news' };

export async function updateEmailPrefs(req, res) {
  try {
    const updates = {};
    for (const [bodyKey, column] of Object.entries(EMAIL_PREF_FIELDS)) {
      if (typeof req.body?.[bodyKey] === 'boolean') updates[column] = req.body[bodyKey];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    if ('email_news' in updates) {
      const { rows: [before] } = await query(`SELECT email_news FROM users WHERE user_id = $1`, [req.userId]);
      if (before?.email_news && !updates.email_news) {
        console.log(`[account/updateEmailPrefs] user ${req.userId} opted out of TrueHive news (opted_in_at timestamp preserved).`);
      }
    }

    const setClauses = [];
    const vals = [];
    let i = 1;
    for (const [column, value] of Object.entries(updates)) {
      setClauses.push(`${column} = $${i}`);
      vals.push(value);
      i++;
      if (column === 'email_news' && value === true) {
        setClauses.push(`email_news_opted_in_at = NOW()`);
      }
    }
    vals.push(req.userId);

    const { rows: [row] } = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE user_id = $${i}
       RETURNING email_joins, email_digest, email_news`,
      vals,
    );

    res.json({
      prefs: {
        emailJoins:  row.email_joins,
        emailDigest: row.email_digest,
        emailNews:   row.email_news,
      },
    });
  } catch (err) {
    console.error('[auth/updateEmailPrefs]', err);
    res.status(500).json({ error: 'Failed to save your email preferences.' });
  }
}
