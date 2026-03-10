const express = require('express');
const router = express.Router();
const supabaseClient = require("../config/supabaseClient");
const supabaseAdmin = require("../config/supabaseAdmin");

// POST /api/forgot-password -- leave it blank, frontend is formatted for it like this
router.post('/', async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    const { data, error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `http://localhost:3000/new-password.html?email=${encodeURIComponent(email)}`
    });

    if (error) {
      console.log("Supabase password reset error:", error);
    }

    if (error) return res.status(400).json({ error: error.message || 'Failed to send recovery email' });
     
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
    console.error(err);
  }
});

module.exports = router;