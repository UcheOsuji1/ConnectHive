import './env.js'; // loads server/.env with explicit path — must be first
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes         from './routes/auth.js';
import hiveRoutes         from './routes/hives.js';
import userRoutes         from './routes/users.js';
import postRoutes         from './routes/posts.js';
import notificationRoutes from './routes/notifications.js';
import { testConnection } from './db/index.js';

const app        = express();
const PORT       = process.env.PORT       || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

console.log('[startup] Cloudinary configured:', {
  hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
  hasApiKey:    !!process.env.CLOUDINARY_API_KEY,
  hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/hives',         hiveRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/posts',         postRoutes);
app.use('/api/notifications', notificationRoutes);

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
app.listen(PORT, async () => {
  console.log(`\n  ConnectHive API  →  http://localhost:${PORT}`);
  console.log(`  Health check     →  http://localhost:${PORT}/api/health\n`);
  await testConnection();
});
