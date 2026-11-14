
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const AUDIO_STORAGE_DIR = path.resolve(
    __dirname,
    "../../storage/generated/audio"
);

const MAX_AUDIO_SIZE = 30 * 1024 * 1024; // 30 MB

const SUPPORTED_FORMATS = {
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/aac": "aac"
};

async function initializeAudioStorage() {
    await fs.mkdir(AUDIO_STORAGE_DIR, {
        recursive: true
    });

    return AUDIO_STORAGE_DIR;
}

async function saveAudio(audioBuffer, mimeType) {
    if (
        !Buffer.isBuffer(audioBuffer) ||
        audioBuffer.length === 0
    ) {
        throw new Error("A valid audio buffer is required.");
    }

    if (audioBuffer.length > MAX_AUDIO_SIZE) {
        throw new Error(
            "Audio exceeds the maximum allowed size of 30 MB."
        );
    }

    const extension = SUPPORTED_FORMATS[mimeType];

    if (!extension) {
        throw new Error(
            "Unsupported audio format."
        );
    }

    await initializeAudioStorage();

    const filename =
        `${crypto.randomUUID()}.${extension}`;

    const filePath = path.join(
        AUDIO_STORAGE_DIR,
        filename
    );

    await fs.writeFile(filePath, audioBuffer, {
        flag: "wx"
    });

    return {
        filename,
        format: extension,
        mimeType,
        sizeBytes: audioBuffer.length,
        storagePath: filePath,
        relativePath: `/generated/audio/${filename}`
    };
}

function getAudioPath(filename) {
    if (
        typeof filename !== "string" ||
        !/^[a-f0-9-]+\.(mp3|wav|ogg|m4a|aac)$/i.test(filename)
    ) {
        throw new Error("Invalid audio filename.");
    }

    const filePath = path.resolve(
        AUDIO_STORAGE_DIR,
        filename
    );

    if (path.dirname(filePath) !== AUDIO_STORAGE_DIR) {
        throw new Error("Invalid audio storage path.");
    }

    return filePath;
}

async function deleteAudio(filename) {
    const filePath = getAudioPath(filename);

    try {
        await fs.unlink(filePath);
        return true;
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }

        throw error;
    }
}

module.exports = {
    initializeAudioStorage,
    saveAudio,
    getAudioPath,
    deleteAudio
};
