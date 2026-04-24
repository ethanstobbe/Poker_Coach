const express = require("express");
const OpenAI = require("openai");

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* OLD normalizeScenario: passed all board cards regardless of street,
   included folded players, exposed potential hand data, and always used flopActions.

function normalizeScenario(scenario) {
  const heroCards = scenario.hero?.map(c => c.code) || [];
  const board = [
    ...(scenario.flop || []),
    ...(scenario.turn || []),
    ...(scenario.river || []),
  ].map(c => c.code);
  const heroPosition = scenario.positions?.[scenario.heroSeat] || "Unknown";
  const heroStack = scenario.stacks?.[scenario.heroSeat] ?? 100;
  const opponents = (scenario.players || [])
    .filter(p => p.seat !== scenario.heroSeat)
    .map(p => ({
      seat: p.seat,
      style: p.style,
      stack: scenario.stacks?.[p.seat] ?? 0,
    }));
  const actions = scenario.flopActions || [];
  return { heroCards, board, heroPosition, heroStack, opponents, actions };
}
*/


// NEW START: Replace this line and the NEW END line with /* and */ repectively to comment out this code for testing.

/* 
Specific fixes:
currentStreet: tracks hand data for the current turn. Only sending relevant information to the AI coach.
*/
function normalizeScenario(scenario) {
  const heroCards = scenario.hero?.map(c => c.code) || [];
  const currentStreet = scenario.currentStreet || "flop";

  // Only include board cards dealt up to and including the currentStreet
  const board = [...(scenario.flop || []).map(c => c.code)];
  if (currentStreet === "turn" || currentStreet === "river")
    board.push(...(scenario.turn || []).map(c => c.code));
  if (currentStreet === "river")
    board.push(...(scenario.river || []).map(c => c.code));

  const heroPosition = scenario.positions?.[scenario.heroSeat] || "Unknown";
  const heroStack = scenario.stacks?.[scenario.heroSeat] ?? 100;

  // Empties the hand array for player who folded preflop
  const preflopFolded = new Set(
    (scenario.players || [])
      .filter(p => !p.hand || p.hand.length === 0)
      .map(p => p.seat)
  );

  // Collect seats that folded during streets up to and including the currentStreet
  const streetOrder = ["flop", "turn", "river"];
  const streetActionMap = {
    flop: scenario.flopActions,
    turn: scenario.turnActions,
    river: scenario.riverActions,
  };
  const postflopFolded = new Set();
  for (const s of streetOrder.slice(0, streetOrder.indexOf(currentStreet) + 1)) {
    const acts = streetActionMap[s];
    if (Array.isArray(acts)) {
      acts.forEach(a => {
        if (a.type === "fold")
          postflopFolded.add(parseInt(a.player.replace("P", ""), 10));
      });
    }
  }

  const foldedSeats = new Set([...preflopFolded, ...postflopFolded]);

  // Current-street actions that happened BEFORE the hero's turn
  const currentStreetActions = Array.isArray(streetActionMap[currentStreet])
    ? streetActionMap[currentStreet]
    : [];
  const actionsBeforeHero = [];
  for (const a of currentStreetActions) {
    if (a.isHero) break;
    actionsBeforeHero.push(a);
  }

  // Shows the opponents that are still in the game:
  // Show only seat, style, stack, and their last action this street
  const opponents = (scenario.players || [])
    .filter(p => p.seat !== scenario.heroSeat && !foldedSeats.has(p.seat))
    .map(p => {
      const tag = `P${p.seat}`;
      const last = actionsBeforeHero.filter(a => a.player === tag).slice(-1)[0];
      return {
        seat: p.seat,
        style: p.style,
        stack: scenario.stacks?.[p.seat] ?? 0,
        lastAction: last
          ? `${last.type}${last.amount != null ? ` ${last.amount}%` : ""}`
          : "yet to act",
      };
    });

  const outSeats = (scenario.players || [])
    .filter(p => p.seat !== scenario.heroSeat && foldedSeats.has(p.seat))
    .map(p => p.seat);

  return {
    heroCards,
    board,
    heroPosition,
    heroStack,
    currentStreet,
    opponents,
    outSeats,
  };
}
// NEW END

