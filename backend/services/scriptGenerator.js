
const OLLAMA_URL = "http://localhost:11434/api/generate";

const OLLAMA_MODEL =
    process.env.OLLAMA_MODEL || "qwen2.5:1.5b";

function countWords(text) {
    return (text.match(/\S+/g) || []).length;
}

// Limit text to a maximum number of words.
function limitWords(text, maximum) {
    if (typeof text !== "string" || maximum <= 0) {
        return "";
    }

    const words = text.trim().split(/\s+/);

    if (words.length <= maximum) {
        return text.trim();
    }

    const limited = words.slice(0, maximum);

    // Prefer a natural sentence ending.
    for (
        let i = limited.length - 1;
        i >= Math.max(0, limited.length - 8);
        i--
    ) {
        if (/[.!?]$/.test(limited[i])) {
            return limited.slice(0, i + 1).join(" ");
        }
    }

    return limited.join(" ");
}

// Allocate narration words according to section duration.
function allocateWordBudgets(totalWords, sections) {
    const hookWords = Math.max(1, Math.floor(totalWords * 0.15));
    const closingWords = Math.max(1, Math.floor(totalWords * 0.08));

    const availableWords = Math.max(
        0,
        totalWords - hookWords - closingWords
    );

    const totalSectionDuration = sections.reduce(
        (total, section) => total + section.durationSeconds,
        0
    );

    let allocated = 0;

    const sectionBudgets = sections.map((section, index) => {
        let words;

        if (index === sections.length - 1) {
            words = availableWords - allocated;
        } else {
            words = Math.floor(
                availableWords *
                (section.durationSeconds / totalSectionDuration)
            );
        }

        allocated += words;

        return Math.max(0, words);
    });

    return {
        hookWords,
        closingWords,
        sectionBudgets
    };
}

async function generateScript({ learningPlan }) {
    if (
        !learningPlan ||
        typeof learningPlan !== "object" ||
        Array.isArray(learningPlan)
    ) {
        throw new Error("A valid learning plan is required.");
    }

    const {
        topic,
        durationSeconds,
        depth,
        language,
        targetAudience,
        narrationWordBudget,
        sections
    } = learningPlan;

    if (
        !topic ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds < 30 ||
        durationSeconds > 300 ||
        !Array.isArray(sections) ||
        sections.length === 0
    ) {
        throw new Error("Learning plan contains invalid data.");
    }

    if (
        !narrationWordBudget ||
        !Number.isInteger(narrationWordBudget.maximum) ||
        narrationWordBudget.maximum <= 0 ||
        !Number.isInteger(narrationWordBudget.minimum) ||
        narrationWordBudget.minimum <= 0 ||
        narrationWordBudget.minimum > narrationWordBudget.maximum
    ) {
        throw new Error("A valid narration word budget is required.");
    }

    for (const section of sections) {
        if (
            !Number.isInteger(section.durationSeconds) ||
            section.durationSeconds <= 0 ||
            typeof section.title !== "string" ||
            !section.title.trim()
        ) {
            throw new Error("Learning plan contains an invalid section.");
        }
    }

    const wordBudgets = allocateWordBudgets(
        narrationWordBudget.maximum,
        sections
    );

    const sectionDetails = sections.map((section, index) => ({
        sectionNumber: section.sectionNumber,
        title: section.title,
        purpose: section.purpose,
        durationSeconds: section.durationSeconds,
        maximumNarrationWords: wordBudgets.sectionBudgets[index],
        keyPoints: section.keyPoints
    }));

    const prompt = `
You are an educational video scriptwriter.

Create a SHORT educational narration script.

TOPIC: ${topic}
VIDEO DURATION: ${durationSeconds} seconds
DEPTH: ${depth}
LANGUAGE: ${language}
AUDIENCE: ${targetAudience}

STRICT WORD LIMITS:

Hook: maximum ${wordBudgets.hookWords} words.
Closing: maximum ${wordBudgets.closingWords} words.

APPROVED SECTIONS:

${JSON.stringify(sectionDetails)}

IMPORTANT:

1. Generate exactly ${sections.length} sections.
2. Use the exact approved section titles.
3. Preserve section order and numbering.
4. Do not create extra sections.
5. Follow each section's maximum word limit.
6. Use simple, natural spoken ${language}.
7. Explain only the approved key points.
8. Avoid long introductions and filler.
9. Do not invent company internals or statistics.
10. Mark claims requiring verification in factCheckNotes.
11. Keep narration concise.
12. The total narration must not exceed ${narrationWordBudget.maximum} words.

RETURN ONLY VALID JSON:

{
  "title": "",
  "hook": "",
  "sections": [
    {
      "sectionNumber": 1,
      "title": "",
      "narration": "",
      "visualDirection": "",
      "onScreenText": "",
      "transitionToNext": ""
    }
  ],
  "closing": "",
  "factCheckNotes": []
}

Every section must contain all six fields.
Do not add explanations outside the JSON.
`;

    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            prompt,
            format: "json",
            stream: false,
            options: {
                temperature: 0.1,
                num_predict: 1000
            }
        })
    });

    if (!response.ok) {
        const errorDetails = await response.text();

        console.error(
            "Script Generator Ollama error:",
            response.status,
            errorDetails
        );

        throw new Error(
            `Script Generator Ollama error: ${response.status}`
        );
    }

    const data = await response.json();

    let script;

    try {
        script = JSON.parse(data.response);
    } catch {
        console.error("Raw script response:", data.response);

        throw new Error(
            "Script Generator returned invalid JSON."
        );
    }

    if (
        !script ||
        typeof script.title !== "string" ||
        typeof script.hook !== "string" ||
        !Array.isArray(script.sections) ||
        typeof script.closing !== "string"
    ) {
        throw new Error(
            "Script Generator returned incomplete data."
        );
    }

    if (script.sections.length < sections.length) {
        throw new Error(
            `AI returned ${script.sections.length} sections. Expected ${sections.length}.`
        );
    }

    // Preserve approved sections and normalize generated content.
    const normalizedSections = sections.map((approved, index) => {
        const generated = script.sections[index];

        if (
            !generated ||
            typeof generated.narration !== "string" ||
            !generated.narration.trim()
        ) {
            throw new Error(
                `AI did not generate narration for section ${index + 1}.`
            );
        }

        const narration = limitWords(
            generated.narration,
            wordBudgets.sectionBudgets[index]
        );

        if (!narration) {
            throw new Error(
                `Section ${index + 1} has no narration after word allocation.`
            );
        }

        return {
            sectionNumber: approved.sectionNumber,
            title: approved.title,
            narration,

            visualDirection:
                typeof generated.visualDirection === "string" &&
                generated.visualDirection.trim()
                    ? generated.visualDirection
                    : approved.visualDirection ||
                      "Show a relevant educational visual.",

            onScreenText:
                typeof generated.onScreenText === "string" &&
                generated.onScreenText.trim()
                    ? generated.onScreenText
                    : Array.isArray(approved.keyPoints)
                        ? approved.keyPoints.join(" | ")
                        : approved.title,

            // Transitions are determined by the approved learning plan.
            transitionToNext:
                index < sections.length - 1
                    ? sections[index + 1].title
                    : "Closing"
        };
    });

    const hook = limitWords(
        script.hook,
        wordBudgets.hookWords
    );

   
