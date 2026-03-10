// const express = require("express");
// const router = express.Router();

// // const supabaseClient = require("../config/supabaseClient");
// const supabaseAdmin = require("../config/supabaseAdmin");

// /*
// GET /api/users/me
// Returns the logged-in user's profile dashboard
// */

// router.get("/me", async (req, res) => {

//   try {

//     const authHeader = req.headers.authorization;

//     if (!authHeader) {
//       return res.status(401).json({
//         error: "No token provided"
//       });
//     }

//     const token = authHeader.split(" ")[1];

//     /* Verify Supabase JWT */

//     const { data: authData, error: authError } =
//       await supabaseClient.auth.getUser(token);

//     if (authError || !authData?.user) {

//       return res.status(401).json({
//         error: "Invalid token"
//       });

//     }

//     const authId = authData.user.id;

//     /* Fetch player profile */

//     const { data, error } = await supabaseAdmin
//       .from("users")
//       .select(`
//         user_id,
//         username,
//         xp,
//         scenarios_played,
//         scenarios_won,
//         correct_play_percentage,
//         life_time_earning,
//         rank:ranks (
//           name
//         )
//       `)
//       .eq("auth_id", authId)
//       .single();

//     if (error || !data) {

//       return res.status(404).json({
//         error: "User not found"
//       });

//     }

//     res.json({

//       username: data.username,

//       rank: data.rank?.name || "Unranked",

//       xp: data.xp,

//       handsPlayed: data.scenarios_played,

//       handsWon: data.scenarios_won,

//       winrate: data.correct_play_percentage,

//       earnings: data.life_time_earning

//     });

//   } catch (err) {

//     console.error("User profile error:", err);

//     res.status(500).json({
//       error: "Failed to load user profile"
//     });

//   }

// });
const express = require("express");
const router = express.Router();

const supabaseClient = require("../config/supabaseClient");
const supabaseAdmin  = require("../config/supabaseAdmin");

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const { data: authData, error: authError } =
      await supabaseClient.auth.getUser(token);

    if (authError || !authData?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const authId = authData.user.id;

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("user_id, username, avatar_url, xp, rank, scenarios_played, scenarios_won, correct_play_percentage, life_time_earning")
      .eq("auth_id", authId)
      .maybeSingle();

    if (userErr) {
      console.error("[users/me] query error:", userErr);
      return res.status(500).json({ error: "Database error", detail: userErr.message });
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let rankName = "Copper";
    if (user.rank) {
      const { data: rankRow } = await supabaseAdmin
        .from("ranks")
        .select("name")
        .eq("rank_id", user.rank)
        .maybeSingle();

      if (rankRow?.name) rankName = rankRow.name;
    }

    const played = user.scenarios_played ?? 0;
    const won = user.scenarios_won ?? 0;
    const winrate = user.correct_play_percentage
      ?? (played > 0 ? Math.round((won / played) * 100) : 0);

    res.json({
      username: user.username,
      avatar_url: user.avatar_url ?? null,
      rank: rankName,
      xp: user.xp ?? 0,
      handsPlayed: played,
      handsWon: won,
      winrate,
      earnings: user.life_time_earning ?? 0,
    });

  } catch (err) {
    console.error("[users/me] exception:", err);
    res.status(500).json({ error: "Failed to load user profile" });
  }
});

module.exports = router;
