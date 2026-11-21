'use strict';

const express = require('express');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/triggers
// List all triggers with their associated audio file and group info.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const triggers = db.prepare(`
      SELECT 
        t.*,
        a.name AS audio_name,
        a.original_name AS audio_original_name,
        pa.name AS prompt_audio_name,
        pa.original_name AS prompt_audio_original_name
      FROM triggers t
      LEFT JOIN audio_files a ON t.audio_file_id = a.id
      LEFT JOIN audio_files pa ON t.prompt_audio_id = pa.id
      ORDER BY t.created_at DESC
    `).all();

    return res.json(triggers);
  } catch (err) {
    logger.error(`Error listing triggers: ${err.message}`);
    return res.status(500).json({ error: 'Tetikleyiciler alınamadı.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/triggers
// Create a new trigger.
// Body: { name, number, audio_file_id, group_name, description, active }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { name, number, audio_file_id, prompt_audio_id, group_name, description, active } = req.body;

    if (!name || !number) {
      return res.status(400).json({ error: 'Tetikleyici adı ve arama numarası gereklidir.' });
    }

    const cleanNumber = String(number).trim();
    if (!/^[0-9+*#]{1,20}$/.test(cleanNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    // Check if number is already in use
    const existing = db.prepare('SELECT id FROM triggers WHERE number = ?').get(cleanNumber);
    if (existing) {
      return res.status(400).json({ error: `"${number}" numarası zaten başka bir tetikleyicide tanımlı.` });
    }

    const result = db.prepare(`
      INSERT INTO triggers (name, number, audio_file_id, prompt_audio_id, group_name, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      String(number).trim(),
      audio_file_id || null,
      prompt_audio_id || null,
      group_name || 'all',
      description ? description.trim() : null,
      active !== undefined ? (active ? 1 : 0) : 1
    );

    const created = db.prepare(`
      SELECT 
        t.*,
        a.name AS audio_name,
        pa.name AS prompt_audio_name
      FROM triggers t
      LEFT JOIN audio_files a ON t.audio_file_id = a.id
      LEFT JOIN audio_files pa ON t.prompt_audio_id = pa.id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    logger.info(`Trigger created: ${name} (${number}) for group "${group_name || 'all'}"`);
    return res.status(201).json(created);
  } catch (err) {
    logger.error(`Error creating trigger: ${err.message}`);
    return res.status(500).json({ error: 'Tetikleyici oluşturulamadı.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/triggers/:id
// Update an existing trigger.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, number, audio_file_id, prompt_audio_id, group_name, description, active } = req.body;

    const existing = db.prepare('SELECT * FROM triggers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Tetikleyici bulunamadı.' });
    }

    if (number !== undefined && number !== null && String(number).trim() !== '') {
      const cleanNumber = String(number).trim();
      if (!/^[0-9+*#]{1,20}$/.test(cleanNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format.' });
      }
      if (cleanNumber !== existing.number) {
        const duplicate = db.prepare('SELECT id FROM triggers WHERE number = ? AND id != ?').get(cleanNumber, id);
        if (duplicate) {
          return res.status(400).json({ error: `"${number}" numarası zaten başka bir tetikleyicide tanımlı.` });
        }
      }
    }

    db.prepare(`
      UPDATE triggers
      SET name = ?,
          number = ?,
          audio_file_id = ?,
          prompt_audio_id = ?,
          group_name = ?,
          description = ?,
          active = ?
      WHERE id = ?
    `).run(
      name ? name.trim() : existing.name,
      number ? String(number).trim() : existing.number,
      audio_file_id !== undefined ? (audio_file_id || null) : existing.audio_file_id,
      prompt_audio_id !== undefined ? (prompt_audio_id || null) : existing.prompt_audio_id,
      group_name !== undefined ? group_name : existing.group_name,
      description !== undefined ? description : existing.description,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      id
    );

    const updated = db.prepare(`
      SELECT 
        t.*,
        a.name AS audio_name,
        pa.name AS prompt_audio_name
      FROM triggers t
      LEFT JOIN audio_files a ON t.audio_file_id = a.id
      LEFT JOIN audio_files pa ON t.prompt_audio_id = pa.id
      WHERE t.id = ?
    `).get(id);

    logger.info(`Trigger updated: id=${id} (${updated.name})`);
    return res.json(updated);
  } catch (err) {
    logger.error(`Error updating trigger ${req.params.id}: ${err.message}`);
    return res.status(500).json({ error: 'Tetikleyici güncellenemedi.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/triggers/:id
// Delete a trigger.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM triggers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Tetikleyici bulunamadı.' });
    }

    db.prepare('DELETE FROM triggers WHERE id = ?').run(id);
    logger.info(`Trigger deleted: id=${id} (${existing.name})`);
    return res.json({ message: 'Tetikleyici silindi.' });
  } catch (err) {
    logger.error(`Error deleting trigger ${req.params.id}: ${err.message}`);
    return res.status(500).json({ error: 'Tetikleyici silinemedi.' });
  }
});

module.exports = router;