router.post("/explain", async (req, res) => {
  try {
    const { scenario, userAction, result } = req.body;

    if (!scenario || !result) {
      return res.status(400).json({ error: "Missing required data" });
    }

    const normalizedScenario = normalizeScenario(scenario);

    console.log("Normalized scenario:", normalizedScenario);

/* OLD PROMPT: showed all board cards (including unseen streets), listed all opponents
   (including folded ones), and referenced normalizedScenario.actions which always came
   from flopActions regardless of the current street.
   
   const oldPrompt = `
You are a professional poker coach.

Analyze the hand and explain the best decision.

=== HERO ===
Cards: ${normalizedScenario.heroCards?.join(", ") || "Unknown"}
Position: ${normalizedScenario.heroPosition || "Unknown"}
Stack: ${normalizedScenario.heroStack || 100} BB

=== BOARD ===
${normalizedScenario.board?.join(", ") || "No board"}

=== OPPONENTS ===
${(normalizedScenario.opponents || [])
  .map(o => `Seat ${o.seat}: ${o.style}, ${o.stack} BB`)
  .join("\n") || "Unknown"}

=== ACTION HISTORY ===
${normalizedScenario.actions
  .map(a => `${a.player}: ${a.type}${a.amount ? ` ${a.amount}` : ""}`)
  .join("\n") || "None"}

=== DECISION ===
Player chose: ${userAction}
Correct action: ${result.correctAction?.type || "Unknown"} ${
      result.correctAction?.amount
        ? result.correctAction.amount + "%"
        : ""
    }

Analyze and explain the user's decision in 2-4 sentences
`;
END OLD PROMPT
*/


/* 
NEW PROMPT: only reveals information the player legitimately has at decision time,
board cards up to currentStreet, no opponent hole cards, only opponents still active,
and each opponent's last action on the current street before the hero acts.

SPECIFIC FIXES:
Street: ${normalizedScenario.currentStreet || "Unknown"} (For BOARD)

=== OPPONENTS STILL IN ===
Uses a map to indicate an opponent's seat and their last action

=== PLAYERS OUT ==
Iterates through the map to check for opponents who had their hand arrays emptied (folded)
*/

// FIXME: Prompt takes a long time to generate a response.
    const prompt = `
You are a professional poker coach.

Analyze the hand and explain the best decision.

=== HERO ===
Cards: ${normalizedScenario.heroCards?.join(", ") || "Unknown"}
Position: ${normalizedScenario.heroPosition || "Unknown"}
Stack: ${normalizedScenario.heroStack || 100} BB
Street: ${normalizedScenario.currentStreet || "Unknown"}

=== BOARD (${normalizedScenario.currentStreet}) ===
${normalizedScenario.board?.join(", ") || "No board"}

=== OPPONENTS STILL IN ===
${(normalizedScenario.opponents || [])
  .map(o => `Seat ${o.seat} (${o.style}, ${o.stack} BB): ${o.lastAction}`)
  .join("\n") || "None"}

=== PLAYERS OUT ===
${normalizedScenario.outSeats?.length
  ? normalizedScenario.outSeats.map(s => `Seat ${s}`).join(", ")
  : "None"}

=== DECISION ===
Player chose: ${userAction}
Correct action: ${result.correctAction?.type || "Unknown"}${
      result.correctAction?.amount != null
        ? " " + result.correctAction.amount + "%"
        : ""
    }

Analyze and explain the user's decision in 2-4 sentences
`;
// END NEW PROMPT */

    console.log("AI Explain Prompt:", prompt);

    const response = await client.responses.create({
      model: "gpt-5.5", // Changed to gpt-5.5 for better performance. (originally: gpt-5.4 nano)
      input: prompt,
      store: true,
    });

    const explanation =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "No explanation generated.";

    console.log("AI Explanation Generated:", explanation);
    res.json({ explanation });
  } catch (err) {
    console.error("AI Explain Error:", err);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});
module.exports = router;