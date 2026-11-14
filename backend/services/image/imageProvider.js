
const providers = new Map();

class ImageProviderError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "ImageProviderError";
        this.code = code;
    }
}

/**
 * Register an image-generation provider.
 *
 * Every provider must implement:
 * generateImage({
 *   prompt,
 *   aspectRatio,
 *   size,
 *   style
 * })
 */
function registerImageProvider(name, provider) {
    if (!name || typeof name !== "string") {
        throw new Error("A valid provider name is required.");
    }

    if (!provider || typeof provider.generateImage !== "function") {
        throw new Error(
            "Provider must implement a generateImage function."
        );
    }

    providers.set(name.toLowerCase(), provider);
}

/**
 * Return safe provider configuration.
 * Never expose API keys or secrets.
 */
function getImageProviderStatus() {
    const providerName = (
        process.env.IMAGE_PROVIDER || ""
    ).trim().toLowerCase();

    if (!providerName) {
        return {
            configured: false,
            provider: null,
            message: "No image-generation provider configured."
        };
    }

    const provider = providers.get(providerName);

    if (!provider) {
        return {
            configured: false,
            provider: providerName,
            message: `Provider '${providerName}' is not installed yet.`
        };
    }

    return {
        configured: true,
        provider: providerName,
        message: "Image-generation provider is ready."
    };
}

/**
 * Generate one image using the selected provider.
 */
async function generateImage(options) {
    const status = getImageProviderStatus();

    if (!status.configured) {
        throw new ImageProviderError(
            status.message,
            "IMAGE_PROVIDER_NOT_CONFIGURED"
        );
    }

    if (!options || !options.prompt || !options.prompt.trim()) {
        throw new ImageProviderError(
            "A valid image-generation prompt is required.",
            "INVALID_IMAGE_PROMPT"
        );
    }

    const provider = providers.get(status.provider);

    try {
        return await provider.generateImage(options);
    } catch (error) {
        if (error instanceof ImageProviderError) {
            throw error;
        }

        throw new ImageProviderError(
            error.message || "Image generation failed.",
            "IMAGE_GENERATION_FAILED"
        );
    }
}

module.exports = {
    ImageProviderError,
    registerImageProvider,
    getImageProviderStatus,
    generateImage
};
