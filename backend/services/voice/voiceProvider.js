
const providers = new Map();

class VoiceProviderError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "VoiceProviderError";
        this.code = code;
    }
}

function registerVoiceProvider(name, provider) {
    if (!name || typeof name !== "string") {
        throw new Error("A valid voice provider name is required.");
    }

    if (!provider || typeof provider.generateSpeech !== "function") {
        throw new Error(
            "Provider must implement generateSpeech()."
        );
    }

    providers.set(name.toLowerCase(), provider);
}

function getVoiceProviderStatus() {
    const providerName = (
        process.env.VOICE_PROVIDER || ""
    ).trim().toLowerCase();

    if (!providerName) {
        return {
            configured: false,
            provider: null,
            message: "No voice-generation provider configured."
        };
    }

    if (!providers.has(providerName)) {
        return {
            configured: false,
            provider: providerName,
            message: `Voice provider '${providerName}' is not installed yet.`
        };
    }

    return {
        configured: true,
        provider: providerName,
        message: "Voice-generation provider is ready."
    };
}

async function generateSpeech(options) {
    const status = getVoiceProviderStatus();

    if (!status.configured) {
        throw new VoiceProviderError(
            status.message,
            "VOICE_PROVIDER_NOT_CONFIGURED"
        );
    }

    if (
        !options ||
        typeof options.text !== "string" ||
        !options.text.trim()
    ) {
        throw new VoiceProviderError(
            "Valid narration text is required.",
            "INVALID_NARRATION"
        );
    }

    try {
        return await providers
            .get(status.provider)
            .generateSpeech(options);
    } catch (error) {
        if (error instanceof VoiceProviderError) {
            throw error;
        }

        throw new VoiceProviderError(
            error.message || "Speech generation failed.",
            "VOICE_GENERATION_FAILED"
        );
    }
}

module.exports = {
    VoiceProviderError,
    registerVoiceProvider,
    getVoiceProviderStatus,
    generateSpeech
};
