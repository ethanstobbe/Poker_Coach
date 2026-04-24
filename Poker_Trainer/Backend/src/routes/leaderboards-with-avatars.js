const express       = require("express");
const router        = express.Router();
const supabaseAdmin = require("../config/supabaseAdmin");

const SUPABASE_URL  = process.env.SUPABASE_URL || "";
const AVATAR_BUCKET = "avatars";

function buildAvatarUrl(username) {
  if (!username || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${username}.png`;
}

router.get("/", async (_req, res) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("user_id, username, xp, rank, avatar_url, scenarios_played, scenarios_won")
      .order("xp", { ascending: false })
      .limit(50);

    if (error) throw error;

    const { data: ranks } = await supabaseAdmin
      .from("ranks")
      .select("rank_id, name");

    const rankMap = {};
    (ranks || []).forEach(r => { rankMap[r.rank_id] = r.name; });

    const leaderboard = (users || []).map((player, index) => ({
      position:  index + 1,
      username:  player.username,
      rank:      player.rank ? (rankMap[player.rank] || "Copper") : "Copper",
      handsPlayed: player.scenarios_played ?? 0,
      handsWon: player.scenarios_won ?? 0,
      xp:        player.xp ?? 0,
      avatarUrl: player.avatar_url || buildAvatarUrl(player.username),
    }));

    res.json(leaderboard);

  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

module.exports = router;