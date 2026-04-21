const express = require("express");
const OpenAI = require("openai");

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/explain", async (req, res) => {
  try {
    const { scenario, userAction, result } = req.body;

    if (!scenario || !result) {
      return res.status(400).json({ error: "Missing required data" });
    }

    console.log(scenario);
    console.log(userAction);
    
    /*
    Proposed Change:
    - Line 80:
      - Original: ${scenario.board?.join(", ") || "No board"}
      - Updated: ${scenario.board?.length ? scenario.board.join(", ") : "Pre-flop (no community cards dealt yet)"}
      - Reason: This is a bug. The AI talks as though it and the user cannot see
                the cards on the board or even their own cards. Updated fix doesn't really help.
    */

    const prompt = `
You are a professional poker coach.

Analyze the hand and explain the best decision.

=== HERO ===
Cards: ${scenario.heroCards?.join(", ") || "Unknown"}
Position: ${scenario.heroPosition || "Unknown"}
Stack: ${scenario.heroStack || 100} BB

=== BOARD ===
${scenario.board?.join(", ") || "No board"}

=== OPPONENTS ===
${(scenario.opponents || [])
  .map(o => `Seat ${o.seat}: ${o.style}, ${o.stack} BB`)
  .join("\n") || "Unknown"}

=== ACTION HISTORY ===
${(scenario.actions || [])
  .map(a => `${a.player}: ${a.action}`)
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