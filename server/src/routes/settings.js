'use strict';

const express = require('express');
const { getAllSettings, updateSettings } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ── Internal / sensitive keys and explicit editable allowlist ─────────────
const HIDDEN_KEYS = ['admin_password_hash'];
const ALLOWED_KEYS = new Set([
  'trigger_number',
  'max_concurrent_calls',
  'ring_timeout',
  'caller_id',
  'cucm_ip',
  'cucm_port',
  'retry_failed',
  'retry_count',
]);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settings
// Return all application settings (except sensitive ones).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const settings = getAllSettings();
    // Strip sensitive keys before returning
    for (const key of HIDDEN_KEYS) {
      delete settings[key];
    }
    return res.json(settings);
  } catch (err) {
    logger.error(`Error retrieving settings: ${err.message}`);
    return res.status(500).json({ error: 'Failed to retrieve settings.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/settings
// Upsert one or more allowlisted settings.  Body: { key: value, … }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/', (req, res) => {
  try {
    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object of key-value pairs.' });
    }

    const keys = Object.keys(body);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No settings provided.' });
    }

    // Prevent overwriting sensitive or unallowlisted keys via the API
    const sanitized = {};
    for (const key of keys) {
      if (HIDDEN_KEYS.includes(key) || !ALLOWED_KEYS.has(key)) {
        return res.status(400).json({ error: `Cannot update protected or unsupported setting "${key}".` });
      }
      const rawVal = body[key];
      const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();
      if (strVal.length > 255) {
        return res.status(400).json({ error: `Value for setting "${key}" is too long.` });
      }
      sanitized[key] = strVal;
    }

    updateSettings(sanitized);

    logger.info(`Settings updated: ${keys.join(', ')}`);
    const settings = getAllSettings();
    for (const key of HIDDEN_KEYS) {
      delete settings[key];
    }
    return res.json(settings);
  } catch (err) {
    logger.error(`Error updating settings: ${err.message}`);
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
});

module.exports = router;
