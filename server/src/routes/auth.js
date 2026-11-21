'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db, getSetting } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// ── In-memory login rate limiter (per client IP) ────────────────────────
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const loginAttempts = new Map();

const pruneInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (now - record.firstAttemptAt >= LOGIN_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);
if (typeof pruneInterval.unref === 'function') {
  pruneInterval.unref();
}

function getClientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Public – validates credentials and returns a JWT.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const now = Date.now();
    let attemptRecord = loginAttempts.get(clientIp);

    if (attemptRecord && now - attemptRecord.firstAttemptAt >= LOGIN_WINDOW_MS) {
      loginAttempts.delete(clientIp);
      attemptRecord = null;
    }

    if (attemptRecord && attemptRecord.count >= MAX_LOGIN_ATTEMPTS) {
      logger.warn(`Rate-limited login attempt from ${clientIp}`);
      return res.status(429).json({
        error: 'Too many login attempts. Please try again later.',
      });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    let storedUsername = getSetting('admin_username');
    let storedHash = getSetting('admin_password_hash');

    // Only seed credentials from config/env if missing from DB on first run
    if (!storedUsername || !storedHash) {
      storedUsername = config.admin.username;
      storedHash = bcrypt.hashSync(config.admin.password, 10);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_username', ?)").run(storedUsername);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_hash', ?)").run(storedHash);
      logger.info('Admin credentials initialized from config/env');
    }

    const isUsernameMatch = username === storedUsername;
    const valid = isUsernameMatch && bcrypt.compareSync(password, storedHash);

    if (!valid) {
      const nextCount = attemptRecord ? attemptRecord.count + 1 : 1;
      loginAttempts.set(clientIp, {
        count: nextCount,
        firstAttemptAt: attemptRecord ? attemptRecord.firstAttemptAt : now,
      });
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre.' });
    }

    loginAttempts.delete(clientIp);

    const token = jwt.sign(
      { username: storedUsername, role: 'admin' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    logger.info(`User "${username}" logged in successfully`);
    return res.json({
      token,
      username: storedUsername,
      role: 'admin',
      user: { username: storedUsername, role: 'admin' },
    });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me & GET /api/auth/verify
// Protected – returns current user info decoded from the JWT.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', authenticateToken, (req, res) => {
  return res.json({
    username: req.user.username,
    role: req.user.role,
    user: { username: req.user.username, role: req.user.role },
  });
});

router.get('/verify', authenticateToken, (req, res) => {
  return res.json({
    valid: true,
    username: req.user.username,
    role: req.user.role,
    user: { username: req.user.username, role: req.user.role },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/change-password
// Protected – changes the admin password.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/change-password', authenticateToken, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const storedHash = getSetting('admin_password_hash');
    const valid = bcrypt.compareSync(currentPassword, storedHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_password_hash'").run(newHash);

    logger.info(`Password changed for user "${req.user.username}"`);
    return res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    logger.error(`Change-password error: ${err.message}`);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
