const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// POST /api/signup — create new user (Supabase Auth or your users table)
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });

    if (error) {
      return res.status(400).json({ error: error.message || 'Signup failed' });
    }

    return res.json(data);  
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;