
const VALID_DEPTHS = ["quick", "deep", "masterclass"];

const VALID_LANGUAGES = [
    "English",
    "Hindi",
    "Kannada",
    "English + Hindi",
    "English + Kannada",
    "Hindi + Kannada",
    "English + Hindi + Kannada"
];

function cleanText(value, fallback) {
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }

    return fallback;
}

function removeDuplicateCandidates(candidates) {
    const seen = new Set();

    return candidates.filter(candidate => {
        const normalized = candidate.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();

        if (!normalized || seen.has(normalized)) {
            return false;
        }

        seen.add(normalized);
        return true;
    });
}

// Use one source at a time to avoid mixing chapters,
// learning objectives and key concepts into duplicate sections.
function createCandidates(analysis) {
    let candidates = [];

    if (Array.isArray(analysis.chapters) && analysis.chapters.length > 0) {
        candidates = analysis.chapters
            .filter(chapter => chapter && typeof chapter === "object")
            .map(chapter => {
                const keyPoints = [
                    ...(Array.isArray(chapter.conceptsCovered)
                        ? chapter.conceptsCovered
                        : []),
                    ...(chapter.learningObjective
                        ? [chapter.learningObjective]
                        : [])
                ]
                    .filter(item => typeof item === "string" && item.trim())
                    .slice(0, 3);

                return {
                    title: cleanText(chapter.title, "Important concept"),
                    purpose: cleanText(
                        chapter.description || chapter.learningObjective,
                        "Explain this important concept."
                    ),
                    keyPoints: keyPoints.length
                        ? keyPoints
                        : [
                            cleanText(
                                chapter.description,
                                "Explain the key idea."
                            )
                        ],
                    visualDirection:
                        "Use a simple educational diagram or animation."
                };
            });
    } else if (
        Array.isArray(analysis.learningObjectives) &&
        analysis.learningObjectives.length > 0
    ) {
        candidates = analysis.learningObjectives.map(objective => {
            if (typeof objective === "string") {
                return {
                    title: objective,
                    purpose: objective,
                    keyPoints: [objective],
                    visualDirection: "Show a relevant educational visual."
                };
            }

            return {
                title: cleanText(objective?.name, "Learning objective"),
                purpose: cleanText(
                    objective?.explanation,
                    objective?.name || "Explain this learning objective."
                ),
                keyPoints: [
                    cleanText(
                        objective?.explanation,
                        objective?.name || "Important learning point."
                    )
                ],
                visualDirection: "Show a relevant educational visual."
            };
        });
    } else if (
        Array.isArray(analysis.keyConcepts) &&
        analysis.keyConcepts.length > 0
    ) {
        candidates = analysis.keyConcepts.map(concept => {
            if (typeof concept === "string") {
                return {
                    title: concept,
                    purpose: `Explain ${concept}.`,
                    keyPoints: [concept],
                    visualDirection: "Show a simple concept illustration."
                };
            }

            return {
                title: cleanText(concept?.name, "Key concept"),
                purpose: cleanText(
                    concept?.explanation,
                    concept?.name || "Explain this concept."
                ),
                keyPoints: [
                    cleanText(
                        concept?.explanation,
                        concept?.name || "Important concept."
                    )
                ],
                visualDirection: "Show a simple concept illustration."
            };
        });
    }

    return removeDuplicateCandidates(candidates);
}

function allocateSectionDurations(sectionCount, totalDuration) {
    const baseDuration = Math.floor(totalDuration / sectionCount);
    const remainingSeconds = totalDuration % sectionCount;

    return Array.from(
        { length: sectionCount },
        (_, index) =>
            baseDuration + (index < remainingSeconds ? 1 : 0)
    );
}

async function planDuration({
    topic,
    analysis,
    durationSeconds,
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

    if (
        !Number.isInteger(durationSeconds) ||
        durationSeconds < 30 ||
        durationSeconds > 300
    ) {
        throw new Error("Duration must be between 30 and 300 seconds.");
    }

    if (!VALID_DEPTHS.includes(depth)) {
        throw new Error("Invalid depth selection.");
    }

    if (!VALID_LANGUAGES.includes(language)) {
        throw new Error("Unsupported language selection.");
    }

    if (!audience || typeof audience !== "string") {
        throw new Error("A valid target audience is required.");
    }

    const requestedSectionCount = Math.min(
        7,
        Math.max(2, Math.ceil(durationSeconds / 45))
    );

    const candidates = createCandidates(analysis);

    if (candidates.length === 0) {
        throw new Error(
            "Topic analysis does not contain enough information to create a learning plan."
        );
    }

    // Never invent extra topics to fill the requested section count.
    const selectedSections = candidates.slice(
        0,
        Math.min(requestedSectionCount, candidates.length)
    );

    const sectionDurations = allocateSectionDurations(
        selectedSections.length,
        durationSeconds
    );

    const sections = selectedSections.map((section, index) => ({
        sectionNumber: index + 1,
        title: section.title,
        purpose: section.purpose,
        durationSeconds: sectionDurations[index],
        keyPoints: section.keyPoints,
        visualDirection: section.visualDirection
    }));

    const maximumWords = Math.floor(durationSeconds * 1.7);
    const minimumWords = Math.floor(maximumWords * 0.7);

    const mustCover = [
        ...new Set(sections.flatMap(section => section.keyPoints))
    ];

    const excludeForTime = candidates
        .slice(selectedSections.length)
        .map(section => section.title);

    return {
        topic: topic.trim(),
        durationSeconds,
        depth,
        language,
        targetAudience: audience,

        learningObjective: cleanText(
            analysis.overview,
            `Understand the essential concepts of ${topic.trim()}.`
        ),

        narrationWordBudget: {
            minimum: minimumWords,
            maximum: maximumWords
        },

        sections,
        mustCover,
        excludeForTime,
        seriesSuggestion: null
    };
}

module.exports = { planDuration };
