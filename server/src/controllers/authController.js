import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SALT_ROUNDS  = 10;
const JWT_EXPIRY   = '7d';
const COOKIE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure:   false,   // set to true behind HTTPS in production
  maxAge:   COOKIE_TTL,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// ── register ──────────────────────────────────────────────────────────────────

export async function register(req, res) {
  try {
    const { email, password } = req.body ?? {};

    // Validate
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Duplicate check
    const existing = await query(
      'SELECT user_id FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Hash + insert
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING user_id, email, account_status, created_at, member_id`,
      [email.toLowerCase(), passwordHash],
    );
    const user = rows[0];

    // JWT + cookie
    const token = signToken(user.user_id);
    res.cookie('token', token, COOKIE_OPTS);

    return res.status(201).json({
      user: {
        userId:        user.user_id,
        email:         user.email,
        accountStatus: user.account_status,
        createdAt:     user.created_at,
        memberId:      user.member_id,
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

    // Look up user
    const { rows } = await query(
      'SELECT user_id, email, password_hash, account_status FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    const user = rows[0];

    // Same message for "not found" and "wrong password" — don't reveal which
    const INVALID = 'Invalid credentials.';
    if (!user) return res.status(401).json({ error: INVALID });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: INVALID });

    // Update last_login (fire-and-forget — don't block the response)
    query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id])
      .catch(e => console.error('[auth/login] last_login update failed:', e.message));

    // JWT + cookie
    const token = signToken(user.user_id);
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

export async function logout(_req, res) {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  return res.json({ message: 'Logged out.' });
}

// ── getMe ─────────────────────────────────────────────────────────────────────
// Protected — req.userId set by requireAuth middleware

export async function getMe(req, res) {
  try {
    const userId = req.userId;

    // User row
    const userResult = await query(
      'SELECT user_id, email, account_status, created_at, member_id FROM users WHERE user_id = $1',
      [userId],
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userResult.rows[0];

    // Has profile?
    const profileResult = await query(
      'SELECT profile_id FROM profiles WHERE user_id = $1 LIMIT 1',
      [userId],
    );

    // Has active hive membership?
    const hiveResult = await query(
      `SELECT hive_member_id FROM hive_members
       WHERE user_id = $1 AND membership_status = 'active'
       LIMIT 1`,
      [userId],
    );

    return res.json({
      user: {
        userId:          user.user_id,
        email:           user.email,
        accountStatus:   user.account_status,
        createdAt:       user.created_at,
        memberId:        user.member_id,
        hasProfile:      profileResult.rows.length > 0,
        hasActiveHive:   hiveResult.rows.length > 0,
      },
    });
  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
}
