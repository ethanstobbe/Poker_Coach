// tournament.js — backend route for 10-hand tournament mode
const express = require("express");
const router  = express.Router();

const supabaseClient = require("../config/supabaseClient");
const supabaseAdmin  = require("../config/supabaseAdmin");

/* ─── difficulty ────────────────────────────────────────────────────────── */
// All 10 hands use whatever difficulty the user selected (Easy/Medium/Hard)
// DIFFICULTY_SEQ kept as same value repeated for backward compat
function makeDiffSeq(d){ return Array(10).fill(d); }

/* ─── shared helpers (mirrors game.js) ─────────────────────────────────── */
async function getUserIdFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw new Error("No token");
  const token = authHeader.split(" ")[1];
  const { data: authData, error } = await supabaseClient.auth.getUser(token);
  if (error || !authData?.user) throw new Error("Invalid token");
  const { data: user } = await supabaseAdmin
    .from("users").select("user_id").eq("auth_id", authData.user.id).maybeSingle();
  if (!user?.user_id) throw new Error("User not found");
  return user.user_id;
}

function parseCards(str) {
  if (!str || str.trim() === "F") return [];
  return str.trim().split(/\s+/).map(c => ({ rank: c[0], suit: c[1], code: c }));
}

function parseActionString(raw) {
  if (!raw || typeof raw !== "string") return [];
  const pipe = raw.indexOf("|");
  if (pipe === -1) return [];
  const streetPrefix  = raw.slice(0, pipe).trim().toUpperCase();
  const streetDefault = { "F":50, "T":66, "R":75 }[streetPrefix] ?? 50;
  const body = raw.slice(pipe + 1).trim();
  if (body === "HAND_OVER") return "HAND_OVER";
  return body.split(",").map(seg => {
    seg = seg.trim();
    const colon  = seg.indexOf(":");
    if (colon === -1) return null;
    const player = seg.slice(0, colon).trim().toUpperCase();
    const act    = seg.slice(colon + 1).trim();
    if (act === "X") return { player, type: "check" };
    if (act === "F") return { player, type: "fold"  };
    if (act === "C") return { player, type: "call"  };
    const betM = act.match(/^B(?:\((\d+)\))?$/);
    if (betM) return { player, type: "bet",   amount: parseInt(betM[1] ?? streetDefault) };
    const raiM = act.match(/^R(?:\((\d+)\))?$/i);
    if (raiM) return { player, type: "raise", amount: parseInt(raiM[1] ?? streetDefault) };
    return null;
  }).filter(Boolean);
}

function tagActions(actions, heroPlayer) {
  if (actions === "HAND_OVER") return "HAND_OVER";
  return actions.map(a => ({ ...a, isHero: a.player === heroPlayer }));
}

function firstHeroAction(taggedActions) {
  if (!Array.isArray(taggedActions)) return null;
  const h = taggedActions.find(a => a.isHero);
  return h ? { type: h.type, amount: h.amount ?? null } : null;
}

function equityScore(diff) {
  if (diff <= 0.03) return 10;
  if (diff <= 0.08) return 7;
  if (diff <= 0.15) return 4;
  if (diff <= 0.25) return 1;
  return 0;
}

async function getRandomScenario(difficulty) {
  // hand_scenarios has no difficulty column — difficulty is stored on sessions only
  // Pick a random scenario from the full table (same as game.js)
  const { count } = await supabaseAdmin
    .from("hand_scenarios")
    .select("hand_scenario_id", { count: "exact", head: true });
  const offset = Math.floor(Math.random() * (count || 1));
  const { data } = await supabaseAdmin
    .from("hand_scenarios")
    .select("*")
    .range(offset, offset);
  return data?.[0] ?? null;
}

