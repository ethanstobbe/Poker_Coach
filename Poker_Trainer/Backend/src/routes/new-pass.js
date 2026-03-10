const express = require('express');
const router = express.Router();
const supabaseAdmin = require("../config/supabaseAdmin");

// POST /api/reset-password
// Expects { access_token, newPassword }
router.post('/', async (req, res) => {
  try {
    const { password, email } = req.body || {};
    console.log("Password:", password);
    console.log("Email:", email);

    if (!email) {
      return res.status(400).json({ error: 'Could not find email' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    console.log("Finding user by email:", email);
    const { data: user, error: getUserError } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (getUserError || !user) {
      console.error('Error finding user:', getUserError);
      return res.status(404).json({ error: 'User not found' });
    }
    console.log("Found user:", user);

    // Update password
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: password
    });
    console.log("Password update result:", data, error);

    if (updateError) {
      console.error('Error updating password: ', error);
      return res.status(500).json({ error: error.message || 'Failed to reset password' });
    }

    return res.json({ message: 'Password updated successfully' });

  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;