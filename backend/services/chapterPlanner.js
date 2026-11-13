
const OLLAMA_URL = "http://localhost:11434/api/generate";

const OLLAMA_MODEL =
    process.env.OLLAMA_MODEL || "qwen2.5:1.5b";

const DEPTH_SETTINGS = {
    quick: { chapterCount: 4 },
    deep: { chapterCount: 6 },
    masterclass: { chapterCount: 8 }
};

async function planChapters({
    topic,
    analysis,
    depth = "deep",
    audience = "beginner",
    language = "English"
}) {
    if (!topic || typeof topic !== "string" || !topic.trim()) {
        throw new Error("A valid topic is required.");
    }

    if (!analysis || typeof analysis !== "object") {
        throw new Error("Topic analysis is required.");
    }

    const settings = DEPTH_SETTINGS[depth];

    if (!settings) {
        throw new Error("Invalid video depth.");
    }

    const prompt = `
You are a professional educational course designer.

Your job is to create a high-quality educational chapter plan.

TOPIC: ${topic}
VIDEO DEPTH: ${depth}
AUDIENCE: ${audience}
LANGUAGE: ${language}

TOPIC ANALYSIS:
${JSON.stringify(analysis)}

Create EXACTLY ${settings.chapterCount} chapters.

Return only valid JSON in this structure:

{
  "topic": "",
  "depth": "",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "",
      "learningGoal": "",
      "conceptsCovered": [],
      "practicalExample": "",
      "recommendedVisual": "",
      "prerequisites": []
    }
  ]
}

IMPORTANT CONTENT QUALITY RULES:

1. Every chapter must teach a DIFFERENT subject.
2. Never repeat chapter titles, learning goals or concepts.
3. Arrange chapters in a logical learning journey.
4. Start with fundamentals and gradually move to advanced topics.
5. Explain how systems work, not just what they are.
6. Include real-world workflows and practical examples.
7. Explain how different components interact.
8. Include architecture, processes and challenges when relevant.
9. Give each chapter a specific learning goal.
10. Avoid vague goals such as "understand the system".
11. Recommend visuals that directly explain that chapter.
12. Do not suggest unrelated images or decorative logos as educational visuals.
13. The final chapter should connect the concepts and summarize the complete learning journey.
14. Do not invent private company information.
15. Distinguish publicly known facts from illustrative technical explanations.
16. Use simple, beginner-friendly ${language}.

CHAPTER DESIGN:

- QUICK: Focus on essential concepts.
- DEEP: Include mechanisms, workflows and practical examples.
- MASTERCLASS: Include fundamentals, business model, architecture,
  end-to-end workflows, technical mechanisms, challenges and
  advanced concepts where relevant.

QUALITY CHECK BEFORE RETURNING:

- Exactly ${settings.chapterCount} chapters.
- Each chapter has a unique purpose.
- No unnecessary repetition.
- Every chapter has meaningful concepts.
- Every practical example matches its chapter.
- Every visual recommendation is relevant.

Return valid JSON only. Do not include Markdown.
`;

    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            prompt,
            format: "json",
            stream: false,
            options: {
                temperature: 0.2,
                num_predict: 2200
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();

    let plan;

    try {
        plan = JSON.parse(data.response);
    } catch (error) {
        console.error("Raw chapter planner response:", data.response);
        throw new Error("Chapter planner returned invalid JSON.");
    }

  if (!plan || !Array.isArray(plan.chapters)) {
    console.error("Invalid chapter planner response:", data.response);
    throw new Error("Chapter planner returned an invalid chapter list.");
}

console.log(
    `Chapter planner generated ${plan.chapters.length} chapters. Expected ${settings.chapterCount}.`
);

if (plan.chapters.length !== settings.chapterCount) {
    console.error("Generated chapter response:", data.response);

    throw new Error(
        `Chapter planner generated ${plan.chapters.length} chapters instead of ${settings.chapterCount}.`
    );
}

    for (const chapter of plan.chapters) {
        if (
            !chapter.title ||
            !chapter.learningGoal ||
            !Array.isArray(chapter.conceptsCovered) ||
            !chapter.practicalExample ||
            !chapter.recommendedVisual
        ) {
            throw new Error("Chapter planner returned incomplete chapter data.");
        }
    }

    const titles = plan.chapters.map(chapter =>
        chapter.title.trim().toLowerCase()
    );

    if (new Set(titles).size !== titles.length) {
        throw new Error("Chapter planner returned duplicate chapter titles.");
    }

    return plan;
}

module.exports = { planChapters };
