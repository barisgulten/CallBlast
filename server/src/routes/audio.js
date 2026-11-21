'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

// ── Ensure audio directory exists ───────────────────────────────────────────
const audioDir = config.paths.audio;
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
  logger.info(`Created audio directory: ${audioDir}`);
}

// ── Audio Converter Helper ──────────────────────────────────────────────────
/**
 * Safely converts an uploaded audio file into all Asterisk-native formats:
 * - .wav  : PCM 16-bit 8000Hz mono (standard WAV)
 * - .ulaw : Raw G.711 u-law 8000Hz mono (CUCM native format - no transcoding!)
 * - .alaw : Raw G.711 A-law 8000Hz mono
 * - .gsm  : Raw GSM 8000Hz mono
 *
 * All files are assigned 0666 permissions so the Asterisk container can read them.
 */
function convertToAsteriskFormats(sourcePath, baseId) {
  const wavPath = path.join(audioDir, `${baseId}.wav`);
  const ulawPath = path.join(audioDir, `${baseId}.ulaw`);
  const alawPath = path.join(audioDir, `${baseId}.alaw`);
  const gsmPath = path.join(audioDir, `${baseId}.gsm`);

  logger.info(`Converting audio ${path.basename(sourcePath)} to Asterisk formats (id: ${baseId})...`);

  // 1. Generate 16-bit PCM 8kHz mono WAV
  try {
    const tmpWav = `${wavPath}.tmp.wav`;
    execFileSync(
      'ffmpeg',
      ['-y', '-i', sourcePath, '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le', tmpWav],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    if (fs.existsSync(tmpWav)) {
      fs.copyFileSync(tmpWav, wavPath);
      try { fs.unlinkSync(tmpWav); } catch (_) {}
    }
  } catch (err) {
    logger.warn(`FFmpeg WAV conversion notice: ${err.message}`);
    // If conversion fails and source is already .wav, keep source
    if (!fs.existsSync(wavPath) && fs.existsSync(sourcePath)) {
      try { fs.copyFileSync(sourcePath, wavPath); } catch (_) {}
    }
  }

  // Use the generated WAV (or source) to generate raw ulaw / alaw / gsm
  const intermediateInput = fs.existsSync(wavPath) ? wavPath : sourcePath;

  // 2. Generate raw u-law (.ulaw) - zero transcoding for CUCM
  try {
    const tmpUlaw = `${ulawPath}.tmp`;
    execFileSync(
      'ffmpeg',
      ['-y', '-i', intermediateInput, '-ar', '8000', '-ac', '1', '-f', 'mulaw', tmpUlaw],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    if (fs.existsSync(tmpUlaw)) {
      fs.copyFileSync(tmpUlaw, ulawPath);
      try { fs.unlinkSync(tmpUlaw); } catch (_) {}
    }
  } catch (err) {
    logger.warn(`FFmpeg ULAW conversion notice: ${err.message}`);
  }

  // 3. Generate raw A-law (.alaw)
  try {
    const tmpAlaw = `${alawPath}.tmp`;
    execFileSync(
      'ffmpeg',
      ['-y', '-i', intermediateInput, '-ar', '8000', '-ac', '1', '-f', 'alaw', tmpAlaw],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    if (fs.existsSync(tmpAlaw)) {
      fs.copyFileSync(tmpAlaw, alawPath);
      try { fs.unlinkSync(tmpAlaw); } catch (_) {}
    }
  } catch (err) {
    logger.warn(`FFmpeg ALAW conversion notice: ${err.message}`);
  }

  // 4. Generate GSM (.gsm)
  try {
    const tmpGsm = `${gsmPath}.tmp`;
    execFileSync(
      'ffmpeg',
      ['-y', '-i', intermediateInput, '-ar', '8000', '-ac', '1', '-f', 'gsm', tmpGsm],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    if (fs.existsSync(tmpGsm)) {
      fs.copyFileSync(tmpGsm, gsmPath);
      try { fs.unlinkSync(tmpGsm); } catch (_) {}
    }
  } catch (err) {
    logger.warn(`FFmpeg GSM conversion notice: ${err.message}`);
  }

  // 5. Generate raw G.722 (.g722) - native wideband HD audio for Cisco IP Phones
  const g722Path = path.join(audioDir, `${baseId}.g722`);
  try {
    const tmpG722 = `${g722Path}.tmp`;
    execFileSync(
      'ffmpeg',
      ['-y', '-i', sourcePath, '-ar', '16000', '-ac', '1', '-acodec', 'g722', '-f', 'g722', tmpG722],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    if (fs.existsSync(tmpG722)) {
      fs.copyFileSync(tmpG722, g722Path);
      try { fs.unlinkSync(tmpG722); } catch (_) {}
    }
  } catch (err) {
    logger.warn(`FFmpeg G722 conversion notice: ${err.message}`);
  }

  // Grant read/write permissions for all users (including Asterisk container user)
  for (const p of [wavPath, ulawPath, alawPath, gsmPath, g722Path]) {
    if (fs.existsSync(p)) {
      try { fs.chmodSync(p, 0o666); } catch (_) {}
    }
  }

  logger.info(`Asterisk audio formats created successfully for ${baseId} (.wav, .ulaw, .alaw, .g722, .gsm)`);
}

// ── Startup Check & File Recovery ───────────────────────────────────────────
try {
  // Clean up any stray temporary files
  const filesOnDisk = fs.readdirSync(audioDir);
  for (const f of filesOnDisk) {
    const full = path.join(audioDir, f);
    if (f.endsWith('.tmp') || f.endsWith('.tmp.wav') || f.endsWith('.converted.wav') || f.includes('.raw_upload')) {
      try { fs.unlinkSync(full); } catch (_) {}
    }
  }

  // Ensure EVERY DB record in audio_files has actual working sound files on disk!
  const existingRecords = db.prepare('SELECT * FROM audio_files').all();
  for (const rec of existingRecords) {
    const baseId = path.basename(rec.filename, path.extname(rec.filename));
    const targetWav = path.join(audioDir, `${baseId}.wav`);
    const targetUlaw = path.join(audioDir, `${baseId}.ulaw`);

    // If file is missing on disk, regenerate working audio so Asterisk never fails
    if (!fs.existsSync(targetWav) || !fs.existsSync(targetUlaw)) {
      logger.info(`Audio file on disk missing for "${rec.name}" (${baseId}) - generating audio...`);
      try {
        execFileSync(
          'ffmpeg',
          ['-y', '-f', 'lavfi', '-i', 'sine=frequency=800:duration=4', '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le', targetWav],
          { stdio: 'ignore' }
        );
        convertToAsteriskFormats(targetWav, baseId);
      } catch (genErr) {
        logger.warn(`Could not regenerate audio for ${baseId}: ${genErr.message}`);
      }
    }

    // If G.722 format is missing for an existing audio record, generate it now
    const targetG722 = path.join(audioDir, `${baseId}.g722`);
    if (!fs.existsSync(targetG722) && fs.existsSync(targetWav)) {
      try {
        execFileSync(
          'ffmpeg',
          ['-y', '-i', targetWav, '-ar', '16000', '-ac', '1', '-acodec', 'g722', '-f', 'g722', targetG722],
          { stdio: 'ignore' }
        );
        try { fs.chmodSync(targetG722, 0o666); } catch (_) {}
        logger.info(`Generated missing G.722 format for "${rec.name}" (${baseId})`);
      } catch (_) {}
    }

    // Set open permissions for Asterisk container
    for (const ext of ['.wav', '.ulaw', '.alaw', '.g722', '.gsm']) {
      const p = path.join(audioDir, `${baseId}${ext}`);
      if (fs.existsSync(p)) {
        try { fs.chmodSync(p, 0o666); } catch (_) {}
      }
    }
  }

  // Always ensure rich, audible confirmation chime exists on disk (.wav, .ulaw, .alaw, .gsm)
  const beepWav = path.join(audioDir, 'beep_confirm.wav');
  const beepUlaw = path.join(audioDir, 'beep_confirm.ulaw');
  if (!fs.existsSync(beepWav) || !fs.existsSync(beepUlaw) || fs.statSync(beepWav).size < 10000) {
    try {
      // 1.2 second distinctive dual-tone chime (880Hz -> 1320Hz)
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
      convertToAsteriskFormats(beepWav, 'beep_confirm');
      logger.info('Generated distinctive confirmation chime audio (WAV, ULAW, ALAW, GSM)');
    } catch (bErr) {
      logger.warn(`Could not generate confirmation chime: ${bErr.message}`);
    }
  }

  // If no audio files exist at all, generate a clean default 8kHz emergency sound
  const count = db.prepare('SELECT COUNT(*) AS count FROM audio_files').get().count;
  const defaultWav = path.join(audioDir, 'default_alarm.wav');
  if (count === 0 || !fs.existsSync(defaultWav)) {
    try {
      execFileSync(
        'ffmpeg',
        ['-y', '-f', 'lavfi', '-i', 'sine=frequency=800:duration=4', '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le', defaultWav],
        { stdio: 'ignore' }
      );
      convertToAsteriskFormats(defaultWav, 'default_alarm');
      if (count === 0) {
        const res = db.prepare(
          `INSERT INTO audio_files (name, original_name, filename, file_path, is_default)
           VALUES ('Varsayılan Acil Durum Sesi', 'default_alarm.wav', 'default_alarm.wav', ?, 1)`
        ).run(defaultWav);
        logger.info(`Auto-generated default alarm sound (id: ${res.lastInsertRowid})`);
        // Assign to triggers with null audio
        try {
          db.prepare('UPDATE triggers SET audio_file_id = ? WHERE audio_file_id IS NULL').run(res.lastInsertRowid);
        } catch (_) {}
      }
    } catch (genErr) {
      logger.warn(`Could not auto-generate default alarm: ${genErr.message}`);
    }
  }
} catch (startupErr) {
  logger.warn(`Startup audio maintenance notice: ${startupErr.message}`);
}

// All routes require authentication
router.use(authenticateToken);

// ── Multer configuration ────────────────────────────────────────────────────
// Upload temporary file first, then convert cleanly
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, audioDir),
  filename: (_req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.wav';
    cb(null, `${uniqueId}.raw_upload${ext}`);
  },
});

const ALLOWED_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/basic',
];
const ALLOWED_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.raw', '.ulaw', '.alaw'];

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error('Yalnızca WAV, MP3 ve ses dosyaları kabul edilmektedir.'));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/audio
// List all uploaded audio files.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM audio_files ORDER BY created_at DESC').all();
    return res.json(rows);
  } catch (err) {
    logger.error(`Error listing audio files: ${err.message}`);
    return res.status(500).json({ error: 'Ses dosyaları alınamadı.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/audio & POST /api/audio/upload
// Upload an audio file and generate all Asterisk native formats.
// ─────────────────────────────────────────────────────────────────────────────
const handleAudioUpload = (req, res) => {
  upload.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      logger.warn(`Multer error: ${err.message}`);
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      logger.warn(`Upload error: ${err.message}`);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Ses dosyası seçilmedi.' });
    }

    try {
      const { filename } = req.file;
      let originalname = req.file.originalname || 'audio.wav';
      try {
        if (/[\x80-\xff]/.test(originalname)) {
          const utf8Name = Buffer.from(originalname, 'latin1').toString('utf8');
          if (!utf8Name.includes('\uFFFD')) {
            originalname = utf8Name;
          }
        }
      } catch (_) {}

      const baseId = filename.split('.raw_upload')[0];
      const rawUploadPath = path.join(audioDir, filename);

      const name = (req.body.name && req.body.name.trim()) || path.basename(originalname, path.extname(originalname));
      const finalWavName = `${baseId}.wav`;
      const finalWavPath = path.join(audioDir, finalWavName);

      // Convert uploaded file to .wav, .ulaw, .alaw, .gsm
      convertToAsteriskFormats(rawUploadPath, baseId);

      // Remove raw upload file
      try {
        if (fs.existsSync(rawUploadPath)) {
          fs.unlinkSync(rawUploadPath);
        }
      } catch (_) {}

      if (!fs.existsSync(finalWavPath) || fs.statSync(finalWavPath).size === 0) {
        return res.status(400).json({ error: 'Ses dosyası dönüştürülemedi veya geçersiz format.' });
      }

      // Insert record into SQLite
      const result = db
        .prepare(
          `INSERT INTO audio_files (name, original_name, filename, file_path)
           VALUES (?, ?, ?, ?)`
        )
        .run(name, originalname, finalWavName, finalWavPath);

      const row = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(result.lastInsertRowid);
      logger.info(`Audio file successfully uploaded and converted: ${name} (id: ${row.id}, base: ${baseId})`);
      return res.status(201).json(row);
    } catch (dbErr) {
      logger.error(`Error saving audio metadata: ${dbErr.message}`);
      return res.status(500).json({ error: 'Ses dosyası kaydedilemedi: ' + dbErr.message });
    }
  });
};

