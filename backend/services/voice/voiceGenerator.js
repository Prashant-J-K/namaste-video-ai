
const {
    generateSpeech: generateProviderSpeech,
    getVoiceProviderStatus
} = require("./voiceProvider");

const {
    buildSSML,
    validateVoiceSettings,
    validatePronunciationDictionary
} = require("./ssmlBuilder");

const { saveAudio } = require("./voiceStorage");

const DEFAULT_VOICE_SETTINGS = {
    language: "en",
    voiceId: "default",
    speakingRate: 1,
    pitch: 0,
    deliveryStyle: "professional"
};

const MAX_CONCURRENT_GENERATIONS = 2;

function validateStoryboard(storyboard) {
    if (
        !storyboard ||
        !Array.isArray(storyboard.scenes) ||
        storyboard.scenes.length === 0
    ) {
        throw new Error("A valid storyboard is required.");
    }

    storyboard.scenes.forEach((scene, index) => {
        if (
            !scene ||
            typeof scene.narration !== "string" ||
            !scene.narration.trim()
        ) {
            throw new Error(
                `Scene ${index + 1} is missing narration.`
            );
        }

        if (scene.narration.length > 10000) {
            throw new Error(
                `Scene ${index + 1} narration exceeds the 10,000 character limit.`
            );
        }
    });
}

function normalizeVoiceSettings(settings = {}) {
    const merged = {
        ...DEFAULT_VOICE_SETTINGS,
        ...settings
    };

    if (
        typeof merged.voiceId !== "string" ||
        !merged.voiceId.trim() ||
        merged.voiceId.length > 200
    ) {
        throw new Error("A valid voice ID is required.");
    }

    const validated = validateVoiceSettings(merged);

    return {
        ...validated,
        voiceId: merged.voiceId.trim()
    };
}

function validateStoryboardLanguageSegments(storyboard, language) {
    if (!language.includes("-")) {
        return;
    }

    storyboard.scenes.forEach((scene, index) => {
        if (!Array.isArray(scene.narrationSegments)) {
            throw new Error(
                `Scene ${index + 1} requires narrationSegments for bilingual narration.`
            );
        }
    });
}

async function generateSceneVoice({
    scene,
    settings,
    pronunciationDictionary = []
}) {
    const ssml = buildSSML({
        text: scene.narration,
        language: settings.language,
        languageSegments: scene.narrationSegments,
        speakingRate: settings.speakingRate,
        pitch: settings.pitch,
        deliveryStyle: settings.deliveryStyle,
        pronunciationDictionary
    });

    const providerResult = await generateProviderSpeech({
        text: scene.narration,
        languageSegments: scene.narrationSegments || null,
        ssml,
        language: settings.language,
        voiceId: settings.voiceId,
        speakingRate: settings.speakingRate,
        pitch: settings.pitch,
        deliveryStyle: settings.deliveryStyle,
        outputFormat: "mp3"
    });

    if (
        !providerResult ||
        !Buffer.isBuffer(providerResult.audioBuffer) ||
        typeof providerResult.mimeType !== "string"
    ) {
        throw new Error(
            "Voice provider returned an invalid audio result."
        );
    }

    const storedAudio = await saveAudio(
        providerResult.audioBuffer,
        providerResult.mimeType
    );

    return {
        status: "generated",
        filename: storedAudio.filename,
        format: storedAudio.format,
        mimeType: storedAudio.mimeType,
        sizeBytes: storedAudio.sizeBytes,
        audioPath: storedAudio.relativePath,
        durationSeconds:
            Number.isFinite(providerResult.durationSeconds)
                ? providerResult.durationSeconds
                : null,
        providerAudioId: providerResult.providerAudioId || null,
        voiceId: settings.voiceId,
        language: settings.language
    };
}

async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function runWorker() {
        while (true) {
            const index = nextIndex++;

            if (index >= items.length) {
                return;
            }

            try {
                results[index] = await worker(items[index], index);
            } catch (error) {
                results[index] = {
                    status: "failed",
                    error: error.message || "Voice generation failed."
                };
            }
        }
    }

    const workerCount = Math.min(limit, items.length);

    await Promise.all(
        Array.from(
            { length: workerCount },
            () => runWorker()
        )
    );

    return results;
}

/**
 * Automatically generate narration audio for every storyboard scene.
 */
async function generateStoryboardVoice({
    storyboard,
    voiceSettings = {},
    pronunciationDictionary = []
}) {
    validateStoryboard(storyboard);

    const settings = normalizeVoiceSettings(voiceSettings);

    // Validate the dictionary even when no provider is configured.
    validatePronunciationDictionary(pronunciationDictionary);

    // Bilingual narration must have explicit language segments.
    validateStoryboardLanguageSegments(
        storyboard,
        settings.language
    );

    const providerStatus = getVoiceProviderStatus();

    if (!providerStatus.configured) {
        return {
            status: "not_configured",
            message: providerStatus.message,
            automaticGeneration: true,
            totalScenes: storyboard.scenes.length,
            generatedAudio: 0,
            failedAudio: 0,
            pendingAudio: storyboard.scenes.length,
            voiceSettings: settings,
            scenes: storyboard.scenes.map(scene => ({
                sceneNumber: scene.sceneNumber,
                title: scene.title,
                status: "pending",
                audioPath: null,
                durationSeconds: null
            }))
        };
    }

    const scenes = await runWithConcurrency(
        storyboard.scenes,
        MAX_CONCURRENT_GENERATIONS,
        async scene => ({
            sceneNumber: scene.sceneNumber,
            title: scene.title,
            ...await generateSceneVoice({
                scene,
                settings,
                pronunciationDictionary
            })
        })
    );

    const generatedAudio = scenes.filter(
        scene => scene.status === "generated"
    ).length;

    const failedAudio = scenes.filter(
        scene => scene.status === "failed"
    ).length;

    return {
        status:
            generatedAudio === scenes.length
                ? "completed"
                : generatedAudio > 0
                    ? "partially_completed"
                    : "failed",
        automaticGeneration: true,
        totalScenes: scenes.length,
        generatedAudio,
        failedAudio,
        pendingAudio: 0,
        voiceSettings: settings,
        scenes
    };
}

module.exports = {
    generateStoryboardVoice,
    generateSceneVoice,
    normalizeVoiceSettings
};
