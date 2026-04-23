const express = require("express");
const OpenAI = require("openai");

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function normalizeScenario(scenario) {
  const heroCards = scenario.hero?.map(c => c.code) || [];

  const board = [
    ...(scenario.flop || []),
    ...(scenario.turn || []),
    ...(scenario.river || []),
  ].map(c => c.code);

  const heroPosition =
    scenario.positions?.[scenario.heroSeat] || "Unknown";

  const heroStack =
    scenario.stacks?.[scenario.heroSeat] ?? 100;

  const opponents = (scenario.players || [])
    .filter(p => p.seat !== scenario.heroSeat)
    .map(p => ({
      seat: p.seat,
      style: p.style,
      stack: scenario.stacks?.[p.seat] ?? 0,
    }));

  const actions = scenario.flopActions || [];

  return {
    heroCards,
    board,
    heroPosition,
    heroStack,
    opponents,
    actions,
  };
}

router.post("/explain", async (req, res) => {
  try {
    const { scenario, userAction, result } = req.body;

    if (!scenario || !result) {
      return res.status(400).json({ error: "Missing required data" });
    }

    const normalizedScenario = normalizeScenario(scenario);

    console.log("Normalized scenario:", normalizedScenario);

    const prompt = `
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

    console.log("AI Explain Prompt:", prompt);

    const response = await client.responses.create({
      model: "gpt-5-nano",
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