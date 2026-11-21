'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db, getSetting } = require('../db/database');
const config = require('../config');
const asterisk = require('./asterisk');
const logger = require('../utils/logger');

// ── In-memory blast tracking ────────────────────────────────────────────
// Map<blastId, BlastState>
const activeBlasts = new Map();
const TERMINAL_STATUSES = new Set(['completed', 'incomplete', 'stopped', 'failed']);

/**
 * Calculate the exact duration in seconds of an audio file on disk (.ulaw, .g722, or .wav).
 * For 8kHz 8-bit raw ulaw/alaw, 8000 bytes = exactly 1.0 second.
 * For 16kHz G.722, 8000 bytes = exactly 1.0 second.
 * For 8kHz 16-bit PCM WAV, 16000 bytes = exactly 1.0 second.
 */
function getAudioDurationSeconds(filename) {
  try {
    if (!filename) return 1.5;
    const audioDir = config.paths.audio;
    const base = path.basename(filename, path.extname(filename));

    const ulawFile = path.join(audioDir, `${base}.ulaw`);
    if (fs.existsSync(ulawFile)) {
      const stats = fs.statSync(ulawFile);
      const dur = stats.size / 8000;
      if (dur > 0.3) return dur;
    }

    const g722File = path.join(audioDir, `${base}.g722`);
    if (fs.existsSync(g722File)) {
      const stats = fs.statSync(g722File);
      const dur = stats.size / 8000;
      if (dur > 0.3) return dur;
    }

    const wavFile = path.join(audioDir, `${base}.wav`);
    if (fs.existsSync(wavFile)) {
      const stats = fs.statSync(wavFile);
      const dur = Math.max(0, stats.size - 44) / 16000;
      if (dur > 0.3) return dur;
    }
  } catch (_) {}
  return 1.5;
}

/**
 * @typedef {Object} BlastState
 * @property {string}        blastId
 * @property {string}        status           started | in_progress | completed | incomplete | stopped | failed
 * @property {Map}           channels         channelId → { number, name, status, finished }
 * @property {number}        totalCalls
 * @property {number}        answered
 * @property {number}        failed
 * @property {number}        inProgress
 * @property {object}        audioFile
 * @property {number}        ringTimeoutSec
 * @property {object|null}   watchdogTimer
 * @property {Function|null} cleanupListeners
 */

// ─────────────────────────────────────────────────────────────────────────────
// startBlast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrate a new blast: create log record, originate calls, track states.
 *
 * @param {object}   audioFile      Row from audio_files table
 * @param {object[]} numbers        Rows from numbers table
 * @param {string}   triggerType    'web' | 'sip'
 * @param {string}   triggerSource  Username or channel that triggered the blast
 * @returns {Promise<object>}       Initial blast status
 */
async function startBlast(audioFile, numbers, triggerType, triggerSource, customCallerId = null) {
  const blastId = uuidv4();
  const callerIdSetting = customCallerId || getSetting('caller_id') || getSetting('trigger_number') || (config.cucm && config.cucm.triggerNumber) || '5555';
  const maxConcurrent = parseInt(getSetting('max_concurrent_calls') || '50', 10);
  const ringTimeoutSec = Math.max(10, parseInt(getSetting('ring_timeout') || '30', 10) || 30);
  const audioDurationSec = getAudioDurationSeconds(audioFile && audioFile.filename);

  // ── Persist the blast log ──────────────────────────────────────────────
  db.prepare(
    `INSERT INTO blast_logs
       (blast_id, trigger_type, trigger_source, audio_file_id, audio_name, total_calls, status)
     VALUES (?, ?, ?, ?, ?, ?, 'started')`
  ).run(blastId, triggerType, triggerSource, audioFile.id, audioFile.name, numbers.length);

  // ── Build in-memory state ──────────────────────────────────────────────
  const state = {
    blastId,
    status: 'in_progress',
    channels: new Map(),
    totalCalls: numbers.length,
    answered: 0,
    failed: 0,
    inProgress: 0,
    audioFile,
    ringTimeoutSec,
    watchdogTimer: null,
    cleanupListeners: null,
  };
  activeBlasts.set(blastId, state);

  // ── Insert skeleton call_details rows ──────────────────────────────────
  const insertCall = db.prepare(
    `INSERT INTO call_details (blast_id, number, name, status, dial_time)
     VALUES (?, ?, ?, 'initiating', datetime('now'))`
  );
  const insertMany = db.transaction(() => {
    for (const num of numbers) {
      insertCall.run(blastId, num.number, num.name);
    }
  });
  insertMany();

  // ── Originate calls (respecting concurrency limit) ─────────────────────
  const ariClient = asterisk.getAriClient();
  if (!ariClient || !asterisk.isConnected()) {
    logger.error('ARI not connected – cannot originate calls');
    db.prepare(
      `UPDATE call_details
          SET status = 'failed', hangup_cause = 'ARI not connected', hangup_time = datetime('now'), duration = 0
        WHERE blast_id = ?`
    ).run(blastId);
    state.failed = numbers.length;
    state.inProgress = 0;
    db.prepare('UPDATE blast_logs SET failed = ?, in_progress = 0 WHERE blast_id = ?').run(
      state.failed,
      blastId
    );
    markBlastCompleted(blastId, 'failed');
    return getBlastStatusObject(blastId, state);
  }

  db.prepare("UPDATE blast_logs SET status = 'in_progress' WHERE blast_id = ? AND status = 'started'").run(blastId);

  // Wire up ARI event listeners scoped to this blast
  registerBlastEventListeners(ariClient, blastId);

  // Originate in batches to respect max_concurrent_calls
  const batches = [];
  for (let i = 0; i < numbers.length; i += maxConcurrent) {
    batches.push(numbers.slice(i, i + maxConcurrent));
  }

  // Fire first batch immediately; subsequent batches fire as calls complete
  // For simplicity we originate all now and let Asterisk queue them.
  // A production system may want back-pressure / semaphore logic.
  for (const batch of batches) {
    await originateBatch(state, batch, callerIdSetting);
  }

  if (state.status === 'in_progress') {
    const watchdogMs = (ringTimeoutSec + Math.ceil(audioDurationSec) + 30) * 1000;
    state.watchdogTimer = setTimeout(() => {
      handleBlastWatchdogTimeout(blastId);
    }, watchdogMs);
    if (typeof state.watchdogTimer.unref === 'function') {
      state.watchdogTimer.unref();
    }
  }

  logger.info(`Blast ${blastId} – ${numbers.length} calls originated`);
  return getBlastStatusObject(blastId, state);
}

