const express = require("express");
const router = express.Router();

const supabaseClient = require("../config/supabaseClient");
const supabaseAdmin = require("../config/supabaseAdmin");
/*
POST /api/auth/login
*/

router.post("/login", async (req, res) => {

  try {

    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required"
      });
    }

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) {

      console.error("LOGIN ERROR:", error);

      return res.status(401).json({
        error: "Invalid email or password"
      });

    }

    res.json({

      access_token: data.session.access_token,

      user: {
        id: data.user.id,
        email: data.user.email
      }

    });

  } catch (err) {

    console.error("AUTH ERROR:", err);

    res.status(500).json({
      error: "Authentication failed"
    });

  }

});

module.exports = router;