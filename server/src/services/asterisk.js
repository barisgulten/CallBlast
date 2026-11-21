'use strict';

const ariClient = require('ari-client');
const config = require('../config');
const logger = require('../utils/logger');

// ── Module state ────────────────────────────────────────────────────────
let client = null;           // ARI client instance
let connected = false;
let reconnectTimer = null;
const RECONNECT_DELAY_MS = 5000;

// Callback set by the blaster service so we can forward StasisStart events
let onTriggerCallback = null;

/**
 * Set the callback invoked when an incoming trigger call arrives.
 * @param {Function} cb  (event, channel) => void
 */
function onIncomingTrigger(cb) {
  onTriggerCallback = cb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connect (or reconnect) to the Asterisk ARI.
 * Registers the "callblast" Stasis application and wires up events.
 */
async function connect() {
  if (connected && client) return client;

  const url = config.ari.url;
  const username = config.ari.username;
  const password = config.ari.password;

  logger.info(`Connecting to Asterisk ARI at ${url} …`);

  try {
    client = await ariClient.connect(url, username, password);
    connected = true;

    logger.info('Connected to Asterisk ARI');

    // ── Register the Stasis application ───────────────────────────────
    client.on('StasisStart', (event, channel) => {
      handleStasisStart(event, channel);
    });

    client.on('StasisEnd', (event, channel) => {
      logger.debug(`StasisEnd on channel ${channel.id}`);
    });

    // Start the stasis application
    client.start('callblast');
    logger.info('Stasis application "callblast" registered');

    // Handle WebSocket close / errors for auto-reconnect
    if (client._ws) {
      client._ws.on('close', () => {
        logger.warn('ARI WebSocket closed – scheduling reconnect');
        connected = false;
        scheduleReconnect();
      });

      client._ws.on('error', (err) => {
        logger.error(`ARI WebSocket error: ${err.message}`);
        connected = false;
        scheduleReconnect();
      });
    }

    return client;
  } catch (err) {
    logger.error(`Failed to connect to ARI: ${err.message}`);
    connected = false;
    scheduleReconnect();
    return null;
  }
}

/**
 * Schedule an automatic reconnect attempt.
 */
function scheduleReconnect() {
  if (reconnectTimer) return; // already scheduled
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    logger.info('Attempting ARI reconnect…');
    await connect();
  }, RECONNECT_DELAY_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stasis event handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle an incoming StasisStart event.
 * If it is a trigger call (incoming from the CUCM trunk with no appArgs),
 * answer it, fire the blast trigger callback (which plays prompt audio and starts blast),
 * and let the trigger callback manage prompt playback and clean hangup.
 */
async function handleStasisStart(event, channel) {
  const args = event.args || [];

  // If there are appArgs, the call was originated by the blaster – skip trigger logic
  if (args.length > 0) {
    return;
  }

  const callerNumber = (channel && channel.caller && channel.caller.number) ||
                       (event && event.channel && event.channel.caller && event.channel.caller.number) || 'unknown';
  logger.info(`Incoming trigger call on channel ${channel.id} from ${callerNumber}`);

  try {
    try {
      await channel.answer();
    } catch (ansErr) {
      // Channel may already be answered by dialplan
      logger.debug(`Channel answer note: ${ansErr.message}`);
    }
    logger.info(`Trigger call ${channel.id} ready in Stasis`);

    // Notify the blaster service immediately (starts blast & plays prompt audio)
    if (typeof onTriggerCallback === 'function') {
      try {
        onTriggerCallback(event, channel);
      } catch (cbErr) {
        logger.error(`Error in onTriggerCallback: ${cbErr.message}`);
      }
    }

    // Hard safety fallback timer: ensure trigger channel never stays stuck open in Stasis
    setTimeout(async () => {
      try {
        if (client && client.channels && typeof client.channels.setChannelVar === 'function') {
          await client.channels.setChannelVar({
            channelId: channel.id,
            variable: 'TIMEOUT(absolute)',
            value: '1',
          });
        }
      } catch (_) {}
      try {
        if (client && client.channels && typeof client.channels.continueInDialplan === 'function') {
          await client.channels.continueInDialplan({ channelId: channel.id });
        }
      } catch (_) {}
      try {
        await hangupChannel(channel.id);
      } catch (_) {}
      try {
        await channel.hangup();
      } catch (_) {}
    }, 2500);
  } catch (err) {
    logger.error(`Error in handleStasisStart for ${channel.id}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Originate a single outbound call through the CUCM trunk.
 * @param {string} number      Destination phone number
 * @param {string} callerId    Caller-ID to present
 * @param {string} blastId     Blast identifier (passed as appArgs)
 * @param {number} timeoutSec  Ring timeout in seconds before Asterisk gives up
 * @returns {Promise<object>}  The channel object
 */
async function originateCall(number, callerId, blastId, timeoutSec = 30) {
  if (!client || !connected) {
    throw new Error('ARI client is not connected');
  }

  const safeNumber = String(number || '').replace(/[^0-9+*#]/g, '');
  if (!safeNumber) {
    throw new Error(`Invalid destination number: "${number}"`);
  }
  const safeCallerId = String(callerId || '5555').replace(/[^0-9+*#]/g, '') || '5555';
  const safeTimeout = Math.max(5, Math.min(300, parseInt(timeoutSec, 10) || 30));

  const channelObj = await client.channels.originate({
    endpoint: `PJSIP/${safeNumber}@cucm-trunk`,
    app: 'callblast',
    appArgs: blastId,
    callerId: safeCallerId,
    timeout: safeTimeout,
  });

  logger.debug(`Originated call to ${safeNumber} (timeout=${safeTimeout}s) – channel ${channelObj.id}`);
  return channelObj;
}

/**
 * Play an audio file on a live channel.
 * Asterisk expects the path without the file extension.
 * @param {object} channel     ARI channel object
 * @param {string} audioFile   Filename (with extension) in the audio directory
 * @returns {Promise<object>}  Playback object
 */
async function playAudio(channel, audioFile) {
  // Strip extension – Asterisk resolves the format automatically
  const baseName = audioFile.replace(/\.[^.]+$/, '');
  // Asterisk looks for sounds relative to its own sounds directory.
  // The shared volume is mounted at /var/spool/asterisk/sounds/callblast in the
  // Asterisk container, so the Asterisk-side path is "callblast/<baseName>".
  const mediaUri = `sound:callblast/${baseName}`;

  const playback = await channel.play({ media: mediaUri });
  logger.debug(`Playing ${mediaUri} on channel ${channel.id}`);
  return playback;
}

/**
 * Hang up a channel by its ID.
 * @param {string} channelId
 */
async function hangupChannel(channelId) {
  if (!client || !connected) {
    throw new Error('ARI client is not connected');
  }

  try {
    if (client.channels && typeof client.channels.hangup === 'function') {
      await client.channels.hangup({ channelId });
    }
    logger.debug(`Channel ${channelId} hung up via client.channels.hangup`);
  } catch (err) {
    // Channel may already have been hung up
    if (err.message && err.message.includes('404')) {
      logger.debug(`Channel ${channelId} already gone`);
    } else {
      logger.warn(`Could not hangup channel ${channelId}: ${err.message}`);
    }
  }
}

/**
 * Return the raw ARI client instance (e.g. for event subscriptions).
 * @returns {object|null}
 */
function getAriClient() {
  return client;
}

/**
 * Return whether the ARI client is currently connected.
 * @returns {boolean}
 */
function isConnected() {
  return connected;
}

/**
 * Gracefully disconnect from ARI.
 */
function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (client && client._ws) {
    try {
      client._ws.close();
    } catch (_) { /* ignore */ }
  }
  connected = false;
  client = null;
  logger.info('Disconnected from Asterisk ARI');
}

module.exports = {
  connect,
  disconnect,
  originateCall,
  playAudio,
  hangupChannel,
  getAriClient,
  isConnected,
  onIncomingTrigger,
};
