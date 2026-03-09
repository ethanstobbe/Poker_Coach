const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../config/supabaseAdmin");

router.get("/", async (_req, res) => {
  try {
    /* Fetch users ordered by XP */
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("user_id, username, xp, rank")
      .order("xp", { ascending: false })
      .limit(50);

    if (error) throw error;

    /* Fetch all ranks in one query and build a lookup map */
    const { data: ranks } = await supabaseAdmin
      .from("ranks")
      .select("rank_id, name");

    const rankMap = {};
    (ranks || []).forEach(r => { rankMap[r.rank_id] = r.name; });

    const leaderboard = (users || []).map((player, index) => ({
      position: index + 1,
      username: player.username,
      rank:     player.rank ? (rankMap[player.rank] || "Copper") : "Copper",
      xp:       player.xp ?? 0,
    }));

    res.json(leaderboard);

  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

module.exports = router;