// @ts-nocheck
/* eslint-disable */
// calculate_equity.js
// ─────────────────────────────────────────────────────────────────────────────
// Reads every row from hand_scenarios that has no hero_equity yet,
// calculates hero's equity via Monte Carlo vs all active opponents,
// then writes the result back to Supabase.
//
// Usage:
//   node calculate_equity.js              (process all missing rows)
//   node calculate_equity.js --recalc     (recalculate ALL rows, overwrite)
//   node calculate_equity.js --dry-run    (print results, no DB writes)
//   node calculate_equity.js --limit 50   (only process 50 rows then stop)
//
// Run from your project root (same folder as package.json).
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(" Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* ── Equity engine (inline, no extra file needed) ─────────────────────────── */

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

function cardIndex(code) {
  if (!code || code.length < 2) return -1;
  const r = RANKS.indexOf(code[0].toUpperCase());
  const s = SUITS.indexOf(code[1].toLowerCase());
  return r < 0 || s < 0 ? -1 : r * 4 + s;
}

function buildDeck(usedIdx) {
  const used = new Set(usedIdx);
  const d = [];
  for (let i = 0; i < 52; i++) if (!used.has(i)) d.push(i);
  return d;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function eval5(c5) {
  const rs = c5.map(i => (i / 4) | 0);
  const ss = c5.map(i => i % 4);
  const flush = ss.every(s => s === ss[0]);
  const rc = {};
  rs.forEach(r => (rc[r] = (rc[r] || 0) + 1));
  const freqs = Object.values(rc).sort((a, b) => b - a);
  const uniq  = Object.keys(rc).map(Number).sort((a, b) => b - a);

  let straight = false, sHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4)           { straight = true; sHigh = uniq[0]; }
    else if (uniq.join() === "12,3,2,1,0") { straight = true; sHigh = 3; }
  }

  let cat, kickers;
  if (straight && flush)                { cat=8; kickers=[sHigh]; }
  else if (freqs[0]===4)               { cat=7; kickers=uniq.sort((a,b)=>(rc[b]-rc[a])||(b-a)); }
  else if (freqs[0]===3&&freqs[1]===2) { cat=6; kickers=uniq.sort((a,b)=>(rc[b]-rc[a])||(b-a)); }
  else if (flush)                      { cat=5; kickers=uniq; }
  else if (straight)                   { cat=4; kickers=[sHigh]; }
  else if (freqs[0]===3)               { cat=3; kickers=uniq.sort((a,b)=>(rc[b]-rc[a])||(b-a)); }
  else if (freqs[0]===2&&freqs[1]===2) { cat=2; kickers=uniq.sort((a,b)=>(rc[b]-rc[a])||(b-a)); }
  else if (freqs[0]===2)               { cat=1; kickers=uniq.sort((a,b)=>(rc[b]-rc[a])||(b-a)); }
  else                                 { cat=0; kickers=uniq; }

  return cat * 1e10 + kickers.reduce((acc, r, i) => acc + r * Math.pow(14, 4-i), 0);
}

function eval7(c7) {
  let best = -1;
  for (let a=0;a<3;a++) for (let b=a+1;b<4;b++) for (let c=b+1;c<5;c++)
  for (let d=c+1;d<6;d++) for (let e=d+1;e<7;e++) {
    const s = eval5([c7[a],c7[b],c7[c],c7[d],c7[e]]);
    if (s > best) best = s;
  }
  return best;
}

function monteCarloMulti(heroCodes, oppCodesList, boardCodes, iterations=4000) {
  const hIdx   = heroCodes.map(cardIndex).filter(i => i >= 0);
  const oppIdx = oppCodesList
    .map(h => h.map(cardIndex).filter(i => i >= 0))
    .filter(h => h.length === 2);
  const bIdx   = boardCodes.map(cardIndex).filter(i => i >= 0);
  if (hIdx.length !== 2) return null;

  const needed = 5 - bIdx.length;
  const deck   = buildDeck([...hIdx, ...oppIdx.flat(), ...bIdx]);
  let wins = 0, ties = 0;

  for (let i = 0; i < iterations; i++) {
    shuffle(deck);
    const board5  = [...bIdx, ...deck.slice(0, needed)];
    const hScore  = eval7([...hIdx, ...board5]);
    const vBest   = oppIdx.length > 0
      ? Math.max(...oppIdx.map(o => eval7([...o, ...board5])))
      : 0;
    if (hScore > vBest)      wins++;
    else if (hScore===vBest) ties += 0.5;
  }
  return (wins + ties) / iterations;
}

/* ── Card string parser (matches your game.js format) ────────────────────── */

function parseCards(str) {
  if (!str || str.trim() === "F") return [];
  return str.trim().split(/\s+/);  // ["Ah", "Kd"] etc.
}

/* ── Hero reassignment (mirrors game.js logic exactly) ───────────────────── */

const OPP_COLS = ["p2","p3","p4","p5","p6","p7","p8"];

