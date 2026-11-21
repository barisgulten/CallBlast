'use strict';

/**
 * CallBlast Server – Entry point
 *
 * Initialises the database, mounts Express routes, connects to Asterisk ARI,
 * and starts the HTTP server.
 */

// ── Load environment variables first ────────────────────────────────────
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { initDatabase } = require('./db/database');
const asteriskService = require('./services/asterisk');

// ── Initialise database (creates tables, seeds defaults) ────────────────
initDatabase();

// ── Express application ─────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Global middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.originalUrl}`);
  next();
});

// ── Mount routes ────────────────────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const numbersRoutes  = require('./routes/numbers');
const audioRoutes    = require('./routes/audio');
const blastRoutes    = require('./routes/blast');
const logsRoutes     = require('./routes/logs');
const settingsRoutes = require('./routes/settings');
const triggersRoutes = require('./routes/triggers');
const groupsRoutes   = require('./routes/groups');

app.use('/api/auth',     authRoutes);
app.use('/api/numbers',  numbersRoutes);
app.use('/api/audio',    audioRoutes);
app.use('/api/blast',    blastRoutes);
app.use('/api/logs',     logsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/triggers', triggersRoutes);
app.use('/api/groups',   groupsRoutes);

// Aliases for frontend compatibility
app.use('/api/stats', (req, res, next) => {
  req.url = '/stats';
  return logsRoutes(req, res, next);
});

app.use('/api/blasts', (req, res, next) => {
  if (req.method === 'POST') {
    req.url = '/start';
    return blastRoutes(req, res, next);
  }
  return logsRoutes(req, res, next);
});

// Health-check endpoint (public)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    ari_connected: asteriskService.isConnected(),
    uptime: process.uptime(),
  });
});

// ── 404 catch-all ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ── Global error handler ────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start HTTP server ───────────────────────────────────────────────────
const PORT = config.server.port;
const server = app.listen(PORT, () => {
  logger.info(`CallBlast server listening on port ${PORT}`);
});

// ── Connect to Asterisk ARI (non-blocking, retries on failure) ──────────
asteriskService.connect().catch((err) => {
  logger.error(`Initial ARI connection failed: ${err.message}`);
  logger.info('Will keep retrying in the background…');
});

// Ensure the blaster service module is loaded so its SIP-trigger
// callback is registered with the asterisk service.
require('./services/blaster');

// ── Graceful shutdown ───────────────────────────────────────────────────
function shutdown(signal) {
  logger.info(`Received ${signal} – shutting down gracefully`);

  server.close(() => {
    logger.info('HTTP server closed');

    asteriskService.disconnect();
    logger.info('ARI disconnected');

    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    logger.warn('Graceful shutdown timed out – forcing exit');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
