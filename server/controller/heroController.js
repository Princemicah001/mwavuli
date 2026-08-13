const Hero = require("../models/Hero");
const { sanitizeMedia, UPLOAD_DIR } = require("../utils/sanitize");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudStorage");
const fs = require("fs");
const path = require("path");

async function getOrCreateHero() {
    let hero = await Hero.findOne();
    if (!hero) {
        hero = await Hero.create({ enabled: true, slides: [] });
    }
    return hero;
}

function sortSlides(slides) {
    return [...slides].sort((a, b) => (a.order || 0) - (b.order || 0));
}

function publicView(hero) {
    return {
        enabled: hero.enabled,
        autoplay: hero.autoplay,
        interval: hero.interval,
        slides: sortSlides(hero.slides)
    };
}

// Public: homepage slideshow data
exports.getHero = async (req, res) => {
    try {
        const hero = await getOrCreateHero();
        res.json({ success: true, ...publicView(hero) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: add one or more hero slides
exports.addSlide = async (req, res) => {
    const localFiles = [];
    const cloudFiles = [];
    try {
        if (!req.files || !req.files.length) {
            return res.status(400).json({ success: false, message: "Please select at least one image." });
        }

        const hero = await getOrCreateHero();
        const newSlides = [];

        for (const file of req.files) {
            const result = await sanitizeMedia(file.path, file.originalname);
            const fullLocal = path.join(UPLOAD_DIR, result.file);
            const thumbLocal = result.thumbnail ? path.join(UPLOAD_DIR, result.thumbnail) : null;
            localFiles.push(fullLocal);
            if (thumbLocal) localFiles.push(thumbLocal);

            const fullType = result.mediaType === "video" ? "video" : "image";
            const imageUrl = await uploadToCloudinary(fullLocal, { resourceType: fullType });
            cloudFiles.push({ url: imageUrl, type: fullType });

            let thumbUrl = "";
            if (thumbLocal) {
                thumbUrl = await uploadToCloudinary(thumbLocal, { resourceType: "image" });
                cloudFiles.push({ url: thumbUrl, type: "image" });
            }

            // Keep the incoming order: append after existing slides.
            newSlides.push({
                image: imageUrl,
                thumbnail: thumbUrl,
                order: hero.slides.length + newSlides.length
            });
        }

        hero.slides.push(...newSlides);
        await hero.save();

        await Promise.all(localFiles.map(p => fs.promises.unlink(p).catch(() => {})));

        res.status(201).json({
            success: true,
            message: `${newSlides.length} slide(s) added`,
            ...publicView(hero)
        });
    } catch (error) {
        console.error("Hero addSlide error details:", error);
        await Promise.all(cloudFiles.map(c => deleteFromCloudinary(c.url, { resourceType: c.type }).catch(() => {})));
        await Promise.all(localFiles.map(p => fs.promises.unlink(p).catch(() => {})));
        const status = error.status || 500;
        res.status(status).json({ success: false, message: error.message || "Upload failed" });
    }
};

// Admin: delete a hero slide
exports.deleteSlide = async (req, res) => {
    try {
        const hero = await getOrCreateHero();
        const slide = hero.slides.id(req.params.id);
        if (!slide) {
            return res.status(404).json({ success: false, message: "Slide not found" });
        }

        const fullType = slide.image.includes("/video/") ? "video" : "image";
        await deleteFromCloudinary(slide.image, { resourceType: fullType }).catch(() => {});
        if (slide.thumbnail) {
            await deleteFromCloudinary(slide.thumbnail, { resourceType: "image" }).catch(() => {});
        }

        hero.slides.pull(slide._id);
        hero.slides.forEach((s, i) => { s.order = i; });
        await hero.save();

        res.json({ success: true, message: "Slide deleted", ...publicView(hero) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: reorder slides
exports.reorderSlides = async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, message: "orderedIds is required" });
        }
        const hero = await getOrCreateHero();
        orderedIds.forEach((id, i) => {
            const slide = hero.slides.id(id);
            if (slide) slide.order = i;
        });
        await hero.save();
        res.json({ success: true, message: "Reordered", ...publicView(hero) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: toggle slideshow settings
exports.updateHero = async (req, res) => {
    try {
        const { enabled, autoplay, interval } = req.body;
        const hero = await getOrCreateHero();
        if (typeof enabled === "boolean") hero.enabled = enabled;
        if (typeof autoplay === "boolean") hero.autoplay = autoplay;
        if (interval && !isNaN(interval)) {
            hero.interval = Math.max(1500, parseInt(interval, 10));
        }
        await hero.save();
        res.json({ success: true, message: "Updated", ...publicView(hero) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
