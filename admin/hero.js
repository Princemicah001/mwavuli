(function () {
    const { API, apiFetch } = window.adminAuth;

// Cloudinary URLs are stored as-is; legacy local filenames resolve to /uploads.
const mediaUrl = (f) => (f && /^https?:\/\//.test(f)) ? f : (API + "/uploads/" + f);

const slidesGrid = document.getElementById("heroSlidesGrid");
const emptyMsg = document.getElementById("heroEmpty");
const heroMsg = document.getElementById("heroMsg");
const settingsMsg = document.getElementById("settingsMsg");

const heroEnabled = document.getElementById("heroEnabled");
const heroAutoplay = document.getElementById("heroAutoplay");
const heroInterval = document.getElementById("heroInterval");

const form = document.getElementById("heroUploadForm");
const fileInput = document.getElementById("heroFile");
const heroFileList = document.getElementById("heroFileList");
const submitBtn = document.getElementById("heroSubmitBtn");
const progressWrap = document.getElementById("heroProgressWrap");
const progressFill = document.getElementById("heroProgressFill");
const progressPct = document.getElementById("heroProgressPct");
const progressStatus = document.getElementById("heroProgressStatus");

function setMsg(el, text, type) {
    el.textContent = text;
    el.className = "form-msg" + (type ? " " + type : "");
}

function renderSlides(slides) {
    slidesGrid.innerHTML = "";
    if (!slides.length) {
        emptyMsg.hidden = false;
        return;
    }
    emptyMsg.hidden = true;

    slides.forEach((slide, i) => {
        const item = document.createElement("div");
        item.className = "hero-slide-item";
        item.innerHTML = `
            <img src="${mediaUrl(slide.thumbnail || slide.image)}" alt="Hero slide" loading="lazy">
            <div class="hero-slide-actions">
                <button type="button" class="up-btn" data-id="${slide._id}" ${i === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="down-btn" data-id="${slide._id}" ${i === slides.length - 1 ? "disabled" : ""}>↓</button>
                <button type="button" class="del-btn" data-id="${slide._id}">Delete</button>
            </div>
        `;
        slidesGrid.appendChild(item);
    });

    slidesGrid.querySelectorAll(".up-btn").forEach(btn => {
        btn.addEventListener("click", () => move(btn.dataset.id, -1));
    });
    slidesGrid.querySelectorAll(".down-btn").forEach(btn => {
        btn.addEventListener("click", () => move(btn.dataset.id, 1));
    });
    slidesGrid.querySelectorAll(".del-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            window.confirmDelete("Delete this slide?", "This removes the image from the hero slideshow.", async () => {
                try {
                    await apiFetch(`${API}/api/hero/slide/${btn.dataset.id}`, { method: "DELETE" });
                    window.showToast("Slide deleted", "success");
                    loadHero();
                } catch (err) {
                    window.showToast(err.message || "Delete failed", "error");
                }
            });
        });
    });
}

async function move(id, dir) {
    try {
        const data = await loadHeroData();
        const ids = data.slides.map(s => s._id);
        const idx = ids.indexOf(id);
        if (idx === -1) return;
        const swap = idx + dir;
        if (swap < 0 || swap >= ids.length) return;
        [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
        await apiFetch(`${API}/api/hero/order`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds: ids })
        });
        loadHero();
    } catch (err) {
        window.showToast(err.message || "Reorder failed", "error");
    }
}

async function loadHeroData() {
    const res = await apiFetch(`${API}/api/hero`);
    return res.json();
}

async function loadHero() {
    try {
        const data = await loadHeroData();
        if (!data || !data.success) {
            throw new Error(data?.message || "Failed to load hero data");
        }
        heroEnabled.checked = data.enabled;
        heroAutoplay.checked = data.autoplay;
        heroInterval.value = data.interval;
        renderSlides(Array.isArray(data.slides) ? data.slides : []);
    } catch (err) {
        console.error("Failed to load hero", err);
        setMsg(heroMsg, err.message || "Could not load slides. Check console for details.", "error");
        renderSlides([]);
    }
}

