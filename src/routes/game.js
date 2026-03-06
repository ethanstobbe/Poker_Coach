const express = require("express");
const crypto  = require("crypto");

const supabaseClient = require("../config/supabaseClient");
const supabaseAdmin  = require("../config/supabaseAdmin");

const router = express.Router();

/* ══════════════════════════════════════
   AUTH HELPER
══════════════════════════════════════ */
async function getUserIdFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw new Error("No token provided");
  const token = authHeader.split(" ")[1];
  const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !authData?.user) throw new Error("Invalid token");
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users").select("user_id").eq("auth_id", authData.user.id).maybeSingle();
  if (userErr) throw userErr;
  if (!user?.user_id) throw new Error("User not found in users table");
  return user.user_id;
}

/* ══════════════════════════════════════
   XP & SCORE HELPERS
══════════════════════════════════════ */
function xpReward(difficulty) {
  if (difficulty === "Hard")   return 20;
  if (difficulty === "Medium") return 10;
  return 5;
}
function scoreFromDiff(diff) {
  if (diff < 0.05) return 10;
  if (diff < 0.15) return 5;
  return 0;
}
function earningsReward(isCorrect, pot) {
  if (!isCorrect) return 0;
  return Math.max(1, Math.floor(Number(pot || 0) * 0.1));
}

/* ══════════════════════════════════════
   RANDOM SCENARIO
══════════════════════════════════════ */
async function getRandomScenario() {
  const { count, error } = await supabaseAdmin
    .from("hand_scenarios")
    .select("hand_scenario_id", { count: "exact", head: true });
  if (error) throw error;
  if (!count) throw new Error("No scenarios found");
  const offset = Math.floor(Math.random() * count);
  const { data, error: err } = await supabaseAdmin
    .from("hand_scenarios").select("*").range(offset, offset).single();
  if (err) throw err;
  return data;
}

/* ══════════════════════════════════════
   CARD PARSER
══════════════════════════════════════ */
function parseCards(str) {
  if (!str || typeof str !== "string") return [];
  const trimmed = str.trim();
  if (!trimmed) return [];
  if (trimmed === "F" || trimmed.toUpperCase() === "FOLD") return [];
  return trimmed.split(/\s+/).map(c => ({ rank: c[0], suit: c[1], code: c }));
}