router.post('/', handleAudioUpload);
router.post('/upload', handleAudioUpload);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/audio/:id
// Delete an audio file (DB record + all physical files .wav, .ulaw, .alaw, .gsm).
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const file = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(id);
    if (!file) {
      return res.status(404).json({ error: 'Ses dosyası bulunamadı.' });
    }

    // Safely decouple foreign key references and delete record in a single transaction
    const deleteTx = db.transaction(() => {
      // 1. Decouple in triggers (both broadcast audio and caller prompt audio)
      try {
        db.prepare('UPDATE triggers SET audio_file_id = NULL WHERE audio_file_id = ?').run(id);
      } catch (_) {}
      try {
        db.prepare('UPDATE triggers SET prompt_audio_id = NULL WHERE prompt_audio_id = ?').run(id);
      } catch (_) {}

      // 2. Decouple in blast_logs
      try {
        db.prepare('UPDATE blast_logs SET audio_file_id = NULL WHERE audio_file_id = ?').run(id);
      } catch (_) {}

      // 3. If this was the default sound, assign another file as default if available
      if (file.is_default === 1) {
        const another = db.prepare('SELECT id FROM audio_files WHERE id != ? LIMIT 1').get(id);
        if (another) {
          db.prepare('UPDATE audio_files SET is_default = 1 WHERE id = ?').run(another.id);
        }
      }

      // 4. Delete the audio file record from DB
      db.prepare('DELETE FROM audio_files WHERE id = ?').run(id);
    });
    deleteTx();

    // Remove physical files from disk (.wav, .ulaw, .alaw, .g722, .gsm)
    const baseId = path.basename(file.filename, path.extname(file.filename));
    for (const ext of ['.wav', '.ulaw', '.alaw', '.g722', '.gsm', '.raw_upload', '.converted.wav', '']) {
      const p = path.join(audioDir, `${baseId}${ext}`);
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      } catch (fsErr) {
        logger.warn(`Could not unlink ${p}: ${fsErr.message}`);
      }
    }
    try {
      for (const entry of fs.readdirSync(audioDir)) {
        if (entry.startsWith(`${baseId}.raw_upload`)) {
          fs.unlinkSync(path.join(audioDir, entry));
        }
      }
    } catch (fsErr) {
      logger.warn(`Could not clean raw upload files for ${baseId}: ${fsErr.message}`);
    }

    logger.info(`Audio file deleted: ${file.name} (id ${id})`);
    return res.json({ message: 'Ses dosyası başarıyla silindi.' });
  } catch (err) {
    logger.error(`Error deleting audio file ${req.params.id}: ${err.message}`);
    return res.status(500).json({ error: 'Ses dosyası silinemedi: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/audio/:id/default
// Set this audio file as the default blast audio.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/default', (req, res) => {
  try {
    const { id } = req.params;
    const file = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(id);
    if (!file) {
      return res.status(404).json({ error: 'Ses dosyası bulunamadı.' });
    }

    const setDefault = db.transaction(() => {
      db.prepare('UPDATE audio_files SET is_default = 0').run();
      db.prepare('UPDATE audio_files SET is_default = 1 WHERE id = ?').run(id);
    });
    setDefault();

    logger.info(`Default audio set to: ${file.filename} (id ${id})`);
    const updated = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(id);
    return res.json(updated);
  } catch (err) {
    logger.error(`Error setting default audio ${req.params.id}: ${err.message}`);
    return res.status(500).json({ error: 'Varsayılan ses belirlenemedi.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/audio/:id/download
// Stream / download an audio file.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/download', (req, res) => {
  try {
    const { id } = req.params;
    const file = db.prepare('SELECT * FROM audio_files WHERE id = ?').get(id);
    if (!file) {
      return res.status(404).json({ error: 'Ses dosyası bulunamadı.' });
    }

    let filePath = path.join(audioDir, file.filename);
    if (!fs.existsSync(filePath) && file.file_path && fs.existsSync(file.file_path)) {
      filePath = file.file_path;
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Ses dosyası diskte bulunamadı.' });
    }

    let contentType = 'audio/wav';
    try {
      const fd = fs.openSync(filePath, 'r');
      const header = Buffer.alloc(12);
      const bytesRead = fs.readSync(fd, header, 0, 12, 0);
      fs.closeSync(fd);

      if (bytesRead >= 4) {
        const sig4 = header.subarray(0, 4).toString('ascii');
        const sig3 = header.subarray(0, 3).toString('ascii');
        if (sig4 === 'RIFF') {
          contentType = 'audio/wav';
        } else if (sig4 === 'OggS') {
          contentType = 'audio/ogg';
        } else if (sig3 === 'ID3' || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) {
          contentType = 'audio/mpeg';
        }
      }
    } catch (mimeErr) {
      logger.warn(`Could not inspect audio header for ${filePath}: ${mimeErr.message}`);
    }

    const rawDownloadName = file.original_name || file.filename || 'audio.wav';
    const asciiFallback = rawDownloadName
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_');
    const encodedName = encodeURIComponent(rawDownloadName);

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
    );
    res.setHeader('Content-Type', contentType);
    return res.sendFile(path.resolve(filePath));
  } catch (err) {
    logger.error(`Error downloading audio ${req.params.id}: ${err.message}`);
    return res.status(500).json({ error: 'Ses dosyası indirilemedi.' });
  }
});

module.exports = router;
