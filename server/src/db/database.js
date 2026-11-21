'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');
const logger = require('../utils/logger');

// ── Ensure data directory exists ────────────────────────────────────────
const dataDir = config.paths.data;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  logger.info(`Created data directory: ${dataDir}`);
}

const dbPath = path.join(dataDir, 'callblast.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent-read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Run the schema SQL to create tables if they don't already exist.
 */
function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  try {
    db.prepare('ALTER TABLE triggers ADD COLUMN prompt_audio_id INTEGER').run();
  } catch (_) {}
  logger.info('Database schema initialised');
}

/**
 * Seed the admin user from environment / config if it doesn't exist yet.
 * Admin credentials are stored in the settings table as hashed passwords.
 */
function seedAdminUser() {
  const existing = db.prepare("SELECT value FROM settings WHERE key = 'admin_password_hash'").get();
  if (!existing) {
    const hash = bcrypt.hashSync(config.admin.password, 10);
    const upsert = db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)"
    );
    const insertMany = db.transaction(() => {
      upsert.run({ key: 'admin_username', value: config.admin.username });
      upsert.run({ key: 'admin_password_hash', value: hash });
    });
    insertMany();
    logger.info(`Default admin user "${config.admin.username}" created`);
  }
}

/**
 * Insert default application settings when they are missing.
 */
function seedDefaultSettings() {
  const defaults = {
    trigger_number: config.cucm.triggerNumber || '9999',
    max_concurrent_calls: '50',
    ring_timeout: '30',
    caller_id: config.cucm.triggerNumber || '9999',
    cucm_ip: config.cucm.ip || '10.0.0.1',
    cucm_port: String(config.cucm.port || '5060'),
  };

  const upsert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)"
  );

  const insertMany = db.transaction(() => {
    for (const [key, value] of Object.entries(defaults)) {
      upsert.run({ key, value });
    }
  });

  insertMany();
  logger.info('Default settings verified');
}

/**
 * Seed default contact groups if none exist.
 */
function seedDefaultGroups() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM contact_groups').get().count;
  if (count === 0) {
    const defaultGroups = [
      { name: 'Genel', description: 'Tüm genel personel ve dahili numaralar' },
      { name: 'Yönetim', description: 'Şirket yöneticileri ve kriz masası' },
      { name: 'Güvenlik', description: 'Güvenlik ve bina sorumluları' },
      { name: 'Teknik Ekip', description: 'IT ve teknik servis çalışanları' },
    ];
    const insert = db.prepare('INSERT OR IGNORE INTO contact_groups (name, description) VALUES (?, ?)');
    for (const g of defaultGroups) {
      insert.run(g.name, g.description);
    }
    logger.info('Default contact groups seeded');
  }
}

/**
 * Seed a default trigger if none exists.
 */
function seedDefaultTriggers() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM triggers').get().count;
  if (count === 0) {
    const defaultNumber = getSetting('trigger_number') || config.cucm.triggerNumber || '5555';
    const defaultAudio = db.prepare('SELECT id FROM audio_files LIMIT 1').get();
    db.prepare(
      `INSERT INTO triggers (name, number, audio_file_id, group_name, description, active)
       VALUES (?, ?, ?, 'all', 'Genel Acil Durum Alarmı (Tüm Rehber)', 1)`
    ).run('Genel Alarm', defaultNumber, defaultAudio ? defaultAudio.id : null);
    logger.info(`Default trigger "${defaultNumber}" created`);
  }
}

/**
 * Seed default numbers if none exist.
 */
function seedDefaultNumbers() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM numbers').get().count;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO numbers (name, number, group_name, active) VALUES (?, ?, ?, 1)');
    insert.run('Dahili 1000', '1000', 'Genel');
    insert.run('Dahili 1010', '1010', 'Genel');
    logger.info('Default numbers seeded (1000, 1010)');
  }
}

/**
 * Initialise the database: schema → admin user → default settings.
 */
function initDatabase() {
  initSchema();
  seedAdminUser();
  seedDefaultSettings();
  seedDefaultGroups();
  seedDefaultNumbers();
  seedDefaultTriggers();
}

// ── Helper functions ────────────────────────────────────────────────────

/**
 * Get a single setting value by key.
 * @param {string} key
 * @returns {string|null}
 */
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Get all settings as a key→value object.
 * @returns {Object}
 */
function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

/**
 * Update one or more settings.
 * @param {Object} settingsObj  key→value pairs to upsert
 */
function updateSettings(settingsObj) {
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)'
  );
  const updateMany = db.transaction(() => {
    for (const [key, value] of Object.entries(settingsObj)) {
      upsert.run({ key, value: String(value) });
    }
  });
  updateMany();
}

module.exports = {
  db,
  initDatabase,
  getSetting,
  getAllSettings,
  updateSettings,
};
