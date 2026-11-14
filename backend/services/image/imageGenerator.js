
const {
    generateImage: generateProviderImage,
    getImageProviderStatus
} = require("./imageProvider");

const {
    saveImage
} = require("./imageStorage");

const PLATFORM_ASPECT_RATIOS = {
    instagram_reels: "9:16",
    youtube_shorts: "9:16",
    youtube: "16:9"
};

const DEFAULT_VISUAL_STYLE =
    "Professional educational documentary, clean composition, realistic lighting, high detail, visually consistent scenes";

const MAX_CONCURRENT_GENERATIONS = 2;

/**
 * Resolve aspect ratio from the selected platform.
 */
function getAspectRatio(platform) {
    return PLATFORM_ASPECT_RATIOS[platform] || "16:9";
}

/**
 * Validate storyboard before generating images.
 */
function validateStoryboard(storyboard) {
    if (!storyboard || typeof storyboard !== "object") {
        throw new Error("A valid storyboard is required.");
    }

    if (
        !Array.isArray(storyboard.scenes) ||
        storyboard.scenes.length === 0
    ) {
        throw new Error("Storyboard must contain at least one scene.");
    }

    storyboard.scenes.forEach((scene, index) => {
        if (
            !scene ||
            typeof scene !== "object" ||
            typeof scene.imageGenerationPrompt !== "string" ||
            !scene.imageGenerationPrompt.trim()
        ) {
            throw new Error(
                `Scene ${index + 1} is missing its image-generation prompt.`
            );
        }
    });
}

/**
 * Build the final prompt for an individual scene.
 */
function buildScenePrompt(scene, visualStyle) {
    return [
        scene.imageGenerationPrompt.trim(),
        scene.visualDescription
            ? `Visual context: ${scene.visualDescription}`
            : "",
        scene.narration
            ? `Educational context: ${scene.narration}`
            : "",
        `Visual style: ${visualStyle}`,
        "Create one clear, relevant visual. Do not include subtitles, captions, logos, watermarks, or random text."
    ]
        .filter(Boolean)
        .join("\n\n");
}

/**
 * Generate and store an image for one scene.
 */
async function generateSceneImage({
    scene,
    platform,
    visualStyle
}) {
    const prompt = buildScenePrompt(scene, visualStyle);

    const providerResult = await generateProviderImage({
        prompt,
        aspectRatio: getAspectRatio(platform),
        size: platform === "youtube" ? "landscape" : "portrait",
        style: visualStyle
    });

    if (
        !providerResult ||
        !Buffer.isBuffer(providerResult.imageBuffer) ||
        typeof providerResult.mimeType !== "string"
    ) {
        throw new Error(
            "Image provider returned an invalid image result."
        );
    }

    const storedImage = await saveImage(
        providerResult.imageBuffer,
        providerResult.mimeType
    );

    return {
        status: "generated",
        filename: storedImage.filename,
        format: storedImage.format,
        mimeType: storedImage.mimeType,
        sizeBytes: storedImage.sizeBytes,
        imagePath: storedImage.relativePath,
        aspectRatio: getAspectRatio(platform),
        providerImageId: providerResult.providerImageId || null
    };
}

/**
 * Run scene generation with a concurrency limit.
 */
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
                    error: error.message || "Image generation failed."
                };
            }
        }
    }

    const workerCount = Math.min(limit, items.length);

    await Promise.all(
        Array.from({ length: workerCount }, () => runWorker())
    );

    return results;
}

/**
 * Automatically generate images for every storyboard scene.
 *
 * This is the default image-generation workflow after
 * script approval and storyboard creation.
 */
async function generateStoryboardImages({
    storyboard,
    platform = "youtube",
    visualStyle = DEFAULT_VISUAL_STYLE
}) {
    validateStoryboard(storyboard);

    if (!PLATFORM_ASPECT_RATIOS[platform]) {
        throw new Error("Unsupported video platform.");
    }

    if (
        typeof visualStyle !== "string" ||
        !visualStyle.trim()
    ) {
        throw new Error("A valid visual style is required.");
    }

    const providerStatus = getImageProviderStatus();

    if (!providerStatus.configured) {
        return {
            status: "not_configured",
            message: providerStatus.message,
            automaticGeneration: true,
            totalScenes: storyboard.scenes.length,
            generatedImages: 0,
            failedImages: 0,
            pendingImages: storyboard.scenes.length,
            scenes: storyboard.scenes.map(scene => ({
                sceneNumber: scene.sceneNumber,
                title: scene.title,
                status: "pending",
                imagePath: null
            }))
        };
    }

    const scenes = await runWithConcurrency(
        storyboard.scenes,
        MAX_CONCURRENT_GENERATIONS,
        async scene => ({
            sceneNumber: scene.sceneNumber,
            title: scene.title,
            ...await generateSceneImage({
                scene,
                platform,
                visualStyle: visualStyle.trim()
            })
        })
    );

    const generatedImages = scenes.filter(
        scene => scene.status === "generated"
    ).length;

    const failedImages = scenes.filter(
        scene => scene.status === "failed"
    ).length;

    return {
        status:
            generatedImages === scenes.length
                ? "completed"
                : generatedImages > 0
                    ? "partially_completed"
                    : "failed",
        automaticGeneration: true,
        platform,
        aspectRatio: getAspectRatio(platform),
        visualStyle,
        totalScenes: scenes.length,
        generatedImages,
        failedImages,
        pendingImages: 0,
        scenes
    };
}

/**
 * Regenerate an individual scene image.
 */
async function regenerateSceneImage({
    storyboard,
    sceneNumber,
    platform = "youtube",
    visualStyle = DEFAULT_VISUAL_STYLE
}) {
    validateStoryboard(storyboard);

    if (!PLATFORM_ASPECT_RATIOS[platform]) {
        throw new Error("Unsupported video platform.");
    }

    const scene = storyboard.scenes.find(
        item => item.sceneNumber === sceneNumber
    );

    if (!scene) {
        throw new Error("Requested storyboard scene was not found.");
    }

    const providerStatus = getImageProviderStatus();

    if (!providerStatus.configured) {
        return {
            status: "not_configured",
            message: providerStatus.message,
            sceneNumber
        };
    }

    return {
        sceneNumber,
        title: scene.title,
        ...await generateSceneImage({
            scene,
            platform,
            visualStyle
        })
    };
}

module.exports = {
    generateStoryboardImages,
    regenerateSceneImage,
    buildScenePrompt,
    getAspectRatio
};
