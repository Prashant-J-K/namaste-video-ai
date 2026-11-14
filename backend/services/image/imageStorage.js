
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const IMAGE_STORAGE_DIR = path.resolve(
    __dirname,
    "../../storage/generated/images"
);

const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15 MB

const SUPPORTED_FORMATS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp"
};

/**
 * Ensure the image storage directory exists.
 */
async function initializeImageStorage() {
    await fs.mkdir(IMAGE_STORAGE_DIR, {
        recursive: true
    });

    return IMAGE_STORAGE_DIR;
}

/**
 * Save a generated image buffer securely.
 *
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @returns {Promise<object>}
 */
async function saveImage(imageBuffer, mimeType) {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        throw new Error("A valid image buffer is required.");
    }

    if (imageBuffer.length > MAX_IMAGE_SIZE) {
        throw new Error("Image exceeds the maximum allowed size of 15 MB.");
    }

    const extension = SUPPORTED_FORMATS[mimeType];

    if (!extension) {
        throw new Error(
            "Unsupported image format. Use PNG, JPEG, or WebP."
        );
    }

    await initializeImageStorage();

    const filename = `${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(IMAGE_STORAGE_DIR, filename);

    await fs.writeFile(filePath, imageBuffer, {
        flag: "wx"
    });

    return {
        filename,
        format: extension,
        mimeType,
        sizeBytes: imageBuffer.length,
        storagePath: filePath,
        relativePath: `/generated/images/${filename}`
    };
}

/**
 * Resolve an existing image filename safely.
 */
function getImagePath(filename) {
    if (
        typeof filename !== "string" ||
        !/^[a-f0-9-]+\.(png|jpg|webp)$/i.test(filename)
    ) {
        throw new Error("Invalid image filename.");
    }

    const filePath = path.resolve(IMAGE_STORAGE_DIR, filename);

    if (path.dirname(filePath) !== IMAGE_STORAGE_DIR) {
        throw new Error("Invalid image storage path.");
    }

    return filePath;
}

/**
 * Delete a stored image.
 */
async function deleteImage(filename) {
    const filePath = getImagePath(filename);

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
    initializeImageStorage,
    saveImage,
    getImagePath,
    deleteImage
};

