
const OLLAMA_URL = "http://localhost:11434/api/generate";

const OLLAMA_MODEL =
    process.env.OLLAMA_MODEL || "qwen2.5:1.5b";

const DEPTH_SETTINGS = {
    quick: {
        chapterCount: 4,
        conceptCount: 5
    },
    deep: {
        chapterCount: 6,
        conceptCount: 8
    },
    masterclass: {
        chapterCount: 8,
        conceptCount: 12
    }
};

async function analyzeTopic({
    topic,
    depth = "deep",
    audience = "beginner",
    language = "English"
}) {
    if (!topic || typeof topic !== "string" || !topic.trim()) {
        throw new Error("A valid topic is required.");
    }

    const settings = DEPTH_SETTINGS[depth];

    if (!settings) {
        throw new Error("Invalid video depth.");
    }

    const prompt = `
You are an expert educational curriculum architect.

Your task is to design a high-quality, logically structured
educational curriculum about the requested topic.

TOPIC: ${topic}
DEPTH: ${depth}
AUDIENCE: ${audience}
LANGUAGE: ${language}

REQUIRED CHAPTERS: Exactly ${settings.chapterCount}
TARGET KEY CONCEPTS: Approximately ${settings.conceptCount}

Return valid JSON using this exact structure:

{
  "topic": "",
  "category": "",
  "complexity": "",
  "overview": "",
  "learningObjectives": [],
  "keyConcepts": [
    {
      "name": "",
      "importance": "",
      "explanation": ""
    }
  ],
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "",
      "description": "",
      "learningObjective": "",
      "conceptsCovered": [],
      "uniqueFocus": "",
      "mustNotCover": []
    }
  ],
  "prerequisites": [],
  "recommendedVisuals": []
}

==================================================
CORE CURRICULUM DESIGN PRINCIPLES
==================================================

1. Design the curriculum as one connected learning journey.

2. Every chapter must teach a distinct subject.

3. Give every chapter ownership of a specific educational subject.
   No two chapters should own the same subject.

4. Every chapter must introduce meaningful new knowledge.

5. Avoid splitting one subject into multiple chapters simply
   to reach the required chapter count.

6. Do not repeat the same mechanism, workflow, algorithm,
   business process or technical concept across chapters.

7. Related subjects may reference one another, but each chapter
   must teach its own subject in depth.

8. Arrange chapters in a logical progression from fundamentals
   to more advanced understanding.

9. Select chapter subjects based on the actual requested topic.
   Do not force unrelated subjects into the curriculum.

10. Use specific and descriptive chapter titles.

11. Avoid generic titles such as:
    - Introduction
    - Advanced Concepts
    - Other Topics
    - Complete Overview
    - Summary of Everything
    - Masterclass Recap

12. The final chapter must introduce a distinct and valuable
    subject. Never use it merely to summarize earlier chapters.

==================================================
CHAPTER OWNERSHIP AND BOUNDARIES
==================================================

Every chapter must have:

TITLE:
A specific name identifying its subject.

DESCRIPTION:
What the chapter teaches and why it matters.

LEARNING OBJECTIVE:
What the learner will be able to explain or do after
completing the chapter.

CONCEPTS COVERED:
A list of specific concepts belonging to this chapter.

UNIQUE FOCUS:
A precise explanation of what makes this chapter
different from every other chapter.

MUST NOT COVER:
A list of subjects or concepts that belong to other chapters
and must not be taught in depth here.

Chapter boundaries must be meaningful.

For example, when explaining a digital platform:

- Business model is different from application design.
- Application design is different from backend architecture.
- Backend architecture is different from algorithms.
- Location tracking is different from payment processing.
- Payment processing is different from platform safety.

These are examples only. Choose appropriate subjects
for the actual requested topic.

==================================================
AVOID CONTENT OVERLAP
==================================================

Before returning the curriculum, compare every pair of chapters.

Check their:

- Titles
- Descriptions
- Learning objectives
- Concepts covered
- Unique focus
- Must-not-cover boundaries

If two chapters teach substantially the same subject,
redesign their scope.

Do not solve overlap merely by changing chapter titles.

Each chapter must contribute different knowledge.

A concept may be briefly referenced in another chapter
when needed to explain a connection. However, its detailed
teaching belongs to its designated chapter.

==================================================
DEPTH REQUIREMENTS
==================================================

QUICK:
- Exactly 4 chapters.
- Prioritize the most essential knowledge.
- Combine closely related concepts intelligently.
- Do not simply truncate a longer curriculum.

DEEP:
- Exactly 6 chapters.
- Explain important mechanisms, workflows and examples.
- Include meaningful technical or practical detail.

MASTERCLASS:
- Exactly 8 chapters.
- Cover the subject comprehensively.
- Include fundamentals, mechanisms, practical workflows,
  real-world applications and important challenges.
- Every chapter must introduce distinct knowledge.
- Do not add repetitive chapters to increase chapter count.

==================================================
FACTUAL ACCURACY
==================================================

1. Never invent confidential company information.
2. Never claim hypothetical architecture is verified architecture.
3. Distinguish public facts from illustrative explanations.
4. Avoid unsupported numerical claims and business assumptions.
5. If external research is needed to verify a claim,
   identify it as requiring research.
6. Do not present assumptions as established facts.

==================================================
FINAL CURRICULUM QUALITY CHECK
==================================================

Before returning JSON, verify:

- Exactly ${settings.chapterCount} chapters.
- Sequential chapter numbering starting at 1.
- Every chapter has a distinct educational purpose.
- No chapter exists only to summarize previous chapters.
- No substantial repetition of concepts.
- Every chapter has a meaningful learning objective.
- Every chapter has a specific unique focus.
- Every chapter has clear content boundaries.
- Chapter subjects follow a logical learning sequence.
- The curriculum genuinely fits the requested topic and depth.

Return valid JSON only.
Do not include Markdown or explanations outside the JSON.
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
                num_predict: 3000
            }
        })
    });

    if (!response.ok) {
        const errorDetails = await response.text();

        console.error(
            "Topic Analyzer Ollama error:",
            response.status,
            errorDetails
        );

        throw new Error(
            `Topic Analyzer Ollama error: ${response.status} - ${errorDetails}`
        );
    }

    const data = await response.json();

    let analysis;

    try {
        analysis = JSON.parse(data.response);
    } catch (error) {
        console.error("Raw topic analysis response:", data.response);
        throw new Error("Topic analyzer returned invalid JSON.");
    }

    if (
        !analysis ||
        !analysis.topic ||
        !Array.isArray(analysis.learningObjectives) ||
        !Array.isArray(analysis.keyConcepts) ||
        !Array.isArray(analysis.chapters)
    ) {
        throw new Error("Topic analyzer returned incomplete data.");
    }

    // Validate exact chapter count
    if (analysis.chapters.length !== settings.chapterCount) {
        throw new Error(
            `Topic analyzer generated ${analysis.chapters.length} chapters. Expected ${settings.chapterCount}.`
        );
    }

    // Validate chapter numbering and required fields
    for (let i = 0; i < analysis.chapters.length; i++) {
        const chapter = analysis.chapters[i];

        if (chapter.chapterNumber !== i + 1) {
            throw new Error(
                `Invalid chapter numbering at chapter ${i + 1}.`
            );
        }

        if (
            !chapter.title?.trim() ||
            !chapter.description?.trim() ||
            !chapter.learningObjective?.trim() ||
            !chapter.uniqueFocus?.trim() ||
            !Array.isArray(chapter.conceptsCovered) ||
            chapter.conceptsCovered.length === 0 ||
            !Array.isArray(chapter.mustNotCover)
        ) {
            throw new Error(
                `Topic analyzer returned incomplete content for chapter ${i + 1}.`
            );
        }

        if (
            chapter.conceptsCovered.some(
                concept =>
                    typeof concept !== "string" ||
                    !concept.trim()
            )
        ) {
            throw new Error(
                `Chapter ${i + 1} contains invalid concepts.`
            );
        }

        if (
            chapter.mustNotCover.some(
                concept =>
                    typeof concept !== "string" ||
                    !concept.trim()
            )
        ) {
            throw new Error(
                `Chapter ${i + 1} contains invalid content boundaries.`
            );
        }
    }

    // Validate duplicate chapter titles
    const titles = analysis.chapters.map(chapter =>
        chapter.title.trim().toLowerCase()
    );

    if (new Set(titles).size !== titles.length) {
        throw new Error(
            "Topic analyzer returned duplicate chapter titles."
        );
    }

    // Validate duplicate chapter learning objectives
    const objectives = analysis.chapters.map(chapter =>
        chapter.learningObjective.trim().toLowerCase()
    );

    if (new Set(objectives).size !== objectives.length) {
        throw new Error(
            "Topic analyzer returned duplicate learning objectives."
        );
    }

    // Validate duplicate chapter focus
    const focuses = analysis.chapters.map(chapter =>
        chapter.uniqueFocus.trim().toLowerCase()
    );

    if (new Set(focuses).size !== focuses.length) {
        throw new Error(
            "Topic analyzer returned duplicate chapter focus."
        );
    }

    // Validate excessive exact concept overlap
    for (let i = 0; i < analysis.chapters.length; i++) {
        for (let j = i + 1; j < analysis.chapters.length; j++) {
            const firstConcepts = new Set(
                analysis.chapters[i].conceptsCovered.map(concept =>
                    concept.trim().toLowerCase()
                )
            );

            const secondConcepts = new Set(
                analysis.chapters[j].conceptsCovered.map(concept =>
                    concept.trim().toLowerCase()
                )
            );

            const sharedConcepts = [...firstConcepts].filter(
                concept => secondConcepts.has(concept)
            );

            const smallerChapterSize = Math.min(
                firstConcepts.size,
                secondConcepts.size
            );

            if (
                smallerChapterSize >= 4 &&
                sharedConcepts.length >= 3 &&
                sharedConcepts.length / smallerChapterSize > 0.8
            ) {
                throw new Error(
                    `Chapters ${i + 1} and ${j + 1} have excessive concept overlap.`
                );
            }
        }
    }

    console.log(
        `Topic Analyzer successfully generated ${analysis.chapters.length} validated chapters.`
    );

    return analysis;
}

module.exports = { analyzeTopic };
