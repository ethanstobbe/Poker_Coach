const express = require("express");
const OpenAI = require("openai");

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


/*
Change: introduced user selected experience level.
These personas change the tone and depth of ChatGPT's response.
There are 4 levels/personas:
- Newbie: 
   Simple explanations, no poker jargon. Explains like the user has never played poker before.

- Beginner: 
    Same as above with little poker jargon. Assumes the player knows how a poker hand plays out.

- Intermediate:
    More detailed explanations. Introduces some poker terminology and concepts, but still accessible to non-experts.
    
- Expert:
    Highly technical analysis. Assumes the player knows about high level poker conecepts (GTO, EV, equity, etc.)
*/

const expLevelConfig = {
  newbie: {
    persona: "You are a patient, encouraging poker coach talking to someone who has never played poker before.",
    instruction: "Explain in 2–4 sentences using everyday analogies and zero poker jargon. Imagine explaining to a friend who has never seen a card game. Define every single term you use."
  },
  beginner: {
    persona: "You are a supportive poker coach talking to someone who knows the basic rules but hasn't played much.",
    instruction: "Explain in 2–4 sentences using simple language. You can use basic terms like 'fold', 'call', or 'raise', but briefly explain any strategy concept or less common term."
  },
  intermediate: {
    persona: "You are a poker coach talking to a casual player who plays for fun with friends, but also wants to sharpen their skills and beat them.",
    instruction: "Explain in 2–4 sentences. You can use standard poker terms, but keep strategy explanations clear and practical."
  },
  advanced: {
    persona: "You are a professional poker coach talking to an experienced player comfortable with high-level play.",
    instruction: "Explain in 2–4 sentences using full poker terminology and concepts (GTO, EV, equity, range, etc.). Be concise and technical."
  }
};

router.post("/explain", async (req, res) => {
  try {
    // OLD: const { scenario, userAction, result } = req.body;
    // NEW: Experience level using default value of beginner:
    const { scenario, userAction, result, experienceLevel = "beginner" } = req.body;

    if (!scenario || !result) {
      return res.status(400).json({ error: "Missing required data" });
    }

    console.log(scenario);
    console.log(userAction);

    // Experience level
    const { persona, instruction } = expLevelConfig[experienceLevel] || expLevelConfig.beginner;
    
    /*
    Proposed Change:
    - Line 87:
      - Original: ${scenario.board?.join(", ") || "No board"}
      - Updated: ${scenario.board?.length ? scenario.board.join(", ") : "Pre-flop (no community cards dealt yet)"}
      - Reason: This is a bug. The AI talks as though it and the user cannot see
                the cards on the board or even their own cards. Updated fix doesn't really help.
    
    Actual Changes:
    - Line 77:
      - Persona inserted into the beginning of the prompt
        Based on the user's selected experience level.
    */

    const prompt = `
${persona}

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

${instruction}
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

// NEW: /chat route to make the AI more interactive 
router.post("/chat", async (req, res) => {
  try {
    const { scenario, userAction, experienceLevel = "beginner", history = [] } = req.body;

    if (!scenario || !Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: "Missing required data" });
    }

    // Server-side limits
    const lastMsg = history[history.length - 1];
    if (history.length > 10 || (lastMsg?.content?.length ?? 0) > 500) {
      return res.status(400).json({ error: "Message limit exceeded" });
    }

    const { persona, instruction } = expLevelConfig[experienceLevel] || expLevelConfig.beginner;

    const systemPrompt = `${persona}
You are continuing a conversation about a poker hand the player just completed. Answer follow-up questions concisely (2–3 sentences).

=== HAND CONTEXT ===
Cards: ${scenario.heroCards?.join(", ") || "Unknown"}
Position: ${scenario.heroPosition || "Unknown"}
Board: ${scenario.board?.length ? scenario.board.join(", ") : "Pre-flop"}
Player chose: ${userAction || "Unknown"}

${instruction}`;

    // history already ends with the user's latest question
    const response = await client.responses.create({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: systemPrompt },
        ...history
      ],
      store: true,
    });

    const reply =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "No reply generated.";

    console.log("AI Chat Reply:", reply);
    res.json({ reply });

  } catch (err) {
    console.error("AI Chat Error:", err);
    res.status(500).json({ error: "Failed to generate reply" });
  }
});
module.exports = router;