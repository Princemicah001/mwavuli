const API = window.API_BASE
    || (!window.location.port || window.location.port === '5000'
        ? ''
        : (window.location.protocol === 'file:'
            ? 'http://localhost:5000'
            : `${window.location.protocol}//${window.location.hostname}:5000`));

// Cloudinary URLs are stored as-is; legacy local filenames resolve to /uploads.
const mediaUrl = (f) => (f && /^https?:\/\//.test(f)) ? f : (API + "/uploads/" + f);

// Rewrite a Cloudinary delivery URL to request a size-constrained,
// auto-format/auto-quality derivative on the fly (no re-upload needed).
function cldUrl(url, t) {
    if (!url || !/^https?:\/\/res\.cloudinary\.com\//.test(url)) return url;
    return url.replace(/\/upload\/[^/]+/, `/upload/${t}`);
}

const projectCollectionsEl = document.getElementById("projectCollections");
const generalGallery = document.getElementById("generalGallery");

const MOSAIC = ["big", "", "tall", "", "wide", "", "tall", "", "", "wide"];

// Show a modern shimmer placeholder the instant the page renders, so the
// gallery never appears broken/empty while the API responds.
function showSkeleton() {
    if (projectCollectionsEl) {
        projectCollectionsEl.innerHTML = Array.from({ length: 4 }).map(() =>
            `<div class="skel-card skel-shimmer"></div>`
        ).join("");
    }
    if (generalGallery) {
        generalGallery.innerHTML = MOSAIC.map(span =>
            `<div class="gallery-item skel ${span}"><div class="skel-shimmer"></div></div>`
        ).join("");
    }
}

// Fisher–Yates shuffle (returns a new array).
function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

if (projectCollectionsEl || generalGallery) {
    async function loadGallery() {
        const cachedData = localStorage.getItem("MWAVULI_GALLERY_CACHE");
        let hasCachedRender = false;

        if (cachedData) {
            try {
                const { projects, allPhotos } = JSON.parse(cachedData);
                if (projects && allPhotos) {
                    const generalPhotos = allPhotos.filter(p => !p.project);
                    const projectPhotos = allPhotos.filter(p => p.project);
                    const combined = shuffle([...generalPhotos, ...projectPhotos]);
                    if (projectCollectionsEl) renderProjectCollections(projects);
                    if (generalGallery) renderGeneralGallery(combined);
                    hasCachedRender = true;
                }
            } catch (_) {}
        }

        if (!hasCachedRender) {
            showSkeleton();
        }

        try {
            const [projectsRes, photosRes] = await Promise.all([
                fetch(`${API}/api/projects`),
                fetch(`${API}/api/photos`)
            ]);

            const projectsData = await projectsRes.json();
            const photosData = await photosRes.json();

            const projects = projectsData.projects || [];
            const allPhotos = photosData.photos || [];

            localStorage.setItem("MWAVULI_GALLERY_CACHE", JSON.stringify({ projects, allPhotos }));

            const generalPhotos = allPhotos.filter(p => !p.project);
            const projectPhotos = allPhotos.filter(p => p.project);
            const combined = shuffle([...generalPhotos, ...projectPhotos]);

            if (projectCollectionsEl) renderProjectCollections(projects);
            if (generalGallery) renderGeneralGallery(combined);
        } catch (err) {
            console.error("Failed to load gallery", err);
            if (!hasCachedRender) {
                if (projectCollectionsEl) {
                    projectCollectionsEl.innerHTML = "<p class='gallery-empty'>Could not load collections.</p>";
                }
                if (generalGallery) {
                    generalGallery.innerHTML = "<p class='gallery-empty'>Could not load gallery.</p>";
                }
            }
        }
    }

    function renderProjectCollections(projects) {
        if (!projects.length) {
            projectCollectionsEl.innerHTML = "<p class='gallery-empty'>No projects yet.</p>";
            return;
        }

        const cards = projects.map(p => {
            const cover = p.cover
                ? `<img src="${cldUrl(mediaUrl(p.cover), "w_800,c_limit,q_auto,f_auto")}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">`
                : `<div class="project-placeholder"><i class="fa-solid fa-camera"></i></div>`;
            return `
                <a class="gallery-collection-card" href="project.html?id=${p._id}">
                    <div class="collection-cover">
                        ${cover}
                        <div class="project-overlay">
                            <h3>${escapeHtml(p.title)}</h3>
                            <p>${escapeHtml(p.location || "")}</p>
                        </div>
                    </div>
                </a>`;
        });
        projectCollectionsEl.innerHTML = cards.join("");
    }

    function renderGeneralGallery(photos) {
        if (!photos.length) {
            generalGallery.innerHTML = "<p class='gallery-empty'>No photos yet. Upload some from the admin panel.</p>";
            return;
        }

        // Preload visible image thumbnails for instant rendering
        const thumbUrls = photos.slice(0, 12).map(p => cldUrl(mediaUrl(p.thumbnail || p.file), "w_640,c_limit,q_auto,f_auto"));
        thumbUrls.forEach(url => {
            if (url && !/\.(mp4|mov|webm|ogv|m4v)(\?.*)?$/i.test(url)) {
                const img = new Image();
                img.src = url;
            }
        });

        // Build the whole grid as one string and assign it once — appending via
        // innerHTML += per item forces a full re-parse every iteration, which is
        // what made the gallery feel slow with many images.
        const parts = photos.map((photo, i) => {
            const span = MOSAIC[i % MOSAIC.length];
            const thumbBase = mediaUrl(photo.thumbnail || photo.file);
            const thumbUrl = cldUrl(thumbBase, "w_640,c_limit,q_auto,f_auto");
            const fullUrl = cldUrl(mediaUrl(photo.file), "w_1600,c_limit,q_auto,f_auto");
            const srcset =
                `${cldUrl(thumbBase, "w_400,c_limit,q_auto,f_auto")} 400w, ` +
                `${thumbUrl} 640w, ` +
                `${cldUrl(thumbBase, "w_800,c_limit,q_auto,f_auto")} 800w`;

            let media;
            if (photo.mediaType === "video") {
                // Only use a real image as the poster. Without a thumbnail
                // (e.g. on hosts without ffmpeg) the fallback would be the video
                // URL itself, which renders as a broken image.
                const poster = photo.thumbnail
                    ? cldUrl(mediaUrl(photo.thumbnail), "w_640,c_limit,q_auto,f_auto")
                    : "";
                media = `<video autoplay muted loop playsinline webkit-playsinline preload="auto"${poster ? ` poster="${poster}"` : ""} draggable="false" src="${fullUrl}"></video>`;
            } else {
                const loadAttr = i < 6 ? 'eager' : 'lazy';
                const fetchPrio = i < 3 ? 'high' : 'auto';
                media = `<img src="${thumbUrl}" srcset="${srcset}" sizes="(max-width:600px) 100vw, (max-width:1024px) 50vw, 33vw" alt="${escapeHtml(photo.title)}" data-full="${fullUrl}" loading="${loadAttr}" fetchpriority="${fetchPrio}" decoding="async" draggable="false">`;
            }

            return `
                <div class="gallery-item ${span}">
                    ${media}
                </div>`;
        });

        generalGallery.innerHTML = parts.join("");

        // Graceful muted autoplay: play videos only while they're on screen
        const videos = generalGallery.querySelectorAll(".gallery-item video");
        const playVideo = (v) => {
            v.muted = true;
            v.playsInline = true;
            const p = v.play();
            if (p !== undefined) {
                p.catch(() => {
                    const enablePlay = () => {
                        v.play().catch(() => {});
                        document.removeEventListener('touchstart', enablePlay);
                        document.removeEventListener('click', enablePlay);
                        document.removeEventListener('scroll', enablePlay);
                    };
                    document.addEventListener('touchstart', enablePlay, { once: true });
                    document.addEventListener('click', enablePlay, { once: true });
                    document.addEventListener('scroll', enablePlay, { once: true, passive: true });
                });
            }
        };
        if ("IntersectionObserver" in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                    const v = e.target;
                    if (e.isIntersecting) playVideo(v);
                    else v.pause();
                });
            }, { threshold: 0.15 });
            videos.forEach(v => io.observe(v));
        } else {
            videos.forEach(playVideo);
        }

        const mediaElements = generalGallery.querySelectorAll(".gallery-item img, .gallery-item video");
        const allItems = Array.from(mediaElements).map(el => {
            const isVideo = el.tagName.toLowerCase() === 'video';
            const url = isVideo ? (el.src || el.querySelector('source')?.src) : (el.dataset.full || el.src);
            return { type: isVideo ? 'video' : 'image', url };
        });

        const imageOnlyUrls = allItems.filter(item => item.type === 'image').map(item => item.url);
        if (window.preloadLightboxSources) window.preloadLightboxSources(imageOnlyUrls);

        mediaElements.forEach((el, idx) => {
            el.addEventListener("click", () => {
                window.openLightbox(allItems, idx);
            });
        });

        protectImages();
    }

    function protectImages() {
        generalGallery.querySelectorAll(".gallery-item img, .gallery-item video").forEach(el => {
            el.addEventListener("contextmenu", e => e.preventDefault());
            el.setAttribute("draggable", "false");
        });
    }

    loadGallery();
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".gallery-item")) e.preventDefault();
});