function buildScenarioForUI(scenario) {
  const OPP_SLOTS = [
    { col:"p2", player:"P2", styleCol:"style_p2" },
    { col:"p3", player:"P3", styleCol:"style_p3" },
    { col:"p4", player:"P4", styleCol:"style_p4" },
    { col:"p5", player:"P5", styleCol:"style_p5" },
    { col:"p6", player:"P6", styleCol:"style_p6" },
    { col:"p7", player:"P7", styleCol:"style_p7" },
    { col:"p8", player:"P8", styleCol:"style_p8" },
  ];
  const POSITION_MAP = { 0:"BTN",2:"SB",3:"BB",4:"UTG",5:"UTG+1",6:"MP",7:"HJ",8:"CO" };

  const oppHands = {};
  OPP_SLOTS.forEach(s => { oppHands[s.col] = scenario[s.col]; });

  let heroHand   = scenario.hero_hand;
  let heroPlayer = "P1";
  let heroStyle  = scenario.style_p1 || "";

  if (!heroHand || heroHand.trim() === "F") {
    for (const { col, player, styleCol } of OPP_SLOTS) {
      const val = oppHands[col];
      if (val && val.trim() !== "F") {
        heroHand      = val;
        heroPlayer    = player;
        heroStyle     = scenario[styleCol] || "";
        oppHands[col] = "F";
        break;
      }
    }
  }

  const flopActions  = tagActions(parseActionString(scenario.flop_action),  heroPlayer);
  const turnActions  = tagActions(parseActionString(scenario.turn_action),  heroPlayer);
  const riverActions = tagActions(parseActionString(scenario.river_action), heroPlayer);

  const players = OPP_SLOTS.map(({ col, player, styleCol }) => ({
    seat:  parseInt(player.slice(1)),
    style: scenario[styleCol] || "",
    hand:  parseCards(oppHands[col]),
  }));

  const originalHeroFolded = !scenario.hero_hand || scenario.hero_hand.trim() === "F";

  return {
    hand_scenario_id: scenario.hand_scenario_id,
    hero:        parseCards(heroHand),
    heroPlayer,
    heroStyle,
    heroPosition: POSITION_MAP[0],
    flop:        parseCards(scenario.flop),
    turn:        parseCards(scenario.turn),
    river:       parseCards(scenario.river),
    pot:         scenario.pot ?? 0,
    players,
    positions:   POSITION_MAP,
    preflopCorrectAction: originalHeroFolded ? "fold" : "raise",
    originalHeroFolded,
    flopActions,
    turnActions,
    riverActions,
    correctFlopAction:  firstHeroAction(flopActions),
    correctTurnAction:  firstHeroAction(turnActions),
    correctRiverAction: firstHeroAction(riverActions),
    heroEquity:  scenario.hero_equity ?? null,
  };
}

