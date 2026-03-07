const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// POST /api/auth/login — validate credentials (Supabase Auth or your users table)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json(data);  
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

  /* // Fallback for local dev without Supabase
  if (emailOrUsername === 'admin' && password === '1234') {
    return res.json({ username: 'admin', token: 'dev-token' });
  }  */

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

module.exports = router;