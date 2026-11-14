
function countWords(text = "") {
    if (typeof text !== "string" || !text.trim()) {
        return 0;
    }

    return text.trim().split(/\s+/).filter(Boolean).length;
}

// Allocate time according to narration length.
// Every scene receives at least one second.
function allocateSceneDurations(totalSeconds, narrationParts) {
    const sceneCount = narrationParts.length;

    if (
        !Number.isInteger(totalSeconds) ||
        sceneCount === 0 ||
        totalSeconds < sceneCount
    ) {
        throw new Error(
            "Video duration is too short for the number of scenes."
        );
    }

    const wordCounts = narrationParts.map(part =>
        countWords(part.narration)
    );

    const totalWords = wordCounts.reduce(
        (sum, count) => sum + count,
        0
    );

    // Reserve one second for every scene.
    const remainingSeconds = totalSeconds - sceneCount;

    // Use equal weights only if all narration is empty.
    const weights = wordCounts.map(count =>
        totalWords > 0 ? count / totalWords : 1 / sceneCount
    );

    const exactAllocations = weights.map(
        weight => weight * remainingSeconds
    );

    const additionalSeconds = exactAllocations.map(
        allocation => Math.floor(allocation)
    );

    let allocatedAdditionalSeconds = additionalSeconds.reduce(
        (sum, value) => sum + value,
        0
    );

    // Distribute leftover seconds using the largest remainder method.
    const remainderOrder = exactAllocations
        .map((allocation, index) => ({
            index,
            remainder: allocation - Math.floor(allocation)
        }))
        .sort((a, b) => b.remainder - a.remainder);

    let remaining = remainingSeconds - allocatedAdditionalSeconds;

    for (let i = 0; i < remaining; i++) {
        additionalSeconds[remainderOrder[i].index]++;
    }

    return additionalSeconds.map(seconds => seconds + 1);
}

function generateStoryboard({ script }) {
    if (
        !script ||
        typeof script !== "object" ||
        Array.isArray(script)
    ) {
        throw new Error("A valid approved script is required.");
    }

    const {
        topic,
        durationSeconds,
        title,
        hook,
        sections,
        closing,
        language = "English"
    } = script;

    if (
        typeof topic !== "string" ||
        !topic.trim() ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds < 30 ||
        durationSeconds > 300 ||
        typeof title !== "string" ||
        !title.trim() ||
        typeof hook !== "string" ||
        !hook.trim() ||
        !Array.isArray(sections) ||
        sections.length === 0 ||
        typeof closing !== "string" ||
        !closing.trim()
    ) {
        throw new Error("The approved script is incomplete or invalid.");
    }

    // Validate every approved content section.
    for (const section of sections) {
        if (
            !section ||
            typeof section.title !== "string" ||
            !section.title.trim() ||
            typeof section.narration !== "string" ||
            !section.narration.trim()
        ) {
            throw new Error(
                "One or more approved script sections are incomplete."
            );
        }
    }

    // Convert the approved script into storyboard scene inputs.
    const narrationParts = [
        {
            type: "hook",
            title: "Opening Hook",
            narration: hook,
            visualDescription:
                `Create an engaging opening visual that introduces the topic: ${topic}.`,
            animationDirection:
                "Use a smooth cinematic zoom-in to capture attention.",
            onScreenText: title
        },

        ...sections.map(section => ({
            type: "section",
            title: section.title,
            narration: section.narration,
            visualDescription:
                section.visualDirection ||
                `Create an educational visual explaining ${section.title}.`,
            animationDirection:
                "Use subtle motion and transitions to support the explanation.",
            onScreenText: section.onScreenText || section.title
        })),

        {
            type: "closing",
            title: "Closing",
            narration: closing,
            visualDescription:
                `Show a clean final visual that reinforces the main topic: ${topic}.`,
            animationDirection:
                "Use a gentle zoom-out and fade-out.",
            onScreenText: "Thanks for watching!"
        }
    ];

    // Calculate scene durations based on narration word counts.
    const sceneDurations = allocateSceneDurations(
        durationSeconds,
        narrationParts
    );

    const scenes = narrationParts.map((part, index) => {
        const wordCount = countWords(part.narration);

        // Approximately 102 spoken words per minute.
        const estimatedNarrationSeconds = Number(
            (wordCount / 1.7).toFixed(2)
        );

        return {
            sceneNumber: index + 1,
            sceneType: part.type,
            title: part.title,

            durationSeconds: sceneDurations[index],

            narration: part.narration,
            narrationWordCount: wordCount,
            estimatedNarrationSeconds,

            // Remaining time can accommodate visual pauses.
            availableVisualPauseSeconds: Number(
                Math.max(
                    0,
                    sceneDurations[index] - estimatedNarrationSeconds
                ).toFixed(2)
            ),

            visualDescription: part.visualDescription,
            animationDirection: part.animationDirection,
            onScreenText: part.onScreenText,

            imageGenerationPrompt: [
                `Educational video about ${topic}.`,
                `Scene: ${part.title}.`,
                `Visual: ${part.visualDescription}.`,
                "Professional educational explainer video style.",
                "High-quality, clean composition, clear focal subject.",
                "Maintain a consistent visual style across all scenes.",
                "Do not include written text, logos, or watermarks in the generated image."
            ].join(" "),

            language
        };
    });

    const allocatedDuration = scenes.reduce(
        (total, scene) => total + scene.durationSeconds,
        0
    );

    const totalNarrationWords = scenes.reduce(
        (total, scene) => total + scene.narrationWordCount,
        0
    );

    const totalEstimatedNarrationSeconds = Number(
        scenes.reduce(
            (total, scene) => total + scene.estimatedNarrationSeconds,
            0
        ).toFixed(2)
    );

    // Final duration integrity check.
    if (allocatedDuration !== durationSeconds) {
        throw new Error(
            "Storyboard duration allocation does not match the requested duration."
        );
    }

    return {
        topic,
        title,
        durationSeconds,
        language,

        totalScenes: scenes.length,
        totalNarrationWords,

        allocatedDurationSeconds: allocatedDuration,
        estimatedNarrationSeconds: totalEstimatedNarrationSeconds,

        scenes
    };
}

module.exports = { generateStoryboard };