/* ════════════════════════════════════════════════════════
   POST /api/tournament/start
   Creates tournament record, returns first scenario
════════════════════════════════════════════════════════ */
router.post("/start", async (req, res) => {
  try {
    const userId     = await getUserIdFromToken(req);
    const difficulty = req.body?.difficulty || "Medium";
    const DIFFICULTY_SEQ = makeDiffSeq(difficulty);
    const scenario   = await getRandomScenario(difficulty);
    if (!scenario) return res.status(500).json({ error: "No scenarios found" });

    const { data: tournament, error } = await supabaseAdmin
      .from("tournaments")
      .insert({
        user_id:      userId,
        status:       "active",
        current_hand: 1,
        total_score:  0,
        difficulty,
        hand_results: [],
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      tournamentId:   tournament.id,
      handNum:        1,
      totalHands:     10,
      difficulty,
      difficultySeq:  DIFFICULTY_SEQ,
      scenario:       buildScenarioForUI(scenario),
    });

  } catch (err) {
    console.error("TOURNAMENT START ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════
   POST /api/tournament/:id/submit
   Scores the completed hand, saves result, returns next
   hand scenario OR final results if hand 10 done.

   Body: { userEquity, userActions: {preflop,flop,turn,river},
           scenarioId }
════════════════════════════════════════════════════════ */
router.post("/:tournamentId/submit", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { userEquity, userActions, scenarioId } = req.body;

    // Load tournament
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .single();
    if (tErr || !tournament) return res.status(404).json({ error: "Tournament not found" });
    if (tournament.status === "completed") return res.status(400).json({ error: "Tournament already completed" });

    // Load scenario for correct answers
    const { data: sc } = await supabaseAdmin
      .from("hand_scenarios")
      .select("hero_equity, pot, flop, difficulty")
      .eq("hand_scenario_id", scenarioId)
      .single();

    // ── Score equity ──────────────────────────────────────
    const correctEquityFrac = sc?.hero_equity ?? 0.5;
    const userEquityFrac    = (userEquity ?? 50) / 100;
    const diff              = Math.abs(userEquityFrac - correctEquityFrac);
    const eScore            = equityScore(diff);

    // ── Score preflop action ──────────────────────────────
    const norm = t => (t||"").replace(/\d+/g,"").toLowerCase().trim();
    let actionScore = 0;
    const handNum   = tournament.current_hand;
    const difficulty = tournament.difficulty || "Medium";

    // ── Build hand result record ──────────────────────────
    const handResult = {
      handNum,
      difficulty,
      scenarioId,
      userEquity:    Math.round(userEquityFrac * 100),
      correctEquity: Math.round(correctEquityFrac * 100),
      equityDiff:    Math.round(diff * 100),
      equityScore:   eScore,
      actionScore,
      totalHandScore: eScore + actionScore,
      userActions:   userActions ?? {},
    };

    const updatedResults = [...(tournament.hand_results || []), handResult];
    const newTotal       = tournament.total_score + handResult.totalHandScore;
    const nextHand       = handNum + 1;
    const isComplete     = handNum >= 10;

    if (isComplete) {
      // ── TOURNAMENT COMPLETE ───────────────────────────────
      await supabaseAdmin.from("tournaments").update({
        status:        "completed",
        current_hand:  10,
        total_score:   newTotal,
        hand_results:  updatedResults,
        completed_at:  new Date(),
      }).eq("id", tournamentId);

      // ── Best 7 of 10: drop the 3 lowest-scoring hands ────────────────────
      const sorted      = [...updatedResults].sort((a,b) => a.totalHandScore - b.totalHandScore);
      const best7       = sorted.slice(3);          // drop 3 worst
      const best7Score  = best7.reduce((s,r) => s + r.totalHandScore, 0);
      const droppedHands = sorted.slice(0,3).map(r => r.handNum);

      // Fetch leaderboard rank for this user after save
      const { data: lbRows } = await supabaseAdmin
        .from("users")
        .select("user_id, xp")
        .order("xp", { ascending: false })
        .limit(200);
      const rank = (lbRows || []).findIndex(r => String(r.user_id) === String(tournament.user_id)) + 1;

      // Update stored score to best-7 value
      await supabaseAdmin.from("tournaments").update({ total_score: best7Score })
        .eq("id", tournamentId);

      // Update user XP (bonus for completing tournament)
      const tournamentXP = Math.floor(best7Score / 5) + 25; // base 25 XP
      await supabaseAdmin.rpc("increment_user_stats_and_rank", {
        p_user_id:    tournament.user_id,
        p_xp_gain:    tournamentXP,
        p_is_correct: best7Score > 50,
        p_earnings:   Math.floor(best7Score / 10),
      }).catch(() => {});

      return res.json({
        status:        "completed",
        handResult,
        totalScore:    best7Score,
        rawScore:      newTotal,
        handResults:   updatedResults,
        droppedHands,
        leaderboardRank: rank || null,
        xpGained:      tournamentXP,
      });
    }

    // ── NEXT HAND ─────────────────────────────────────────
    await supabaseAdmin.from("tournaments").update({
      current_hand: nextHand,
      total_score:  newTotal,
      hand_results: updatedResults,
    }).eq("id", tournamentId);

    const nextDifficulty = tournament.difficulty || "Medium";
    const nextScenario   = await getRandomScenario(nextDifficulty);
    if (!nextScenario) return res.status(500).json({ error: "No scenario for next hand" });

    res.json({
      status:      "active",
      handResult,
      totalScore:  newTotal,
      handNum:     nextHand,
      difficulty:  nextDifficulty,
      scenario:    buildScenarioForUI(nextScenario),
    });

  } catch (err) {
    console.error("TOURNAMENT SUBMIT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════
   GET /api/tournament/:id
   Returns current tournament state (for page refresh)
════════════════════════════════════════════════════════ */
router.get("/:tournamentId", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("id", req.params.tournamentId)
      .single();
    if (error || !data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;