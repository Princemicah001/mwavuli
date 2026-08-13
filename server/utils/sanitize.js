const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const util = require("util");

const sharp = require("sharp");

const execFileP = util.promisify(execFile);

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Long-edge dimensions (px). Full-size stays crisp on screen; thumbnail keeps
// the gallery fast. Values mirror the static-site optimisation already done.
const IMAGE_MAX_EDGE = 2000;
const THUMB_MAX_EDGE = 800;

// ffmpeg/ffprobe presence is cached (may be unavailable on some hosts).
let ffmpegChecked = null;
async function ffmpegAvailable() {
    if (ffmpegChecked !== null) return ffmpegChecked;
    try {
        await execFileP("ffmpeg", ["-version"]);
        ffmpegChecked = true;
    } catch (e) {
        ffmpegChecked = false;
    }
    return ffmpegChecked;
}

// Ensure the sanitised output name never collides with the original
// (e.g. uploading a .mp4 or .webp directly), which would cause the
// successfully sanitised file to be deleted by the cleanup step.
function outName(base, ext, originalPath) {
    let name = base + ext;
    if (path.join(UPLOAD_DIR, name) === originalPath) {
        name = base + "-opt" + ext;
    }
    return name;
}

// Detect a real video container by its magic bytes (client mimetype is untrusted).
function detectVideoContainer(buf) {
    if (buf.length > 12 &&
        buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
        return "mp4"; // ISO base media (mp4 / mov / m4v)
    }
    if (buf.length > 12 &&
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x41 && buf[9] === 0x56 && buf[10] === 0x49) {
        return "avi"; // RIFF....AVI
    }
    if (buf.length > 4 &&
        buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0x78) {
        return "webm"; // EBML (webm / mkv)
    }
    return null;
}

async function probeVideo(file) {
    const out = await execFileP("ffprobe", [
        "-v", "error",
        "-show_entries", "stream=codec_type,codec_name",
        "-of", "json",
        file
    ]);
    const data = JSON.parse(out.stdout);
    const streams = data.streams || [];
    const video = streams.find(s => s.codec_type === "video");
    const audio = streams.find(s => s.codec_type === "audio");
    return {
        videoCodec: video ? video.codec_name : null,
        hasAudio: Boolean(audio),
        audioCodec: audio ? audio.codec_name : null
    };
}

async function sanitizeImage(buf, originalPath, base) {
    const fullName = outName(base, ".webp", originalPath);
    const thumbName = base + "-thumb.webp";
    const fullPath = path.join(UPLOAD_DIR, fullName);
    const thumbPath = path.join(UPLOAD_DIR, thumbName);

    // Re-encode from raw pixels: this strips EXIF/GPS metadata and any
    // embedded payloads, and resizes to a sane display resolution.
    const meta = await sharp(buf, { failOn: "none" })
        .rotate()
        .resize({ fit: "inside", width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE, withoutEnlargement: true })
        .withMetadata(false)
        .webp({ quality: 82, effort: 4 })
        .toFile(fullPath);

    await sharp(buf)
        .rotate()
        .resize({ fit: "inside", width: THUMB_MAX_EDGE, height: THUMB_MAX_EDGE, withoutEnlargement: true })
        .withMetadata(false)
        .webp({ quality: 75, effort: 4 })
        .toFile(thumbPath);

    await fsp.unlink(originalPath).catch(() => {});

    return {
        file: fullName,
        thumbnail: thumbName,
        mediaType: "photo",
        width: meta.width,
        height: meta.height
    };
}

async function sanitizeVideo(originalPath, base) {
    const available = await ffmpegAvailable();

    // The final file MUST live inside UPLOAD_DIR so the controller's
    // path.join(UPLOAD_DIR, result.file) always resolves — multer may drop the
    // raw upload elsewhere (e.g. a cwd-relative uploads/ folder on Render).
    const fullName = outName(base, ".mp4", originalPath);
    const fullPath = path.join(UPLOAD_DIR, fullName);
    const sameFile = path.resolve(originalPath) === path.resolve(fullPath);

    if (!sameFile) {
        await fsp.copyFile(originalPath, fullPath).catch(() => {});
        // Only discard the raw upload once we actually have a copy.
        if (fs.existsSync(fullPath)) {
            await fsp.unlink(originalPath).catch(() => {});
        }
    }

    let thumbName = null;

    if (available) {
        const thumbTmp = path.join(UPLOAD_DIR, base + "-thumb.jpg");
        // Poster frame only (cheap, single frame) for the gallery grid.
        await execFileP("ffmpeg", [
            "-y", "-i", fullPath,
            "-vf", "scale='min(800,iw)':-2",
            "-frames:v", "1",
            thumbTmp
        ]).catch(() => {});
        if (fs.existsSync(thumbTmp)) thumbName = base + "-thumb.jpg";

        // Cheap normalisation for already web-ready clips (faststart + copy).
        // Heavy transcodes are skipped on the server to avoid OOM/timeouts on
        // memory-limited hosts (e.g. Render free tier) — Cloudinary streams
        // and transforms the original instead.
        const { videoCodec, hasAudio, audioCodec } = await probeVideo(fullPath)
            .catch(() => ({ videoCodec: null, hasAudio: false, audioCodec: null }));

        const alreadySafe = videoCodec === "h264" && (!hasAudio || audioCodec === "aac");
        if (alreadySafe) {
            const tmpPath = fullPath + ".tmp.mp4";
            try {
                await execFileP("ffmpeg", [
                    "-y", "-i", fullPath,
                    "-c", "copy", "-movflags", "+faststart",
                    tmpPath
                ]);
                await fsp.rename(tmpPath, fullPath);
            } catch {
                await fsp.unlink(tmpPath).catch(() => {});
            }
        }
    }

    return {
        file: path.basename(fullPath),
        thumbnail: thumbName,
        mediaType: "video"
    };
}

// Sanitise a single uploaded file. Throws (status 415) for unsafe/unsupported
// input. On success the original raw file is deleted and replaced.
async function sanitizeMedia(originalPath, originalname) {
    const buf = await fsp.readFile(originalPath);
    const base = path.parse(originalPath).name;

    // 1) Try decoding as an image (sharp rejects anything non-image).
    try {
        const meta = await sharp(buf, { failOn: "none" }).metadata();
        if (meta.width && meta.height) {
            return await sanitizeImage(buf, originalPath, base);
        }
    } catch (e) {
        // Not a decodable image -> fall through to video checks.
    }

    // 2) Validate a real video container by magic bytes.
    const container = detectVideoContainer(buf);
    if (container) {
        return await sanitizeVideo(originalPath, base);
    }

    // 3) Anything else is unsafe -> discard.
    await fsp.unlink(originalPath).catch(() => {});
    const err = new Error("Unsupported or unsafe file type");
    err.status = 415;
    throw err;
}

module.exports = {
    UPLOAD_DIR,
    sanitizeMedia
};
