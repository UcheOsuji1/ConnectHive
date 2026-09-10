import bcrypt       from 'bcryptjs';
import jwt           from 'jsonwebtoken';
import crypto        from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { query }     from '../db/index.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from '../lib/email.js';
import { invalidateTokenVersion } from '../middleware/auth.js';
import { disconnectUserSockets }  from '../realtime/socket.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SALT_ROUNDS = 10;
const JWT_EXPIRY  = '7d';
const COOKIE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

const isProd       = process.env.NODE_ENV === 'production';
const CLIENT_URL   = process.env.CLIENT_URL;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: isProd ? 'none' : 'lax',
  secure:   isProd,
  maxAge:   COOKIE_TTL,
  path:     '/',
};

// Short-lived cookie used only during the OAuth redirect round-trip.
const STATE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: isProd ? 'none' : 'lax',
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
    const { email, password } = req.body ?? {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = await query('SELECT user_id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING user_id, email, account_status, created_at, member_id, token_version`,
      [email.toLowerCase(), passwordHash],
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
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure:   isProd,
    path:     '/',
  });
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

export function googleRedirect(_req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, STATE_COOKIE_OPTS);
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
      `SELECT u.user_id, u.token_version
       FROM auth_identities ai
       JOIN users u ON u.user_id = ai.user_id
       WHERE ai.provider = 'google' AND ai.provider_user_id = $1`,
      [googleId],
    );

    if (identityRows.length > 0) {
      const { user_id, token_version } = identityRows[0];
      query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user_id]).catch(() => {});
      const jwtToken = signToken(user_id, token_version);
      res.cookie('token', jwtToken, COOKIE_OPTS);
      return res.redirect(`${CLIENT_URL}/home`);
    }

    // 2. Does a TrueHive account with this email already exist?
    const { rows: userRows } = await query(
      'SELECT user_id, token_version FROM users WHERE email = $1',
      [email],
    );

    let userId;
    let tokenVersion;

    if (userRows.length > 0) {
      // Link Google identity to the existing account.
      userId       = userRows[0].user_id;
      tokenVersion = userRows[0].token_version;
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
      const { rows: [newUser] } = await query(
        `INSERT INTO users (email, password_hash, email_verified)
         VALUES ($1, NULL, TRUE)
         RETURNING user_id, token_version`,
        [email],
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
    return res.redirect(`${CLIENT_URL}/home`);

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