let closing = limitWords(
    script.closing,
    wordBudgets.closingWords
);

// Reject incomplete AI-generated closing sentences.
const lastWord = closing.trim().split(/\s+/).pop() || "";

const incompleteEnding =
    !/[.!?]$/.test(closing.trim()) ||
    /['’]s?$/.test(lastWord) ||
    /\b(and|or|the|a|an|to|for|of|with|by|because|that|which|who|is|are|was|were)$/i.test(lastWord);

if (!closing || incompleteEnding) {
    closing = "Thanks for watching!";
}


    if (!hook || !closing) {
        throw new Error(
            "AI did not generate a valid hook or closing."
        );
    }

    const completeNarration = [
        hook,
        ...normalizedSections.map(section => section.narration),
        closing
    ].join(" ");

    const actualWordCount = countWords(completeNarration);

    if (actualWordCount > narrationWordBudget.maximum) {
        throw new Error(
            `Internal word budget error. Generated: ${actualWordCount}, Maximum: ${narrationWordBudget.maximum}.`
        );
    }

    const estimatedDurationSeconds = Math.ceil(
        actualWordCount / 1.7
    );

    // Always include a verification warning.
    const factCheckNotes = [
        ...(Array.isArray(script.factCheckNotes)
            ? script.factCheckNotes.filter(
                note => typeof note === "string" && note.trim()
            )
            : []),

        "Verification required: Check company-specific revenue, pricing, operational, and technology claims against reliable current sources. Do not present inferred internal details as confirmed facts."
    ];

    return {
        topic,
        durationSeconds,
        depth,
        language,
        targetAudience,
        title: script.title,
        hook,
        sections: normalizedSections,
        closing,
        factCheckNotes,
        narrationWordCount: actualWordCount,
        narrationWordBudget,
        estimatedDurationSeconds,
        fitsDuration: estimatedDurationSeconds <= durationSeconds
    };
}

module.exports = { generateScript };
