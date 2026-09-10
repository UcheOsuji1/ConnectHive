import './env.js'; // loads server/.env with explicit path — must be first
import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes         from './routes/auth.js';
import hiveRoutes         from './routes/hives.js';
import userRoutes         from './routes/users.js';
import postRoutes         from './routes/posts.js';
import notificationRoutes from './routes/notifications.js';
import eventRoutes        from './routes/events.js';
import messageRoutes      from './routes/messages.js';
import { testConnection } from './db/index.js';
import { initSocket }     from './realtime/socket.js';

// ── Required env check — fail fast before binding a port ─────────────────────
{
  const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'CLIENT_URL'];
  const missing  = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('\n  [startup] ERROR — required environment variables are not set:');
    missing.forEach(k => console.error(`    ✗  ${k}`));
    console.error('\n  Set them in server/.env (copy server/.env.example) and restart.\n');
    process.exit(1);
  }
}

const app        = express();
const PORT       = process.env.PORT       || 5000;
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

// ── Optional feature flags (warn once, never fatal) ───────────────────────────
{
  const flags = [
    ['RESEND_API_KEY',         'email sending'],
    ['GOOGLE_CLIENT_ID',       'Google sign-in'],
    ['GOOGLE_CLIENT_SECRET',   'Google sign-in'],
    ['GOOGLE_REDIRECT_URI',    'Google sign-in'],
    ['CLOUDINARY_CLOUD_NAME',  'image uploads'],
    ['CLOUDINARY_API_KEY',     'image uploads'],
    ['CLOUDINARY_API_SECRET',  'image uploads'],
    ['ANTHROPIC_API_KEY',      'AI explanations'],
  ];
  const disabled = flags.filter(([k]) => !process.env[k]);
  if (disabled.length) {
    console.warn('\n  [startup] optional features disabled (keys not set):');
    disabled.forEach(([k, feat]) => console.warn(`    –  ${k}  (${feat})`));
    console.warn('');
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);  // required for secure cookies behind Render/Heroku/Fly
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Public config (feature flags the client needs before login) ───────────────
app.get('/api/config', (_req, res) => {
  res.json({ googleSignIn: !!process.env.GOOGLE_CLIENT_ID });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/hives',         hiveRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/posts',         postRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/events',        eventRoutes);
app.use('/api/messages',      messageRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = http.createServer(app);
initSocket(server, CLIENT_URL);

server.listen(PORT, async () => {
  console.log(`\n  TrueHive API  →  http://localhost:${PORT}`);
  console.log(`  Health check     →  http://localhost:${PORT}/api/health\n`);
  await testConnection();
});
