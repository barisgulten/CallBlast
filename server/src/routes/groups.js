'use strict';

const express = require('express');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups
// List all groups with member counts.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.created_at,
        COUNT(n.id) AS member_count
      FROM contact_groups g
      LEFT JOIN numbers n ON g.name = n.group_name
      GROUP BY g.id, g.name
      ORDER BY g.name ASC
    `).all();

    return res.json(groups);
  } catch (err) {
    logger.error(`Error listing contact groups: ${err.message}`);
    return res.status(500).json({ error: 'Gruplar alınamadı.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups
// Add a new contact group.
// Body: { name, description }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Grup adı zorunludur.' });
    }

    const cleanName = name.trim();

    // Check duplicate
    const existing = db.prepare('SELECT id FROM contact_groups WHERE LOWER(name) = LOWER(?)').get(cleanName);
    if (existing) {
      return res.status(400).json({ error: `"${cleanName}" adında bir grup zaten mevcut.` });
    }

    const result = db.prepare('INSERT INTO contact_groups (name, description) VALUES (?, ?)').run(
      cleanName,
      description ? description.trim() : null
    );

    const created = db.prepare('SELECT * FROM contact_groups WHERE id = ?').get(result.lastInsertRowid);
    logger.info(`Contact group created: ${cleanName}`);
    return res.status(201).json(created);
  } catch (err) {
    logger.error(`Error adding contact group: ${err.message}`);
    return res.status(500).json({ error: 'Grup eklenemedi.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/groups/:id
// Delete a contact group. Moves existing members to 'Genel'.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const group = db.prepare('SELECT * FROM contact_groups WHERE id = ?').get(id);
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı.' });
    }

    // Move any numbers in this group to 'Genel'
    db.prepare("UPDATE numbers SET group_name = 'Genel' WHERE group_name = ?").run(group.name);
    // Update any triggers targeting this group to 'all'
    db.prepare("UPDATE triggers SET group_name = 'all' WHERE group_name = ?").run(group.name);

    db.prepare('DELETE FROM contact_groups WHERE id = ?').run(id);
    logger.info(`Contact group deleted: ${group.name} (id ${id})`);
    return res.json({ message: `"${group.name}" grubu silindi.` });
  } catch (err) {
    logger.error(`Error deleting contact group ${req.params.id}: ${err.message}`);
    return res.status(500).json({ error: 'Grup silinemedi.' });
  }
});

module.exports = router;
