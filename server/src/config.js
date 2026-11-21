'use strict';

/**
 * Application configuration.
 * All values are sourced from environment variables with sensible defaults.
 */
const config = {
  // ── Asterisk ARI ──────────────────────────────────────────────────────
  ari: {
    url: process.env.ARI_URL || 'http://localhost:8088',
    username: process.env.ARI_USERNAME || 'asterisk',
    password: process.env.ARI_PASSWORD || 'asterisk',
  },

  // ── Cisco CUCM ────────────────────────────────────────────────────────
  cucm: {
    ip: process.env.CUCM_IP || '10.0.0.1',
    port: parseInt(process.env.CUCM_PORT, 10) || 5060,
    triggerNumber: process.env.TRIGGER_NUMBER || '9999',
  },

  // ── Authentication ────────────────────────────────────────────────────
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: '24h',
  },
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },

  // ── Server ────────────────────────────────────────────────────────────
  server: {
    port: parseInt(process.env.SERVER_PORT, 10) || 3000,
  },

  // ── Paths ─────────────────────────────────────────────────────────────
  paths: {
    audio: process.env.AUDIO_PATH || '/app/audio',
    data: process.env.DATA_PATH || '/app/data',
  },
};

module.exports = config;