/**
 * Originate a batch of calls.
 */
async function originateBatch(state, numbers, callerId) {
  for (const num of numbers) {
    try {
      const channel = await asterisk.originateCall(
        num.number,
        callerId,
        state.blastId,
        state.ringTimeoutSec
      );

      state.channels.set(channel.id, {
        number: num.number,
        name: num.name,
        status: 'ringing',
        finished: false,
      });
      state.inProgress++;

      // Persist channel ID
      db.prepare(
        `UPDATE call_details
            SET channel_id = ?, status = 'ringing'
          WHERE id = (
            SELECT id FROM call_details
             WHERE blast_id = ? AND number = ? AND channel_id IS NULL
             ORDER BY id ASC LIMIT 1
          )`
      ).run(channel.id, state.blastId, num.number);

      // Update blast_logs in_progress count
      db.prepare('UPDATE blast_logs SET in_progress = ? WHERE blast_id = ?').run(
        state.inProgress,
        state.blastId
      );
    } catch (err) {
      logger.error(`Failed to originate call to ${num.number}: ${err.message}`);
      state.failed++;

      db.prepare(
        `UPDATE call_details
            SET status = 'failed', hangup_cause = ?, hangup_time = datetime('now'), duration = 0
          WHERE id = (
            SELECT id FROM call_details
             WHERE blast_id = ? AND number = ? AND channel_id IS NULL
             ORDER BY id ASC LIMIT 1
          )`
      ).run(err.message, state.blastId, num.number);

      db.prepare('UPDATE blast_logs SET failed = ? WHERE blast_id = ?').run(
        state.failed,
        state.blastId
      );

      checkBlastCompletion(state);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ARI event handling (per-blast)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register event listeners on the ARI client for a specific blast.
 */
function registerBlastEventListeners(ariClient, blastId) {
  // StasisStart for originated channels (they carry blastId in appArgs)
  const onStasisStart = (event, channel) => {
    const args = event.args || [];
    if (args[0] !== blastId) return;

    const state = activeBlasts.get(blastId);
    if (!state) return;

    logger.debug(`Blast ${blastId}: StasisStart for channel ${channel.id}`);

    // Channel has entered Stasis → answer it and play audio
    handleChannelAnswered(state, channel);
  };

  // ChannelStateChange – track when the remote end answers
  const onChannelStateChange = (event) => {
    const state = activeBlasts.get(blastId);
    if (!state) return;

    const channelId = event.channel && event.channel.id;
    if (!channelId || !state.channels.has(channelId)) return;

    const channelState = event.channel.state;
    logger.debug(`Blast ${blastId}: channel ${channelId} state → ${channelState}`);

    if (channelState === 'Up') {
      const info = state.channels.get(channelId);
      if (info.status !== 'answered') {
        info.status = 'answered';
        state.answered++;

        db.prepare(
          `UPDATE call_details
              SET status = 'answered', answer_time = datetime('now')
            WHERE blast_id = ? AND channel_id = ?`
        ).run(blastId, channelId);

        db.prepare('UPDATE blast_logs SET answered = ? WHERE blast_id = ?').run(
          state.answered,
          blastId
        );
      }
    }
  };

  // StasisEnd – channel has left the application (hangup after answering)
  const onStasisEnd = (event, channel) => {
    const state = activeBlasts.get(blastId);
    if (!state) return;
    const ch = channel || (event && event.channel);
    if (!ch || !ch.id || !state.channels.has(ch.id)) return;

    handleChannelHangup(state, ch, event);
  };

  // ChannelDestroyed – catches unanswered/busy/rejected calls that never enter Stasis
  const onChannelDestroyed = (event, channel) => {
    const state = activeBlasts.get(blastId);
    if (!state) return;
    const ch = channel || (event && event.channel);
    if (!ch || !ch.id || !state.channels.has(ch.id)) return;

    handleChannelHangup(state, ch, event);
  };

  const cleanupListeners = () => {
    ariClient.removeListener('StasisStart', onStasisStart);
    ariClient.removeListener('ChannelStateChange', onChannelStateChange);
    ariClient.removeListener('StasisEnd', onStasisEnd);
    ariClient.removeListener('ChannelDestroyed', onChannelDestroyed);
  };

  const state = activeBlasts.get(blastId);
  if (state) {
    state.cleanupListeners = cleanupListeners;
  }

  ariClient.on('StasisStart', onStasisStart);
  ariClient.on('ChannelStateChange', onChannelStateChange);
  ariClient.on('StasisEnd', onStasisEnd);
  ariClient.on('ChannelDestroyed', onChannelDestroyed);
}

/**
 * When a channel enters Stasis (answered by remote party), play the audio.
 */
async function handleChannelAnswered(state, channel) {
  try {
    const playback = await asterisk.playAudio(channel, state.audioFile.filename);

    playback.on('PlaybackFinished', async () => {
      try {
        await channel.hangup();
        logger.debug(`Blast ${state.blastId}: audio finished on ${channel.id} – hung up`);
      } catch (err) {
        logger.warn(`Blast ${state.blastId}: error hanging up ${channel.id}: ${err.message}`);
      }
    });
  } catch (err) {
    logger.error(`Blast ${state.blastId}: error playing audio on ${channel.id}: ${err.message}`);
    try {
      await channel.hangup();
    } catch (_) { /* channel may already be gone */ }
  }
}

/**
 * Handle a channel hangup – update call detail and check blast completion.
 */
function handleChannelHangup(state, channel, event) {
  const info = state.channels.get(channel.id);
  if (!info || info.finished) return;
  info.finished = true;

  const wasInProgress = info.status === 'ringing' || info.status === 'answered';
  if (wasInProgress) {
    state.inProgress = Math.max(0, state.inProgress - 1);
  }

  // Determine whether the call was answered before hangup
  const callRow = db
    .prepare('SELECT status FROM call_details WHERE blast_id = ? AND channel_id = ?')
    .get(state.blastId, channel.id);
  const wasAnswered =
    info.status === 'answered' ||
    (callRow && (callRow.status === 'answered' || callRow.status === 'completed'));

  info.status = 'completed';

  let finalCallStatus;
  let hangupCause;

  if (wasAnswered) {
    finalCallStatus = 'answered';
    hangupCause = (event && event.cause_txt) || 'Normal Clearing';
  } else {
    const causeCode = event && event.cause;
    const rawCause = (event && event.cause_txt) || '';
    const lowerCause = rawCause.toLowerCase();

    if (causeCode === 17 || lowerCause.includes('busy')) {
      finalCallStatus = 'busy';
      hangupCause = rawCause || 'User busy';
    } else if (causeCode === 21 || lowerCause.includes('reject')) {
      finalCallStatus = 'failed';
      hangupCause = rawCause || 'Call rejected';
    } else if (
      causeCode === 19 ||
      causeCode === 16 ||
      lowerCause.includes('no answer') ||
      lowerCause.includes('normal') ||
      !rawCause
    ) {
      finalCallStatus = 'no_answer';
      hangupCause = 'No Answer (timeout)';
    } else {
      finalCallStatus = 'failed';
      hangupCause = rawCause;
    }

    state.failed++;
    db.prepare('UPDATE blast_logs SET failed = ? WHERE blast_id = ?').run(state.failed, state.blastId);
  }

  // Calculate duration
  db.prepare(
    `UPDATE call_details
        SET status       = ?,
            hangup_time  = datetime('now'),
            hangup_cause = ?,
            duration     = CASE
              WHEN answer_time IS NOT NULL
                THEN ROUND((julianday('now') - julianday(answer_time)) * 86400, 1)
              ELSE 0
            END
      WHERE blast_id = ? AND channel_id = ?`
  ).run(finalCallStatus, hangupCause, state.blastId, channel.id);

  db.prepare('UPDATE blast_logs SET in_progress = ? WHERE blast_id = ?').run(
    state.inProgress,
    state.blastId
  );

  logger.debug(
    `Blast ${state.blastId}: channel ${channel.id} hung up (${hangupCause}) – ` +
    `answered=${state.answered}, failed=${state.failed}, inProgress=${state.inProgress}`
  );

  checkBlastCompletion(state);
}

// ─────────────────────────────────────────────────────────────────────────────
// Blast lifecycle helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether all calls in a blast have finished.
 */
function checkBlastCompletion(state) {
  if (TERMINAL_STATUSES.has(state.status)) return;
  const done = state.answered + state.failed;
  if (done >= state.totalCalls && state.inProgress === 0) {
    const finalStatus =
      state.totalCalls > 0 && state.answered >= state.totalCalls ? 'completed' : 'incomplete';
    markBlastCompleted(state.blastId, finalStatus);
  }
}

/**
 * Mark a blast as completed/incomplete/stopped/failed in the DB and clean up listeners.
 */
function markBlastCompleted(blastId, finalStatus) {
  db.prepare(
    `UPDATE blast_logs
        SET status = ?, in_progress = 0, completed_at = COALESCE(completed_at, datetime('now'))
      WHERE blast_id = ?`
  ).run(finalStatus, blastId);

  const state = activeBlasts.get(blastId);
  if (state) {
    state.status = finalStatus;
    if (state.watchdogTimer) {
      clearTimeout(state.watchdogTimer);
      state.watchdogTimer = null;
    }
    if (typeof state.cleanupListeners === 'function') {
      try {
        state.cleanupListeners();
      } catch (_) {}
      state.cleanupListeners = null;
    }
    // Keep in activeBlasts briefly so status queries still work
    const deleteTimer = setTimeout(() => activeBlasts.delete(blastId), 60000);
    if (typeof deleteTimer.unref === 'function') {
      deleteTimer.unref();
    }
  }

  logger.info(`Blast ${blastId} marked as ${finalStatus}`);
}

/**
 * Synchronously finalize unfinished call_details and update blast_logs status inside a transaction.
 */
const finalizeIncompleteBlastTx = db.transaction((blastId) => {
  db.prepare(
    `UPDATE call_details
        SET status = CASE WHEN status = 'initiating' THEN 'failed' ELSE 'no_answer' END,
            hangup_cause = COALESCE(hangup_cause, 'timeout'),
            hangup_time = COALESCE(hangup_time, datetime('now')),
            duration = COALESCE(duration, 0)
      WHERE blast_id = ?
        AND (status IN ('initiating', 'ringing', 'in_progress', 'pending') OR status IS NULL)`
  ).run(blastId);

  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('answered', 'completed') THEN 1 ELSE 0 END) AS answered_count,
         SUM(CASE WHEN status NOT IN ('answered', 'completed') THEN 1 ELSE 0 END) AS failed_count
       FROM call_details
       WHERE blast_id = ?`
    )
    .get(blastId);

  const blastRow = db.prepare('SELECT total_calls FROM blast_logs WHERE blast_id = ?').get(blastId);
  if (!blastRow) return null;

  const totalCalls = blastRow.total_calls || 0;
  const answeredCount = (counts && counts.answered_count) || 0;
  const failedCount = (counts && counts.failed_count) || 0;
  const effectiveFailed = Math.max(failedCount, Math.max(0, totalCalls - answeredCount));
  const finalStatus = totalCalls > 0 && answeredCount >= totalCalls ? 'completed' : 'incomplete';

  db.prepare(
    `UPDATE blast_logs
        SET status = ?,
            answered = ?,
            failed = ?,
            in_progress = 0,
            completed_at = COALESCE(completed_at, datetime('now'))
      WHERE blast_id = ?`
  ).run(finalStatus, answeredCount, effectiveFailed, blastId);

  return {
    finalStatus,
    answeredCount,
    effectiveFailed,
  };
});

/**
 * Handle watchdog / stale timeout for an active blast.
 */
function handleBlastWatchdogTimeout(blastId) {
  const state = activeBlasts.get(blastId);
  if (state) {
    if (TERMINAL_STATUSES.has(state.status)) return;

    if (state.watchdogTimer) {
      clearTimeout(state.watchdogTimer);
      state.watchdogTimer = null;
    }
    if (typeof state.cleanupListeners === 'function') {
      try {
        state.cleanupListeners();
      } catch (_) {}
      state.cleanupListeners = null;
    }

    if (asterisk.isConnected()) {
      for (const [channelId, info] of state.channels) {
        if (!info.finished && (info.status === 'ringing' || info.status === 'answered')) {
          info.finished = true;
          info.status = 'completed';
          asterisk.hangupChannel(channelId).catch((err) => {
            logger.debug(`Watchdog hangup note for ${channelId}: ${err.message}`);
          });
        }
      }
    }
  }

  const result = finalizeIncompleteBlastTx(blastId);
  if (state && result) {
    state.status = result.finalStatus;
    state.answered = result.answeredCount;
    state.failed = result.effectiveFailed;
    state.inProgress = 0;
    const deleteTimer = setTimeout(() => activeBlasts.delete(blastId), 60000);
    if (typeof deleteTimer.unref === 'function') {
      deleteTimer.unref();
    }
  }

  if (result) {
    logger.warn(
      `Blast ${blastId} timed out / stalled – marked as ${result.finalStatus} ` +
      `(answered=${result.answeredCount}, failed=${result.effectiveFailed})`
    );
  }
}

/**
 * Sweep any orphaned or timed-out blasts in the database and finalize them.
 * @param {object} [options]
 * @param {boolean} [options.startupSweep=false]  Treat all non-in-memory active rows as immediately stale
 * @returns {number} Number of blasts finalized
 */
function cleanupStaleBlasts({ startupSweep = false } = {}) {
  try {
    const ringTimeoutSec = Math.max(10, parseInt(getSetting('ring_timeout') || '30', 10) || 30);
    const staleThresholdSec = Math.max(90, ringTimeoutSec + 60);

    const rows = db
      .prepare(
        `SELECT blast_id,
                status,
                ROUND((julianday('now') - julianday(started_at)) * 86400, 1) AS age_sec
           FROM blast_logs
          WHERE status IN ('started', 'in_progress')`
      )
      .all();

    let cleaned = 0;
    for (const row of rows) {
      const inMemory = activeBlasts.has(row.blast_id);
      const ageSec = Number(row.age_sec) || 0;
      const isStale =
        (startupSweep && !inMemory) ||
        (!inMemory && ageSec >= 15) ||
        ageSec >= staleThresholdSec;

      if (!isStale) continue;

      if (inMemory) {
        handleBlastWatchdogTimeout(row.blast_id);
      } else {
        const result = finalizeIncompleteBlastTx(row.blast_id);
        if (result) {
          logger.info(
            `Swept stale blast ${row.blast_id} (age=${ageSec}s) → ${result.finalStatus} ` +
            `(answered=${result.answeredCount}, failed=${result.effectiveFailed})`
          );
        }
      }
      cleaned++;
    }
    return cleaned;
  } catch (err) {
    logger.error(`Error cleaning up stale blasts: ${err.message}`);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// stopBlast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stop an active blast – hang up every live channel.
 * @param {string} blastId
 * @returns {Promise<object|null>}
 */
async function stopBlast(blastId) {
  const state = activeBlasts.get(blastId);
  if (!state || TERMINAL_STATUSES.has(state.status)) {
    // Try to find in DB
    const row = db.prepare('SELECT * FROM blast_logs WHERE blast_id = ?').get(blastId);
    if (!row) return null;
    if (TERMINAL_STATUSES.has(row.status)) return null;
  }

  if (state) {
    const hangupPromises = [];
    for (const [channelId, info] of state.channels) {
      if (!info.finished && (info.status === 'ringing' || info.status === 'answered')) {
        hangupPromises.push(
          asterisk.hangupChannel(channelId).catch((err) => {
            logger.warn(`Error hanging up channel ${channelId}: ${err.message}`);
          })
        );
      }
    }
    await Promise.all(hangupPromises);
  }

  markBlastCompleted(blastId, 'stopped');
  return getBlastStatus(blastId);
}

// ─────────────────────────────────────────────────────────────────────────────
// getBlastStatus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the current status of a blast.
 * Checks in-memory state first, then falls back to the database.
 * @param {string} blastId
 * @returns {object|null}
 */
function getBlastStatus(blastId) {
  const state = activeBlasts.get(blastId);
  if (state) {
    return getBlastStatusObject(blastId, state);
  }

  cleanupStaleBlasts();

  // Fallback to database
  const blast = db.prepare('SELECT * FROM blast_logs WHERE blast_id = ?').get(blastId);
  if (!blast) return null;

  const calls = db
    .prepare('SELECT * FROM call_details WHERE blast_id = ? ORDER BY dial_time')
    .all(blastId);

  return {
    blastId: blast.blast_id,
    status: blast.status,
    totalCalls: blast.total_calls,
    answered: blast.answered,
    failed: blast.failed,
    inProgress: blast.in_progress,
    audioName: blast.audio_name,
    triggerType: blast.trigger_type,
    triggerSource: blast.trigger_source,
    startedAt: blast.started_at,
    completedAt: blast.completed_at,
    calls,
  };
}

/**
 * Build a status response object from in-memory state.
 */
function getBlastStatusObject(blastId, state) {
  const calls = db
    .prepare('SELECT * FROM call_details WHERE blast_id = ? ORDER BY dial_time')
    .all(blastId);

  return {
    blastId,
    status: state.status,
    totalCalls: state.totalCalls,
    answered: state.answered,
    failed: state.failed,
    inProgress: state.inProgress,
    audioName: state.audioFile ? state.audioFile.name : null,
    calls,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIP trigger integration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by the asterisk service when an incoming trigger call arrives.
 * Checks for a matching trigger by dialed extension (e.g. 5551, 5555),
 * selects the assigned audio and group numbers, and starts the blast.
 */
async function handleSipTrigger(event, channel) {
  const ch = (event && event.channel) || channel || {};
  const dialedExten = (ch.dialplan && ch.dialplan.exten) || '';
  const callerNumber = (ch.caller && ch.caller.number) || 'unknown';

  logger.info(`SIP trigger received for dialed extension "${dialedExten}" from caller "${callerNumber}"`);

  // Look up custom trigger by dialed extension
  let trigger = null;
  if (dialedExten) {
    trigger = db.prepare('SELECT * FROM triggers WHERE number = ? AND active = 1').get(dialedExten);
    if (!trigger) {
      trigger = db.prepare('SELECT * FROM triggers WHERE TRIM(number) = TRIM(?) AND active = 1').get(dialedExten);
    }
  }
  if (!trigger) {
    trigger = db.prepare('SELECT * FROM triggers WHERE active = 1 ORDER BY id ASC LIMIT 1').get();
  }

  let audioFile = null;
  let numbers = [];
  let triggerTitle = 'Genel Alarm';

  if (trigger) {
    triggerTitle = trigger.name;
    logger.info(`Matched custom trigger: "${trigger.name}" (Exten: ${trigger.number}, Group: ${trigger.group_name})`);

    // Audio file assigned to this trigger
    if (trigger.audio_file_id) {
      audioFile = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(trigger.audio_file_id);
    }

    // Numbers filtered by this trigger's target group
    if (trigger.group_name && trigger.group_name !== 'all') {
      numbers = db.prepare('SELECT * FROM numbers WHERE group_name = ? AND (active = 1 OR active IS NULL)').all(trigger.group_name);
    }
    // If targeted group has no numbers, fall back to all active numbers
    if (!numbers || numbers.length === 0) {
      logger.warn(`Trigger group "${trigger.group_name}" has no numbers – falling back to all active numbers`);
      numbers = db.prepare('SELECT * FROM numbers WHERE (active = 1 OR active IS NULL)').all();
    }
  } else {
    logger.info(`No specific trigger found for "${dialedExten}" – falling back to all active numbers`);
    numbers = db.prepare('SELECT * FROM numbers WHERE (active = 1 OR active IS NULL)').all();
  }

  // Fallback to default or latest audio if trigger has no specific audio assigned
  if (!audioFile) {
    audioFile = db.prepare('SELECT * FROM audio_files WHERE is_default = 1').get();
  }
  if (!audioFile) {
    audioFile = db.prepare('SELECT * FROM audio_files ORDER BY created_at DESC LIMIT 1').get();
  }

  const audioDir = config.paths.audio;
  const fileExistsOnDisk = (af) => {
    if (!af || !af.filename) return false;
    const base = path.basename(af.filename, path.extname(af.filename));
    return (
      fs.existsSync(path.join(audioDir, `${base}.g722`)) ||
      fs.existsSync(path.join(audioDir, `${base}.wav`)) ||
      fs.existsSync(path.join(audioDir, `${base}.ulaw`)) ||
      (af.file_path && fs.existsSync(af.file_path))
    );
  };

  // If no audio file or missing from disk, find any valid file or auto-generate emergency audio
  if (!audioFile || !fileExistsOnDisk(audioFile)) {
    const allFiles = db.prepare('SELECT * FROM audio_files ORDER BY created_at DESC').all();
    const existing = allFiles.find(fileExistsOnDisk);
    if (existing) {
      audioFile = existing;
      logger.info(`Using available audio file: "${audioFile.name}" (${audioFile.filename})`);
    } else {
      const defaultWav = path.join(audioDir, 'default_alarm.wav');
      const defaultUlaw = path.join(audioDir, 'default_alarm.ulaw');
      try {
        const { execFileSync } = require('child_process');
        execFileSync(
          'ffmpeg',
          ['-y', '-f', 'lavfi', '-i', 'sine=frequency=800:duration=4', '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le', defaultWav],
          { stdio: 'ignore' }
        );
        execFileSync(
          'ffmpeg',
          ['-y', '-f', 'lavfi', '-i', 'sine=frequency=800:duration=4', '-ar', '8000', '-ac', '1', '-f', 'mulaw', defaultUlaw],
          { stdio: 'ignore' }
        );
        try { fs.chmodSync(defaultWav, 0o666); fs.chmodSync(defaultUlaw, 0o666); } catch (_) {}
      } catch (_) {}

      let dbAlarm = db.prepare("SELECT * FROM audio_files WHERE filename = 'default_alarm.wav' LIMIT 1").get();
      if (!dbAlarm) {
        const ins = db.prepare(
          `INSERT INTO audio_files (name, original_name, filename, file_path, is_default)
           VALUES ('Acil Durum Alarmı', 'default_alarm.wav', 'default_alarm.wav', ?, 1)`
        ).run(defaultWav);
        dbAlarm = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(ins.lastInsertRowid);
      }
      audioFile = dbAlarm;
      logger.info(`Using auto-generated emergency alarm audio (id: ${audioFile.id})`);
    }
  }

  // Ensure we always have numbers to call
  if (!numbers || numbers.length === 0) {
    numbers = db.prepare('SELECT * FROM numbers WHERE (active = 1 OR active IS NULL)').all();
  }
  if (!numbers || numbers.length === 0) {
    const ins = db.prepare('INSERT INTO numbers (name, number, group_name, active) VALUES (?, ?, ?, 1)');
    ins.run('Dahili 1000', '1000', 'Genel');
    ins.run('Dahili 1010', '1010', 'Genel');
    numbers = db.prepare('SELECT * FROM numbers WHERE (active = 1 OR active IS NULL)').all();
    logger.info('Auto-seeded default numbers (1000, 1010)');
  }

  const triggerSource = `${callerNumber} ➔ ${triggerTitle} (${dialedExten || 'SIP'})`;
  const callerIdToSend = (trigger && trigger.number) || dialedExten || '5555';

  // 1. Start target blast concurrently in the background
  try {
    startBlast(audioFile, numbers, 'sip', triggerSource, callerIdToSend).catch((blastErr) => {
      logger.error(`SIP trigger blast failed: ${blastErr.message}`);
    });
  } catch (err) {
    logger.error(`SIP trigger blast start failed: ${err.message}`);
  }

  // 2. Handle caller confirmation audio playback & auto hangup
  const callerChannel = channel || (event && event.channel);
  if (callerChannel && callerChannel.id) {
    (async () => {
      try {
        let promptFilename = null;

        // Check if trigger has a custom prompt announcement assigned
        // (If prompt_audio_id is identical to main blast audio_file_id, use beep_confirm so caller doesn't wait 30s)
        if (trigger && trigger.prompt_audio_id && trigger.prompt_audio_id !== trigger.audio_file_id) {
          const customPrompt = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(trigger.prompt_audio_id);
          if (customPrompt && fileExistsOnDisk(customPrompt)) {
            promptFilename = customPrompt.filename;
            logger.info(`Playing custom prompt audio "${customPrompt.name}" (${promptFilename}) to caller channel ${callerChannel.id}`);
          } else {
            logger.warn(`Custom prompt audio id ${trigger.prompt_audio_id} not found on disk, falling back to confirmation chime`);
          }
        }

        // Fallback: Confirmation chime (beep_confirm)
        if (!promptFilename) {
          const beepWav = path.join(audioDir, 'beep_confirm.wav');
          const beepUlaw = path.join(audioDir, 'beep_confirm.ulaw');
          if (!fs.existsSync(beepWav) || !fs.existsSync(beepUlaw) || fs.statSync(beepWav).size < 10000) {
            try {
              const { execFileSync } = require('child_process');
              execFileSync(
                'ffmpeg',
                [
                  '-y',
                  '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.5',
                  '-f', 'lavfi', '-i', 'sine=frequency=1320:duration=0.6',
                  '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1',
                  '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le', beepWav,
                ],
                { stdio: 'ignore' }
              );
              execFileSync(
                'ffmpeg',
                ['-y', '-i', beepWav, '-ar', '8000', '-ac', '1', '-f', 'mulaw', beepUlaw],
                { stdio: 'ignore' }
              );
              try { fs.chmodSync(beepWav, 0o666); fs.chmodSync(beepUlaw, 0o666); } catch (_) {}
            } catch (_) {}
          }
          promptFilename = 'beep_confirm.wav';
          logger.info(`Playing confirmation chime (${promptFilename}) to caller channel ${callerChannel.id}`);
        }

        // Measure duration of the prompt audio file (cap at 3.5s so caller line never stays open for 30s)
        const rawDurationSec = getAudioDurationSeconds(promptFilename);
        const durationSec = Math.min(rawDurationSec, 3.5);
        const autoHangupDelayMs = Math.round((durationSec + 0.3) * 1000);
        logger.info(`Prompt audio duration: ${durationSec.toFixed(1)}s -> caller will auto-hangup in ${autoHangupDelayMs}ms`);

        const ariClient = asterisk.getAriClient();
        // Set Asterisk kernel-level absolute timeout on the channel right away
        try {
          if (ariClient && ariClient.channels && typeof ariClient.channels.setChannelVar === 'function') {
            await ariClient.channels.setChannelVar({
              channelId: callerChannel.id,
              variable: 'TIMEOUT(absolute)',
              value: String(Math.max(2, Math.ceil(durationSec + 1))),
            });
          }
        } catch (_) {}

        const playback = await asterisk.playAudio(callerChannel, promptFilename);

        let hungUp = false;

        const finishCallerCall = async () => {
          if (hungUp) return;
          hungUp = true;
          logger.info(`Terminating trigger caller channel ${callerChannel.id} now...`);

          try {
            if (ariClient && onAriFinished) {
              ariClient.removeListener('PlaybackFinished', onAriFinished);
            }
          } catch (_) {}

          // Step 1: Stop active playback first so Stasis releases the media lock on the channel
          try {
            if (playback && typeof playback.stop === 'function') {
              await playback.stop();
            }
          } catch (_) {}

          // Step 2: Force Asterisk kernel-level immediate timeout hangup (1 second)
          try {
            if (ariClient && ariClient.channels && typeof ariClient.channels.setChannelVar === 'function') {
              await ariClient.channels.setChannelVar({
                channelId: callerChannel.id,
                variable: 'TIMEOUT(absolute)',
                value: '1',
              });
            }
          } catch (_) {}

          // Step 3: Exit Stasis and execute Hangup(16) in dialplan
          try {
            if (ariClient && ariClient.channels && typeof ariClient.channels.continueInDialplan === 'function') {
              await ariClient.channels.continueInDialplan({ channelId: callerChannel.id });
              logger.info(`Trigger caller channel ${callerChannel.id} continued to dialplan Hangup(16)`);
            }
          } catch (_) {}

          // Step 4: Direct ARI client channels hangup
          try {
            await asterisk.hangupChannel(callerChannel.id);
            logger.info(`Trigger caller channel ${callerChannel.id} hung up via hangupChannel`);
          } catch (_) {}

          // Step 5: Channel instance hangup
          try {
            await callerChannel.hangup();
            logger.info(`Trigger caller channel ${callerChannel.id} hung up via callerChannel.hangup`);
          } catch (_) {}
        };

        const onAriFinished = (ev, p) => {
          const pId = (p && p.id) || (ev && ev.playback && ev.playback.id);
          if (pId === playback.id) {
            logger.info(`PlaybackFinished event matched for ${pId}`);
            setTimeout(finishCallerCall, 200);
          }
        };

        playback.on('PlaybackFinished', () => {
          logger.info(`Playback instance finished on channel ${callerChannel.id}`);
          setTimeout(finishCallerCall, 200);
        });

        if (ariClient) {
          ariClient.on('PlaybackFinished', onAriFinished);
        }

        // Guaranteed duration-based timer ensures the phone hangs up right when the sound ends!
        setTimeout(finishCallerCall, autoHangupDelayMs);
      } catch (promptErr) {
        logger.error(`Could not play prompt to trigger caller: ${promptErr.message}`);
        setTimeout(async () => {
          try {
            await callerChannel.hangup({ reason: 'normal' });
          } catch (_) {}
        }, 1500);
      }
    })();
  }
}

// Register the SIP trigger handler with the asterisk service
asterisk.onIncomingTrigger(handleSipTrigger);

// Sweep any stale/orphaned blasts left over from prior restarts or missed events
cleanupStaleBlasts({ startupSweep: true });

// Periodically check for timed-out blasts every 30 seconds
const staleSweepInterval = setInterval(() => {
  cleanupStaleBlasts();
}, 30000);
if (typeof staleSweepInterval.unref === 'function') {
  staleSweepInterval.unref();
}

module.exports = {
  startBlast,
  stopBlast,
  getBlastStatus,
  cleanupStaleBlasts,
};
