const express = require('express');
const router = express.Router();
const supabaseClient = require("../config/supabaseClient");
const supabaseAdmin = require("../config/supabaseAdmin");

// POST /api/signup — -- leave it blank, frontend is formatted for it like this
router.post('/', async (req, res) => {
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

    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });

    if (error) {
      console.error("Supabase signup error:", error);
      return res.status(400).json({ error: error.message || 'Signup failed' });
    }

    // Create a new row in the users table for this user
    await supabaseAdmin.from('users').insert({ id: data.id, email: data.email });

    return res.json(data);  
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;