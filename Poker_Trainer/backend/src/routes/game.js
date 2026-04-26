const express = require("express");
const crypto  = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

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
   ACTION HISTORY PARSER
   Syntax: "F|P5:X,P6:X,P1:X" or "T|P4:B(100),P5:C" or "R|HAND_OVER"
══════════════════════════════════════ */
function parseActionString(raw) {
  if (!raw || typeof raw !== "string") return [];
  const pipe = raw.indexOf("|");
  if (pipe === -1) return [];
  const body = raw.slice(pipe + 1).trim();
  if (body === "HAND_OVER") return "HAND_OVER";
  return body.split(",").map(seg => {
    seg = seg.trim();
    const colon = seg.indexOf(":");
    if (colon === -1) return null;
    const player = seg.slice(0, colon).trim().toUpperCase();
    const act = seg.slice(colon + 1).trim();
    if (act === "X") return { player, type: "check" };
    if (act === "F") return { player, type: "fold" };
    if (act === "C") return { player, type: "call" };
    const betM = act.match(/^B(?:\((\d+)\))?$/);
    if (betM) return { player, type: "bet", amount: parseInt(betM[1] ?? 50) };
    const raiM = act.match(/^R(?:\((\d+)\))?$/i);
    if (raiM) return { player, type: "raise", amount: parseInt(raiM[1] ?? 50) };
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

/** Return set of player numbers (1-8) who have folded after processing the given action list. */
function foldedFromActions(actions) {
  if (actions === "HAND_OVER" || !Array.isArray(actions)) return new Set();
  const folded = new Set();
  actions.forEach(a => {
    if (a.type === "fold") folded.add(parseInt(a.player.replace("P", "")));
  });
  return folded;
}

/** Get hero's hand from scenario: P1 = hero_hand, P2-P8 = p2..p8 */
function getPlayerHand(scenario, playerNum) {
  if (playerNum === 1) return scenario.hero_hand;
  return scenario[`p${playerNum}`];
}

/** True if this player folded preflop (hand is "F" or empty). */
function isPreflopFolded(scenario, playerNum) {
  const hand = getPlayerHand(scenario, playerNum);
  if (!hand || typeof hand !== "string") return true;
  const t = hand.trim().toUpperCase();
  return t === "" || t === "F" || t === "FOLD";
}

/** Simulate postflop actions to get pot and stacks at decision point.
 *  Start: pot = 1.5 (SB+BB), P2=99.5, P3=99, others 100.
 *  Stacks never go negative: bets are capped at stack (player goes all-in); all-in players skip future bet/raise.
 *  Returns { pot, stacks, heroBetSoFar } after applying flop/turn/river up to (not including) hero's action on currentStreet.
 */
function simulateToDecisionPoint(flopActions, turnActions, riverActions, currentStreet, heroPlayer) {
  const stacks = { 1: 100, 2: 99.5, 3: 99, 4: 100, 5: 100, 6: 100, 7: 100, 8: 100 };
  let pot = 1.5;
  let heroBetSoFar = 0;
  let currentBet = 0;
  let lastStreet = null;
  const allInPlayers = new Set();

  function applyAction(act) {
    if (act.street !== lastStreet) {
      lastStreet = act.street;
      currentBet = 0;
    }
    const num = parseInt(act.player.replace("P", ""), 10);
    if (act.type === "fold") return;
    if (act.type === "check") { currentBet = 0; return; }
    if (act.type === "call") {
      const maxCall = Math.max(0, stacks[num]);
      const amt = Math.min(currentBet, maxCall);
      if (amt <= 0) return;
      stacks[num] -= amt;
      if (stacks[num] < 0) stacks[num] = 0;
      if (stacks[num] === 0) allInPlayers.add(num);
      pot += amt;
      if (act.player === heroPlayer) heroBetSoFar += amt;
      return;
    }
    if (act.type === "bet" || act.type === "raise") {
      if (allInPlayers.has(num)) return; /* already all-in, skip */
      const pct = act.amount || 50;
      const rawAmt = Math.max(0, pot * (pct / 100));
      const amt = Math.min(rawAmt, Math.max(0, stacks[num]));
      if (amt <= 0) return;
      stacks[num] -= amt;
      if (stacks[num] < 0) stacks[num] = 0;
      if (stacks[num] === 0) allInPlayers.add(num);
      pot += amt;
      currentBet = amt;
      if (act.player === heroPlayer) heroBetSoFar += amt;
    }
  }

  const allActions = [];
  if (Array.isArray(flopActions)) flopActions.forEach(a => allActions.push({ ...a, street: "flop" }));
  if (Array.isArray(turnActions)) turnActions.forEach(a => allActions.push({ ...a, street: "turn" }));
  if (Array.isArray(riverActions)) riverActions.forEach(a => allActions.push({ ...a, street: "river" }));

  const streetOrder = { flop: 0, turn: 1, river: 2 };
  const stopAt = streetOrder[currentStreet];
  let reachedHeroOnCurrent = false;
  for (const act of allActions) {
    const s = streetOrder[act.street];
    if (s > stopAt) break;
    if (s === stopAt && act.isHero) {
      reachedHeroOnCurrent = true;
      break;
    }
    applyAction(act);
  }

  return { pot, stacks: { ...stacks }, heroBetSoFar };
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

async function getScenarioById(handScenarioId) {
  const { data, error } = await supabaseAdmin
    .from("hand_scenarios")
    .select("*")
    .eq("hand_scenario_id", handScenarioId)
    .single();
  if (error) throw error;
  return data;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function csvRowToObject(headers, values) {
  const obj = {};
  headers.forEach((h, idx) => {
    obj[h] = values[idx] ?? "";
  });
  return obj;
}

async function runPythonScript(scriptName, workingDir) {
  await new Promise((resolve, reject) => {
    const child = spawn("python", [scriptName], { cwd: workingDir, shell: false });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`Script failed: ${scriptName} (exit ${code}) ${stderr}`));
    });
  });
}

async function buildAndInsertGeneratedScenario() {
  const scengenDir = path.join(__dirname, "..", "scengen");
  const scripts = [
    "Pre_flop_Card_Gen_file.py",
    "prefold_scenarios.py",
    "flop_strength_eval.py",
    "generate_bets.py",
    "turn_strength_eval.py",
    "turn_betting.py",
    "fix_missing_rivers.py",
    "river_strength_eval.py",
    "river_betting.py",
    "fix_for_supabase.py",
  ];

  for (const script of scripts) {
    const fullPath = path.join(scengenDir, script);
    try {
      await fs.access(fullPath);
    } catch {
      if (script === "fix_missing_rivers.py") continue;
      throw new Error(`Missing scenario generator script: ${script}`);
    }
    await runPythonScript(script, scengenDir);
  }

  const finalCsvPath = path.join(scengenDir, "hand_scenarios_supabase_ready.csv");
  const csvRaw = await fs.readFile(finalCsvPath, "utf8");
  const lines = csvRaw.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error("Generated CSV has no scenario rows");

  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const dataLines = lines.slice(1);
  const randomLine = dataLines[Math.floor(Math.random() * dataLines.length)];
  const generatedRow = csvRowToObject(headers, parseCsvLine(randomLine));

  const { data: maxRow, error: maxErr } = await supabaseAdmin
    .from("hand_scenarios")
    .select("hand_scenario_id")
    .order("hand_scenario_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const nextId = (Number(maxRow?.hand_scenario_id) || 0) + 1;

  const rowToInsert = {
    ...generatedRow,
    hand_scenario_id: nextId,
  };

  const { error: insertErr } = await supabaseAdmin
    .from("hand_scenarios")
    .insert(rowToInsert);
  if (insertErr) throw insertErr;

  return rowToInsert;
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
   Loads a random scenario at a RANDOM street (flop/turn/river).
   Hero is a random non-folded player (P1–P8). Fixed 100BB stacks.
══════════════════════════════════════ */
router.post("/start", async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const requestedScenarioId = Number(req.body?.handScenarioId);
    const scenario = Number.isFinite(requestedScenarioId)
      ? await getScenarioById(requestedScenarioId)
      : await getRandomScenario();
    const sessionId = crypto.randomUUID();

    const flopRaw = scenario.flop_action;
    const turnRaw = scenario.turn_action;
    const riverRaw = scenario.river_action;

    const flopActions = parseActionString(flopRaw);
    const turnActions = parseActionString(turnRaw);
    const riverActions = parseActionString(riverRaw);

    const foldedAfterFlop = foldedFromActions(flopActions);
    const foldedAfterTurn = new Set([...foldedAfterFlop, ...foldedFromActions(turnActions)]);
    const foldedAfterRiver = new Set([...foldedAfterTurn, ...foldedFromActions(riverActions)]);

    const streets = [
      { street: "flop", folded: foldedAfterFlop, actions: flopActions },
      { street: "turn", folded: foldedAfterTurn, actions: turnActions },
      { street: "river", folded: foldedAfterRiver, actions: riverActions },
    ].filter(s => s.actions !== "HAND_OVER" && Array.isArray(s.actions) && s.actions.length >= 0);

    if (streets.length === 0) {
      return res.status(500).json({ error: "No valid street found in scenario (all HAND_OVER?)" });
    }

    const chosen = streets[Math.floor(Math.random() * streets.length)];
    const currentStreet = chosen.street;
    const stillIn = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => {
      if (isPreflopFolded(scenario, n)) return false;
      if (chosen.folded.has(n)) return false;
      return true;
    });
    if (stillIn.length === 0) {
      return res.status(500).json({ error: "No non-folded players in scenario" });
    }
    const heroSeat = stillIn[Math.floor(Math.random() * stillIn.length)];
    const heroPlayer = `P${heroSeat}`;

    const heroHand = getPlayerHand(scenario, heroSeat);
    const flopTagged = tagActions(flopActions, heroPlayer);
    const turnTagged = tagActions(turnActions, heroPlayer);
    const riverTagged = tagActions(riverActions, heroPlayer);

    const correctAction = currentStreet === "flop"
      ? firstHeroAction(flopTagged)
      : currentStreet === "turn"
        ? firstHeroAction(turnTagged)
        : firstHeroAction(riverTagged);

    const { pot, stacks: stacksAtDecision, heroBetSoFar } = simulateToDecisionPoint(
      flopTagged, turnTagged, riverTagged, currentStreet, heroPlayer
    );

    const initialStacks = { 1: 100, 2: 99.5, 3: 99, 4: 100, 5: 100, 6: 100, 7: 100, 8: 100 };
    const scenarioForUI = {
      hand_scenario_id: scenario.hand_scenario_id,
      currentStreet,
      heroSeat,
      hero: parseCards(heroHand),
      flop: parseCards(scenario.flop),
      turn: parseCards(scenario.turn),
      river: parseCards(scenario.river),
      pot,
      stacks: stacksAtDecision,
      initialPot: 1.5,
      initialStacks,
      heroBetSoFar,
      players: [1, 2, 3, 4, 5, 6, 7, 8].map(s => ({
        seat: s,
        style: scenario[`style_p${s}`],
        hand: parseCards(getPlayerHand(scenario, s)),
      })),
      positions: { 0: "BTN", 2: "SB", 3: "BB", 4: "UTG", 5: "UTG+1", 6: "MP", 7: "HJ", 8: "CO" },
      flopActions: flopTagged,
      turnActions: turnTagged,
      riverActions: riverTagged,
      correctAction,
    };

    const { error } = await supabaseAdmin.from("sessions").insert({
      id: sessionId,
      user_id: userId,
      hand_scenario_id: scenario.hand_scenario_id,
      status: "active",
      score: 0,
      difficulty: "Random",
      started_at: new Date(),
    });
    if (error) throw error;

    res.json({ sessionId, scenario: scenarioForUI });
  } catch (err) {
    console.error("GAME START ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/generate-next-scenario", async (req, res) => {
  try {
    await getUserIdFromToken(req);
    const scenario = await buildAndInsertGeneratedScenario();
    res.json({ handScenarioId: scenario.hand_scenario_id });
  } catch (err) {
    console.error("GENERATE SCENARIO ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   DECISION (single action: check / bet % / all-in / fold)
   Body: { userAction, correctAction, effectiveAllIn?, heroBetSoFar?, heroStack? }
   If effectiveAllIn is true (e.g. bet 100% with 50 BB left and pot 50), treat as "allin".
══════════════════════════════════════ */
router.post("/:sessionId/decision", async (req, res) => {
  const { sessionId } = req.params;
  let { userAction, correctAction, effectiveAllIn, heroBetSoFar, heroStack } = req.body;
  if (!userAction || typeof userAction !== "string")
    return res.status(400).json({ error: "userAction is required" });

  if (effectiveAllIn) userAction = "allin";

  try {
    const { data: session, error } = await supabaseAdmin
      .from("sessions").select("status").eq("id", sessionId).single();
    if (error) throw error;
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "active") return res.status(400).json({ error: "Session not active" });

  const norm = (t) => (t || "").toString().toLowerCase().replace(/\d+/g, "").trim();
  const userType = norm(userAction);
  const correctType = correctAction && correctAction.type != null ? norm(correctAction.type) : "";

  /* Action rank for partial credit: 0=check/call, 1=33%, 2=50%, 3=75%, 4=100%(pot), 5=all-in (exact only) */
  function actionRank(type, amount) {
    if (type === "fold") return -1;
    if (type === "check" || type === "call") return 0;
    if (type === "allin") return 5;
    const a = amount != null ? parseInt(amount, 10) : null;
    if (type === "bet" || type === "raise") {
      if (a === 33) return 1;
      if (a === 50) return 2;
      if (a === 75) return 3;
      if (a === 100) return 4;
      return 2;
    }
    return -2;
  }

  const correctRank = actionRank(correctType, correctAction?.amount);
  const userAmt = userAction.match(/(\d+)/)?.[1];
  const userRank = actionRank(userType, userAmt);

  let isCorrect = false;
  let score = 0;
  if (correctAction && correctType) {
    if (correctType === "fold") {
      isCorrect = userType === "fold";
      score = isCorrect ? 10 : 0;
    } else if (correctRank === 5) {
      /* All-in: exact match only */
      isCorrect = userRank === 5;
      score = isCorrect ? 10 : 0;
    } else if (userRank === correctRank) {
      isCorrect = true;
      score = 10;
    } else if (userRank >= 0 && correctRank >= 0 && Math.abs(userRank - correctRank) === 1) {
      /* One off: half points */
      isCorrect = false;
      score = 5;
    }
  }
    await supabaseAdmin.from("sessions")
      .update({ score }).eq("id", sessionId);

    const heroEquityDerived = deriveEquityFromBetAndDecision(heroBetSoFar, heroStack, userAction);

    res.json({
      correctAction: correctAction || { type: "check", amount: null },
      yourAction: userAction,
      isCorrect,
      score,
      heroBetSoFar: heroBetSoFar ?? null,
      derivedEquity: heroEquityDerived,
    });
  } catch (err) {
    console.error("DECISION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

function deriveEquityFromBetAndDecision(heroBetSoFar, heroStack, userAction) {
  const betSoFar = Number(heroBetSoFar) || 0;
  const stack = Number(heroStack) ?? 100;
  const norm = (t) => (t || "").toString().toLowerCase();
  const action = norm(userAction);
  if (action === "fold") return { source: "decision", impliedEquity: 0, heroBetSoFar: betSoFar };
  if (action === "check" || action === "call") return { source: "decision", impliedEquity: null, heroBetSoFar: betSoFar };
  const pct = userAction.match(/(\d+)/)?.[1];
  if (pct) return { source: "bet_pct", betPct: parseInt(pct, 10), heroBetSoFar: betSoFar, impliedEquity: Math.min(100, parseInt(pct, 10) + 10) };
  if (action === "allin") return { source: "decision", impliedEquity: null, heroBetSoFar: betSoFar, allIn: true };
  return { source: "decision", heroBetSoFar: betSoFar };
}

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

    const isCorrect    = session.score === 10; /* full credit only; score 5 = partial for decision quality */
    const xpGain       = Math.max(0, Number(session.score) || 0); /* 5/10 score => 5 XP, 10/10 => 10 XP */
    const earningsGain = earningsReward(isCorrect, scenario?.pot);

    await supabaseAdmin.from("sessions")
      .update({ status: "completed", completed_at: new Date() }).eq("id", sessionId);

    //Changed for error checking
    const { error: rpcError } = await supabaseAdmin.rpc("increment_user_stats_and_rank", {
      p_user_id:   session.user_id,
      p_xp_gain:   xpGain,
      p_is_correct: isCorrect,
      p_earnings:  earningsGain
    });
    if (rpcError) {
      console.error("RPC increment_user_stats_and_rank failed:", rpcError);
      throw rpcError;
    }

    res.json({ difficulty: session.difficulty, isCorrect, xpGain, earningsGain });
  } catch (err) {
    console.error("COMPLETE GAME ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;