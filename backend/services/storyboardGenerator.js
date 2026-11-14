
function countWords(text = "") {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function allocateSceneDurations(totalSeconds, parts) {
    const base = Math.floor(totalSeconds / parts);
    const remainder = totalSeconds % parts;

    return Array.from({ length: parts }, (_, index) =>
        base + (index < remainder ? 1 : 0)
    );
}

function generateStoryboard({ script }) {
    if (!script || typeof script !== "object") {
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
        !topic ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds < 30 ||
        durationSeconds > 300 ||
        !title ||
        !hook ||
        !Array.isArray(sections) ||
        sections.length === 0 ||
        !closing
    ) {
        throw new Error("The approved script is incomplete or invalid.");
    }

    const narrationParts = [
        {
            type: "hook",
            title: "Opening Hook",
            narration: hook,
            visualDescription: `Create an engaging opening visual that introduces the topic: ${topic}.`,
            animationDirection: "Use a smooth cinematic zoom-in to capture attention.",
            onScreenText: title
        },
        ...sections.map((section) => ({
            type: "section",
            title: section.title,
            narration: section.narration,
            visualDescription: section.visualDirection,
            animationDirection: "Use subtle motion and transitions to support the explanation.",
            onScreenText: section.onScreenText || section.title
        })),
        {
            type: "closing",
            title: "Closing",
            narration: closing,
            visualDescription: `Show a clean final visual that reinforces the main topic: ${topic}.`,
            animationDirection: "Use a gentle zoom-out and fade-out.",
            onScreenText: "Thanks for watching!"
        }
    ];

    const sceneDurations = allocateSceneDurations(
        durationSeconds,
        narrationParts.length
    );

    const scenes = narrationParts.map((part, index) => ({
        sceneNumber: index + 1,
        sceneType: part.type,
        title: part.title,
        durationSeconds: sceneDurations[index],
        narration: part.narration,
        narrationWordCount: countWords(part.narration),
        visualDescription: part.visualDescription,
        animationDirection: part.animationDirection,
        onScreenText: part.onScreenText,
        imageGenerationPrompt: [
            `Educational video about ${topic}.`,
            `Scene: ${part.title}.`,
            `Visual: ${part.visualDescription}.`,
            "Professional educational explainer video style.",
            "High-quality, clean composition, clear focal subject.",
            "Do not include written text, logos, or watermarks in the generated image."
        ].join(" "),
        language
    }));

    const allocatedDuration = scenes.reduce(
        (total, scene) => total + scene.durationSeconds,
        0
    );

    return {
        topic,
        title,
        durationSeconds,
        language,
        totalScenes: scenes.length,
        allocatedDurationSeconds: allocatedDuration,
        scenes
    };
}

module.exports = { generateStoryboard };
