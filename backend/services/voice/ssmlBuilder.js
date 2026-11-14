
const SUPPORTED_LANGUAGES = [
    "en",
    "hi",
    "kn",
    "en-hi",
    "en-kn",
    "hi-kn",
    "en-hi-kn"
];

const DELIVERY_STYLES = [
    "professional",
    "friendly",
    "documentary",
    "energetic",
    "calm"
];

const LANGUAGE_LOCALES = {
    en: "en-US",
    hi: "hi-IN",
    kn: "kn-IN"
};

function escapeXml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function validateVoiceSettings(settings = {}) {
    const language = settings.language || "en";
    const speakingRate = Number(settings.speakingRate ?? 1);
    const pitch = Number(settings.pitch ?? 0);
    const deliveryStyle =
        settings.deliveryStyle || "professional";

    if (!SUPPORTED_LANGUAGES.includes(language)) {
        throw new Error("Unsupported narration language.");
    }

    if (
        !Number.isFinite(speakingRate) ||
        speakingRate < 0.75 ||
        speakingRate > 1.25
    ) {
        throw new Error(
            "Speaking rate must be between 0.75 and 1.25."
        );
    }

    if (
        !Number.isFinite(pitch) ||
        pitch < -10 ||
        pitch > 10
    ) {
        throw new Error("Pitch must be between -10 and 10.");
    }

    if (!DELIVERY_STYLES.includes(deliveryStyle)) {
        throw new Error("Unsupported voice delivery style.");
    }

    return {
        language,
        speakingRate,
        pitch,
        deliveryStyle
    };
}

function validatePronunciationDictionary(dictionary = []) {
    if (!Array.isArray(dictionary)) {
        throw new Error(
            "Pronunciation dictionary must be an array."
        );
    }

    if (dictionary.length > 100) {
        throw new Error(
            "Pronunciation dictionary cannot contain more than 100 entries."
        );
    }

    for (const entry of dictionary) {
        if (
            !entry ||
            typeof entry.word !== "string" ||
            !entry.word.trim() ||
            typeof entry.alias !== "string" ||
            !entry.alias.trim()
        ) {
            throw new Error(
                "Each pronunciation entry requires word and alias."
            );
        }

        if (entry.word.length > 100 || entry.alias.length > 200) {
            throw new Error(
                "Pronunciation dictionary entries are too long."
            );
        }
    }

    return dictionary;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderTextWithPronunciation(text, dictionary) {
    const entries = [...dictionary].sort(
        (a, b) => b.word.length - a.word.length
    );

    if (entries.length === 0) {
        return escapeXml(text);
    }

    const pattern = new RegExp(
        entries.map(entry => escapeRegExp(entry.word)).join("|"),
        "gi"
    );

    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        result += escapeXml(text.slice(lastIndex, match.index));

        const entry = entries.find(
            item =>
                item.word.toLowerCase() ===
                match[0].toLowerCase()
        );

        if (entry) {
            result += `<sub alias="${escapeXml(entry.alias)}">${escapeXml(match[0])}</sub>`;
        } else {
            result += escapeXml(match[0]);
        }

        lastIndex = pattern.lastIndex;
    }

    result += escapeXml(text.slice(lastIndex));

    return result;
}

function normalizeLanguageSegments(language, languageSegments, text) {
    const isBilingual = language.includes("-");

    if (!isBilingual && !languageSegments) {
        return [{
            language,
            text
        }];
    }

    if (!Array.isArray(languageSegments) || languageSegments.length === 0) {
        throw new Error(
            "Bilingual narration requires languageSegments for each scene."
        );
    }

    const allowedLanguages = language.split("-");

    for (const segment of languageSegments) {
        if (
            !segment ||
            !allowedLanguages.includes(segment.language) ||
            typeof segment.text !== "string" ||
            !segment.text.trim()
        ) {
            throw new Error(
                "Each language segment must contain valid text and a language included in the selected narration language."
            );
        }
    }

    const combinedText = languageSegments
        .map(segment => segment.text)
        .join("");

    if (combinedText !== text) {
        throw new Error(
            "Language segments must preserve the exact scene narration text and order."
        );
    }

    return languageSegments;
}

function buildSSML({
    text,
    language = "en",
    languageSegments,
    speakingRate = 1,
    pitch = 0,
    deliveryStyle = "professional",
    pronunciationDictionary = [],
    pauseAfterMs = 0
}) {
    if (typeof text !== "string" || !text.trim()) {
        throw new Error("Narration text is required.");
    }

    if (text.length > 10000) {
        throw new Error(
            "Narration text exceeds the 10,000 character limit."
        );
    }

    const settings = validateVoiceSettings({
        language,
        speakingRate,
        pitch,
        deliveryStyle
    });

    validatePronunciationDictionary(pronunciationDictionary);

    if (
        !Number.isInteger(pauseAfterMs) ||
        pauseAfterMs < 0 ||
        pauseAfterMs > 5000
    ) {
        throw new Error(
            "Pause must be between 0 and 5000 milliseconds."
        );
    }

    const segments = normalizeLanguageSegments(
        settings.language,
        languageSegments,
        text.trim()
    );

    const spokenSegments = segments.map(segment => {
        const locale = LANGUAGE_LOCALES[segment.language];

        const spokenText = renderTextWithPronunciation(
            segment.text,
            pronunciationDictionary
        );

        return `
            <lang xml:lang="${locale}">
                ${spokenText}
            </lang>
        `.trim();
    }).join("\n");

    const pause = pauseAfterMs
        ? `<break time="${pauseAfterMs}ms"/>`
        : "";

    const rootLanguage = LANGUAGE_LOCALES[segments[0].language];

    return `
<speak version="1.0"
       xmlns="http://www.w3.org/2001/10/synthesis"
       xml:lang="${rootLanguage}">
    <prosody rate="${settings.speakingRate}"
             pitch="${settings.pitch}st">
        ${spokenSegments}${pause}
    </prosody>
</speak>
    `.trim();
}

module.exports = {
    SUPPORTED_LANGUAGES,
    DELIVERY_STYLES,
    LANGUAGE_LOCALES,
    escapeXml,
    validateVoiceSettings,
    validatePronunciationDictionary,
    buildSSML
};
