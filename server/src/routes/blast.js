'use strict';

const express = require('express');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const blaster = require('../services/blaster');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blast/start
// Start a new blast.
// Body: { audioId, groupName?, numberIds? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  try {
    const { audioId, groupName, numberIds } = req.body;

    // ── Resolve audio file ──────────────────────────────────────────────
    let audioFile;
    if (audioId) {
      audioFile = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(audioId);
      if (!audioFile) {
        return res.status(404).json({ error: 'Audio file not found.' });
      }
    } else {
      // Fall back to default audio
      audioFile = db.prepare('SELECT * FROM audio_files WHERE is_default = 1').get();
      if (!audioFile) {
        return res.status(400).json({ error: 'No audio file specified and no default audio set.' });
      }
    }

    // ── Resolve target numbers ──────────────────────────────────────────
    let numbers;
    if (numberIds && Array.isArray(numberIds) && numberIds.length > 0) {
      const placeholders = numberIds.map(() => '?').join(',');
      numbers = db
        .prepare(
          `SELECT * FROM numbers WHERE id IN (${placeholders}) AND active = 1`
        )
        .all(...numberIds);
    } else if (groupName) {
      numbers = db
        .prepare('SELECT * FROM numbers WHERE group_name = ? AND active = 1')
        .all(groupName);
    } else {
      numbers = db.prepare('SELECT * FROM numbers WHERE active = 1').all();
    }

    if (!numbers || numbers.length === 0) {
      return res.status(400).json({ error: 'No active numbers found for the given criteria.' });
    }

    // ── Kick off the blast ──────────────────────────────────────────────
    const blastStatus = await blaster.startBlast(
      audioFile,
      numbers,
      'web',            // trigger type
      req.user.username // trigger source
    );

    logger.info(`Blast ${blastStatus.blastId} started by ${req.user.username} – ${numbers.length} numbers`);
    return res.status(201).json(blastStatus);
  } catch (err) {
    logger.error(`Error starting blast: ${err.message}`);
    return res.status(500).json({ error: 'Failed to start blast.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blast/:blastId/status
// Get current blast status including per-call details.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:blastId/status', (req, res) => {
  try {
    const { blastId } = req.params;
    const status = blaster.getBlastStatus(blastId);
    if (!status) {
      return res.status(404).json({ error: 'Blast not found.' });
    }
    return res.json(status);
  } catch (err) {
    logger.error(`Error getting blast status: ${err.message}`);
    return res.status(500).json({ error: 'Failed to get blast status.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blast/:blastId/stop
// Stop an ongoing blast – hangs up all active channels.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:blastId/stop', async (req, res) => {
  try {
    const { blastId } = req.params;
    const result = await blaster.stopBlast(blastId);
    if (!result) {
      return res.status(404).json({ error: 'Blast not found or already completed.' });
    }
    logger.info(`Blast ${blastId} stopped by ${req.user.username}`);
    return res.json(result);
  } catch (err) {
    logger.error(`Error stopping blast ${req.params.blastId}: ${err.message}`);
    return res.status(500).json({ error: 'Failed to stop blast.' });
  }
});

module.exports = router;
