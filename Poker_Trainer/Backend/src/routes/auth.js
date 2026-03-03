const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// POST /api/auth/login — validate credentials (Supabase Auth or your users table)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    // TODO: Use Supabase Auth signInWithPassword or your custom users table
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: username, password });
      if (error) return res.status(401).json({ error: error.message });
      return res.json(data);
    }
    // Fallback for local dev without Supabase
    if (username === 'admin' && password === '1234') {
      return res.json({ user: { username }, token: 'dev-token' });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

module.exports = router;