/* ══════════════════════════════════════
   START GAME
══════════════════════════════════════ */
router.post("/start", async (req, res) => {
  try {
    const difficulty = req.body?.difficulty || "Medium";
    const userId     = await getUserIdFromToken(req);
    const scenario   = await getRandomScenario();
    const sessionId  = crypto.randomUUID();

    const { error } = await supabaseAdmin.from("sessions").insert({
      id: sessionId, user_id: userId,
      hand_scenario_id: scenario.hand_scenario_id,
      status: "active", score: 0, difficulty,
      started_at: new Date()
    });
    if (error) throw error;

    const scenarioForUI = {
      hero: parseCards(scenario.hero_hand),
      flop:  parseCards(scenario.flop),
      turn:  parseCards(scenario.turn),
      river: parseCards(scenario.river),
      pot:   scenario.pot ?? 0,
      players: [1,2,3,4,5,6,7,8].map(s => ({
        seat:  s,
        style: scenario[`style_p${s}`],
        hand:  parseCards(scenario[`p${s}`])
      }))
    };

    res.json({ sessionId, scenario: scenarioForUI, difficulty });
  } catch (err) {
    console.error("GAME START ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   DECISION (equity guess)
══════════════════════════════════════ */
router.post("/:sessionId/decision", async (req, res) => {
  const { sessionId } = req.params;
  const { userEquity } = req.body;
  if (typeof userEquity !== "number")
    return res.status(400).json({ error: "userEquity must be a number" });

  try {
    const { data: session, error } = await supabaseAdmin
      .from("sessions").select("status").eq("id", sessionId).single();
    if (error) throw error;
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "active") return res.status(400).json({ error: "Session not active" });

    const correctEquity = 0.5;
    const diff  = Math.abs(userEquity - correctEquity);
    const score = scoreFromDiff(diff);

    await supabaseAdmin.from("sessions")
      .update({ users_equity: userEquity, score }).eq("id", sessionId);

    res.json({
      correctEquity,
      yourEquity:  userEquity,
      equityDiff:  Math.round(Math.abs(userEquity - correctEquity * 100)),
      equityScore: score,
      diff,
      score
    });
  } catch (err) {
    console.error("DECISION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   COMPLETE GAME
══════════════════════════════════════ */
router.post("/:sessionId/complete", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .select("user_id,hand_scenario_id,score,difficulty")
      .eq("id", sessionId).single();
    if (error) throw error;
    if (!session) return res.status(404).json({ error: "Session not found" });

    const { data: scenario } = await supabaseAdmin
      .from("hand_scenarios").select("pot").eq("hand_scenario_id", session.hand_scenario_id).single();

    const isCorrect    = session.score > 0;
    const xpGain       = isCorrect ? xpReward(session.difficulty) : 0;
    const earningsGain = earningsReward(isCorrect, scenario?.pot);

    await supabaseAdmin.from("sessions")
      .update({ status: "completed", completed_at: new Date() }).eq("id", sessionId);

    await supabaseAdmin.rpc("increment_user_stats_and_rank", {
      p_user_id:   session.user_id,
      p_xp_gain:   xpGain,
      p_is_correct: isCorrect,
      p_earnings:  earningsGain
    });

    res.json({ difficulty: session.difficulty, isCorrect, xpGain, earningsGain });
  } catch (err) {
    console.error("COMPLETE GAME ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   AI EXPLANATION  (streaming SSE)
   POST /api/game/explain
   Body: { scenario, userActions, equityData }
══════════════════════════════════════ */
router.post("/explain", async (req, res) => {
  const { scenario, userActions, equityData } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.json({ explanation: "AI coaching unavailable — ANTHROPIC_API_KEY not set." });
  }

  /* Build a rich coaching prompt from the hand data */
  const heroCards  = (scenario?.hero  || []).map(c => `${c.rank}${c.suit}`).join(" ") || "?";
  const flopCards  = (scenario?.flop  || []).map(c => `${c.rank}${c.suit}`).join(" ") || "none";
  const turnCard   = (scenario?.turn  || []).map(c => `${c.rank}${c.suit}`).join(" ") || "none";
  const riverCard  = (scenario?.river || []).map(c => `${c.rank}${c.suit}`).join(" ") || "none";
  const pot        = scenario?.pot || 0;

  const opponents = (scenario?.players || [])
    .filter(p => p.hand?.length > 0)
    .map(p => `Seat ${p.seat} (${p.style || "Unknown"})`)
    .join(", ") || "none";

  const pfUser    = userActions?.preflop || "—";
  const pfCorrect = scenario?.preflopCorrectAction || "—";
  const pfOk      = pfUser === pfCorrect || (pfUser !== "fold" && pfCorrect !== "fold");

  const streetLines = ["flop","turn","river"].map(s => {
    const u = userActions?.[s];
    const c = scenario?.[`correct${s.charAt(0).toUpperCase()+s.slice(1)}Action`];
    if (!u && !c) return null;
    const cLabel = c ? (typeof c === "object" ? `${c.type} ${c.amount||""}%` : c) : "—";
    return `  ${s.toUpperCase()}: you played ${u||"—"}, correct was ${cLabel}`;
  }).filter(Boolean).join("\n");

  const yourEq    = equityData?.yourEquity  ?? "?";
  const correctEq = equityData?.correctEquity != null ? (equityData.correctEquity * 100).toFixed(0) : "50";
  const eqDiff    = equityData?.equityDiff   ?? "?";

  const prompt = `You are a concise, expert Texas Hold'em poker coach reviewing a student's hand.

HAND SUMMARY:
- Hero cards: ${heroCards}
- Board: Flop [${flopCards}]  Turn [${turnCard}]  River [${riverCard}]
- Pot size: ${pot} BB
- Active opponents: ${opponents}

DECISIONS:
- Preflop: hero played ${pfUser}, correct was ${pfCorrect} — ${pfOk ? "✓ correct" : "✗ wrong"}
${streetLines}
- Equity guess: hero said ${yourEq}%, correct was ${correctEq}% (off by ${eqDiff}%)

Write 3–5 sentences of coaching feedback. Be specific about:
1. Whether the preflop decision was correct and why.
2. The key postflop decisions and the poker concept behind the correct play (pot odds, equity, board texture, position).
3. One actionable tip the student should remember for next time.
Keep it clear, educational, and encouraging. No bullet points — just flowing sentences.`;

  /* Stream from Anthropic → SSE to browser */
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":    "messages-2023-12-15"
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 350,
        stream:     true,
        system:     "You are a concise Texas Hold'em poker coach. Give specific, educational feedback in 3-5 sentences.",
        messages:   [{ role: "user", content: prompt }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", errText);
      return res.json({ explanation: "AI coaching temporarily unavailable." });
    }

    /* Set SSE headers */
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");

    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            const token = parsed.delta.text;
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
          if (parsed.type === "message_stop") {
            res.write("data: [DONE]\n\n");
          }
        } catch {}
      }
    }
    res.end();

  } catch (err) {
    console.error("EXPLAIN ERROR:", err);
    /* Fallback: return plain JSON if SSE failed */
    if (!res.headersSent) {
      res.json({ explanation: "AI coaching unavailable right now." });
    }
  }
});

module.exports = router;