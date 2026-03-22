const express = require('express');
const { authenticate } = require('../auth');
const db = require('../database');

const router = express.Router();

router.get('/global', (req, res) => {
  try {
    const stats = db.getGlobalStats();
    res.json({ stats });
  } catch (err) {
    console.error('Global stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, (req, res) => {
  try {
    const stats = db.getUserStats(req.user.id);
    res.json({ stats });
  } catch (err) {
    console.error('User stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
