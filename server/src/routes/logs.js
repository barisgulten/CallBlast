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
// GET /api/logs/stats
// Aggregate statistics across all blasts.
// NOTE: This route must be declared BEFORE the /:blastId route to avoid
//       "stats" being captured as a blastId parameter.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    blaster.cleanupStaleBlasts();

    const stats = db
      .prepare(
        `SELECT
           COUNT(*)                          AS total_blasts,
           COALESCE(SUM(total_calls), 0)     AS total_calls,
           COALESCE(SUM(answered), 0)        AS total_answered,
           COALESCE(SUM(failed), 0)          AS total_failed,
           CASE
             WHEN SUM(total_calls) > 0
               THEN ROUND(SUM(answered) * 100.0 / SUM(total_calls), 2)
             ELSE 0
           END                               AS success_rate
         FROM blast_logs`
      )
      .get();

    const totalNumbers = db.prepare('SELECT COUNT(*) AS count FROM numbers WHERE active = 1').get().count;
    const totalAudioFiles = db.prepare('SELECT COUNT(*) AS count FROM audio_files').get().count;

    return res.json({
      ...stats,
      totalNumbers,
      totalAudioFiles,
      totalCalls: stats.total_calls,
      successRate: stats.success_rate,
      total_numbers: totalNumbers,
      total_audio_files: totalAudioFiles,
    });
  } catch (err) {
    logger.error(`Error fetching stats: ${err.message}`);
    return res.status(500).json({ error: 'Failed to retrieve statistics.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/logs
// Paginated list of blast logs.
// Query params: page (default 1), limit (default 20)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    blaster.cleanupStaleBlasts();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const total = db.prepare('SELECT COUNT(*) AS count FROM blast_logs').get().count;
    const logs = db
      .prepare('SELECT * FROM blast_logs ORDER BY started_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset);

    return res.json({
      data: logs,
      blasts: logs,
      logs: logs,
      total,
      totalPages: Math.ceil(total / limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error(`Error listing logs: ${err.message}`);
    return res.status(500).json({ error: 'Failed to retrieve logs.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/logs/:blastId
// Detailed log for a single blast, including all call details.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:blastId', (req, res) => {
  try {
    blaster.cleanupStaleBlasts();

    const { blastId } = req.params;
    const blast = db
      .prepare('SELECT * FROM blast_logs WHERE blast_id = ? OR CAST(id AS TEXT) = ?')
      .get(blastId, blastId);
    if (!blast) {
      return res.status(404).json({ error: 'Blast log not found.' });
    }

    const calls = db
      .prepare('SELECT * FROM call_details WHERE blast_id = ? ORDER BY dial_time')
      .all(blast.blast_id);

    return res.json({ ...blast, calls });
  } catch (err) {
    logger.error(`Error fetching blast log ${req.params.blastId}: ${err.message}`);
    return res.status(500).json({ error: 'Failed to retrieve blast log.' });
  }
});

module.exports = router;
