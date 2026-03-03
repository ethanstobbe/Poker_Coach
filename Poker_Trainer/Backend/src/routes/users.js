const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /api/users/me — current user profile (requires auth header in real use)
router.get('/me', async (req, res) => {
  try {
    // TODO: Resolve user from Authorization header / Supabase JWT
    if (supabase) {
      // Example: const { data } = await supabase.from('profiles').select('*').single();
      return res.json({ username: 'admin', rank: 'Bronze', xp: 0, handsPlayed: 0, handsWon: 0, chipsWon: 0 });
    }
    res.json({ username: 'admin', rank: 'Bronze', xp: 0, handsPlayed: 0, handsWon: 0, chipsWon: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/me — update profile / add XP (example)
router.patch('/me', async (req, res) => {
  try {
    const { xp } = req.body || {};
    // TODO: Update user in Supabase
    res.json({ ok: true, xp: xp ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