// Selected-files preview
function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function renderHeroFileList() {
    heroFileList.innerHTML = "";
    [...fileInput.files].forEach((file, i) => {
        const item = document.createElement("div");
        item.className = "file-item";

        const preview = document.createElement("img");
        preview.className = "fi-preview";
        preview.alt = file.name;
        preview.src = URL.createObjectURL(file);
        preview.onload = () => URL.revokeObjectURL(preview.src);

        const name = document.createElement("span");
        name.className = "fi-name";
        name.textContent = file.name;

        const size = document.createElement("span");
        size.className = "fi-size";
        size.textContent = formatSize(file.size);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "fi-remove";
        remove.dataset.i = i;
        remove.setAttribute("aria-label", "Remove");
        remove.textContent = "×";

        item.append(preview, name, size, remove);
        heroFileList.appendChild(item);
    });
    heroFileList.querySelectorAll(".fi-remove").forEach(btn => {
        btn.addEventListener("click", () => removeHeroFile(Number(btn.dataset.i)));
    });
}

function removeHeroFile(index) {
    const dt = new DataTransfer();
    [...fileInput.files].forEach((f, i) => { if (i !== index) dt.items.add(f); });
    fileInput.files = dt.files;
    renderHeroFileList();
}

fileInput.addEventListener("change", renderHeroFileList);

// Upload one or more new slides
form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!fileInput.files.length) {
        setMsg(heroMsg, "Please choose at least one image.", "error");
        return;
    }

    const formData = new FormData();
    [...fileInput.files].forEach(f => formData.append("image", f));

    const token = window.adminAuth.getToken();
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/api/hero/slide`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) setUploadProgress((ev.loaded / ev.total) * 100);
    });

    // Network transfer finished; server is still saving the image(s).
    xhr.upload.addEventListener("load", () => startProcessing());

    xhr.addEventListener("load", () => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Upload Images";
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_) {}

        if (xhr.status === 401) {
            window.adminAuth.logout();
            return;
        }

        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
            finishProgress();
            window.showToast(data.message || "Slides added", "success");
            form.reset();
            heroFileList.innerHTML = "";
            loadHero();
            setTimeout(hideProgress, 900);
        } else {
            hideProgress();
            setMsg(heroMsg, data.message || "Upload failed.", "error");
        }
    });

    xhr.addEventListener("error", () => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Upload Images";
        hideProgress();
        setMsg(heroMsg, "Network error. Is the server running?", "error");
    });

    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading...";
    showProgress();
    xhr.send(formData);
});

document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
    try {
        await apiFetch(`${API}/api/hero`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                enabled: heroEnabled.checked,
                autoplay: heroAutoplay.checked,
                interval: parseInt(heroInterval.value, 10) || 5000
            })
        });
        setMsg(settingsMsg, "Settings saved", "success");
        window.showToast("Hero settings saved", "success");
    } catch (err) {
        setMsg(settingsMsg, err.message || "Save failed", "error");
    }
});

function showProgress() {
    progressWrap.hidden = false;
    progressWrap.classList.remove("hiding", "processing", "complete");
    progressFill.style.width = "0%";
    progressPct.textContent = "0%";
    progressStatus.textContent = "Uploading…";
}

function setUploadProgress(pct) {
    // Reserve the last 10% for server-side saving so the bar stays honest.
    pct = Math.max(0, Math.min(90, pct * 0.9));
    progressWrap.classList.remove("processing", "complete");
    progressFill.style.width = pct + "%";
    progressPct.textContent = Math.round(pct) + "%";
    progressStatus.textContent = "Uploading…";
}

function startProcessing() {
    progressWrap.classList.add("processing");
    progressWrap.classList.remove("complete");
    progressFill.style.width = "100%";
    progressPct.textContent = "100%";
    progressStatus.textContent = "Saving…";
}

function finishProgress() {
    progressWrap.classList.remove("processing");
    progressWrap.classList.add("complete");
    progressFill.style.width = "100%";
    progressPct.textContent = "✓";
    progressStatus.textContent = "Done";
}

function hideProgress() {
    progressWrap.classList.add("hiding");
    setTimeout(() => {
        progressWrap.hidden = true;
        progressWrap.classList.remove("hiding", "processing", "complete");
        progressFill.style.width = "0%";
        progressPct.textContent = "0%";
        progressStatus.textContent = "";
    }, 450);
}

loadHero();
})();