function resolveHeroAndOpponents(row) {
  let heroHand = row.hero_hand;
  let heroIsOrig = true;

  // Mutable copy of opp hands
  const oppHands = {};
  OPP_COLS.forEach(col => { oppHands[col] = row[col]; });

  // If hero folded preflop, borrow first active opponent
  if (!heroHand || heroHand.trim() === "F") {
    heroIsOrig = false;
    for (const col of OPP_COLS) {
      const val = oppHands[col];
      if (val && val.trim() !== "F") {
        heroHand      = val;
        oppHands[col] = "F";
        break;
      }
    }
  }

  const heroCards = parseCards(heroHand);

  // Build active opponent list (those with 2 cards)
  const oppHands2 = OPP_COLS
    .map(col => parseCards(oppHands[col]))
    .filter(h => h.length === 2);

  // Board: FLOP ONLY (3 cards) — this is the key fix.
  // Using the full 5-card board gives 0% or 100% (deterministic showdown).
  // Using only the flop lets Monte Carlo run out the turn+river randomly,
  // giving meaningful equity values like 42%, 67% etc. — correct for training.
  const board = parseCards(row.flop);   // always 3 cards

  return { heroCards, oppHands2, board };
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes("--dry-run");
const RECALC    = args.includes("--recalc");
const LIMIT_IDX = args.indexOf("--limit");
const LIMIT     = LIMIT_IDX >= 0 ? parseInt(args[LIMIT_IDX + 1]) : Infinity;

const BATCH_SIZE   = 50;    // rows fetched per Supabase query
const MC_ITERS     = 4000;  // Monte Carlo iterations per scenario (±2% accuracy)
const UPDATE_EVERY = 10;    // write to DB every N rows (reduces API calls)

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║      Poker Trainer — Equity Calculator           ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : RECALC ? "RECALCULATE ALL" : "FILL MISSING ONLY"}`);
  console.log(`Iterations per scenario: ${MC_ITERS}`);
  if (LIMIT < Infinity) console.log(`Limit: ${LIMIT} rows`);
  console.log("");

  let totalFetched  = 0;
  let totalUpdated  = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;
  let offset        = 0;
  let pendingBatch  = [];   // accumulate updates before writing

  const startTime = Date.now();

  while (true) {
    if (totalFetched >= LIMIT) break;

    // Build query
    let query = supabase
      .from("hand_scenarios")
      .select("hand_scenario_id, hero_hand, p2, p3, p4, p5, p6, p7, p8, flop, turn, river")
      .range(offset, offset + BATCH_SIZE - 1)
      .order("hand_scenario_id", { ascending: true });

    if (!RECALC) {
      query = query.is("hero_equity", null);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error("❌  Supabase fetch error:", error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      if (totalFetched >= LIMIT) break;
      totalFetched++;

      const id = row.hand_scenario_id;

      try {
        const { heroCards, oppHands2, board } = resolveHeroAndOpponents(row);

        if (heroCards.length !== 2) {
          console.log(`  [${id}] SKIP — no hero hand resolvable`);
          totalSkipped++;
          continue;
        }

        const equity = monteCarloMulti(heroCards, oppHands2, board, MC_ITERS);

        if (equity === null) {
          console.log(`  [${id}] SKIP — equity calc returned null`);
          totalSkipped++;
          continue;
        }

        const rounded = Math.round(equity * 10000) / 10000;  // 4 decimal places

        if (DRY_RUN) {
          console.log(`  [${id}] ${heroCards.join(" ")} vs ${oppHands2.length} opps on [${board.join(" ")||"preflop"}] → ${(rounded*100).toFixed(1)}%`);
        } else {
          pendingBatch.push({ id, equity: rounded });
        }

        totalUpdated++;

        // Flush batch to DB
        if (!DRY_RUN && pendingBatch.length >= UPDATE_EVERY) {
          await flushBatch(pendingBatch);
          pendingBatch = [];
        }

        // Progress log every 100 rows
        if (totalFetched % 100 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const rate    = (totalFetched / elapsed).toFixed(1);
          console.log(`  Progress: ${totalFetched} processed | ${totalUpdated} updated | ${elapsed}s | ${rate}/s`);
        }

      } catch (err) {
        console.error(`  [${id}] ERROR: ${err.message}`);
        totalErrors++;
      }
    }

    offset += BATCH_SIZE;

    // Small delay to avoid hammering Supabase rate limits
    await new Promise(r => setTimeout(r, 50));
  }

  // Flush any remaining
  if (!DRY_RUN && pendingBatch.length > 0) {
    await flushBatch(pendingBatch);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n╔══════════════════════════════════════╗");
  console.log(`║  Done in ${elapsed}s`);
  console.log(`║  Processed : ${totalFetched}`);
  console.log(`║  Updated   : ${totalUpdated}`);
  console.log(`║  Skipped   : ${totalSkipped}`);
  console.log(`║  Errors    : ${totalErrors}`);
  console.log("╚══════════════════════════════════════╝");
}

async function flushBatch(batch) {
  // Use individual updates (Supabase JS doesn't support bulk upsert easily)
  // Run in parallel (max 10 at once to avoid rate limits)
  const CONCURRENCY = 10;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(({ id, equity }) =>
      supabase
        .from("hand_scenarios")
        .update({ hero_equity: equity })
        .eq("hand_scenario_id", id)
    ));
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});