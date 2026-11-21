'use strict';

const express = require('express');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes in this file require authentication
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/numbers
// List all numbers with optional filtering by group_name and active status.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM numbers WHERE 1=1';
    const params = [];

    if (req.query.group_name) {
      sql += ' AND group_name = ?';
      params.push(req.query.group_name);
    }

    if (req.query.active !== undefined) {
      sql += ' AND active = ?';
      params.push(parseInt(req.query.active, 10));
    }

    sql += ' ORDER BY group_name, name';

    const rows = db.prepare(sql).all(...params);
    return res.json(rows);
  } catch (err) {
    logger.error(`Error listing numbers: ${err.message}`);
    return res.status(500).json({ error: 'Failed to retrieve numbers.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/numbers/groups
// List distinct group names from contact_groups and numbers.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/groups', (req, res) => {
  try {
    const fromGroups = db.prepare('SELECT name FROM contact_groups ORDER BY name').all().map(r => r.name);
    const fromNumbers = db.prepare('SELECT DISTINCT group_name FROM numbers WHERE group_name IS NOT NULL').all().map(r => r.group_name);
    
    // Merge and unique
    const allGroups = Array.from(new Set([...fromGroups, ...fromNumbers])).filter(Boolean);
    if (allGroups.length === 0) {
      allGroups.push('Genel');
    }
    return res.json(allGroups);
  } catch (err) {
    logger.error(`Error listing groups: ${err.message}`);
    return res.status(500).json({ error: 'Failed to retrieve groups.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/numbers
// Add a new phone number.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { name, number, group_name } = req.body;

    if (!name || !number) {
      return res.status(400).json({ error: 'Name and number are required.' });
    }

    // Basic phone-number sanitation: digits, +, -, spaces
    if (!/^[0-9+\-\s()]+$/.test(number)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    const result = db
      .prepare('INSERT INTO numbers (name, number, group_name) VALUES (?, ?, ?)')
      .run(name, number.replace(/[\s()-]/g, ''), group_name || 'default');

    const row = db.prepare('SELECT * FROM numbers WHERE id = ?').get(result.lastInsertRowid);
    logger.info(`Number added: ${name} - ${number} (group: ${group_name || 'default'})`);
    return res.status(201).json(row);
  } catch (err) {
    logger.error(`Error adding number: ${err.message}`);
    return res.status(500).json({ error: 'Failed to add number.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/numbers/:id
// Update an existing number.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM numbers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Number not found.' });
    }

    const { name, number, group_name, active } = req.body;

    if (number && !/^[0-9+\-\s()]+$/.test(number)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    db.prepare(
      `UPDATE numbers
         SET name       = COALESCE(?, name),
             number     = COALESCE(?, number),
             group_name = COALESCE(?, group_name),
             active     = COALESCE(?, active)
       WHERE id = ?`
    ).run(
      name || null,
      number ? number.replace(/[\s()-]/g, '') : null,
      group_name || null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );

    const updated = db.prepare('SELECT * FROM numbers WHERE id = ?').get(id);
    logger.info(`Number ${id} updated`);
    return res.json(updated);
  } catch (err) {
    logger.error(`Error updating number ${req.params.id}: ${err.message}`);
    return res.status(500).json({ error: 'Failed to update number.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/numbers/:id
// Delete a number.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM numbers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Number not found.' });
    }

    db.prepare('DELETE FROM numbers WHERE id = ?').run(id);
    logger.info(`Number ${id} deleted`);
    return res.json({ message: 'Number deleted successfully.' });
  } catch (err) {
    logger.error(`Error deleting number ${req.params.id}: ${err.message}`);
    return res.status(500).json({ error: 'Failed to delete number.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/numbers/import
// Bulk import numbers from a JSON array.
// Body: [ { name, number, group_name? }, … ]
// ─────────────────────────────────────────────────────────────────────────────
router.post('/import', (req, res) => {
  try {
    const numbers = req.body;

    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty JSON array.' });
    }

    const insert = db.prepare(
      'INSERT INTO numbers (name, number, group_name) VALUES (?, ?, ?)'
    );

    let imported = 0;
    const errors = [];

    const importAll = db.transaction(() => {
      for (let i = 0; i < numbers.length; i++) {
        const entry = numbers[i];
        if (!entry.name || !entry.number) {
          errors.push({ index: i, error: 'Missing name or number' });
          continue;
        }
        if (!/^[0-9+\-\s()]+$/.test(entry.number)) {
          errors.push({ index: i, error: 'Invalid phone number format' });
          continue;
        }
        insert.run(
          entry.name,
          entry.number.replace(/[\s()-]/g, ''),
          entry.group_name || 'default'
        );
        imported++;
      }
    });

    importAll();

    logger.info(`Bulk import: ${imported} numbers imported, ${errors.length} errors`);
    return res.status(201).json({ imported, errors });
  } catch (err) {
    logger.error(`Error importing numbers: ${err.message}`);
    return res.status(500).json({ error: 'Failed to import numbers.' });
  }
});

module.exports = router;
