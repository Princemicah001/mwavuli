(function () {
    const { API, apiFetch } = window.adminAuth;

const mediaUrl = (f) => (f && /^https?:\/\//.test(f)) ? f : (API + "/uploads/" + f);

const form = document.getElementById("aboutUploadForm");
const fileInput = document.getElementById("aboutImage");
const aboutAlt = document.getElementById("aboutAlt");
const aboutSubmitBtn = document.getElementById("aboutSubmitBtn");
const aboutMsg = document.getElementById("aboutMsg");
const preview = document.getElementById("aboutCurrentPreview");

function setMsg(el, text, type) {
    el.textContent = text;
    el.className = "form-msg" + (type ? " " + type : "");
}

function renderPreview(image, alt) {
    preview.innerHTML = "";
    if (!image) return;
    const img = document.createElement("img");
    img.src = mediaUrl(image);
    img.alt = alt || "About image preview";
    preview.appendChild(img);
}

async function loadAbout() {
    try {
        const res = await apiFetch(`${API}/api/about`);
        const data = await res.json();
        if (data && data.success) {
            aboutAlt.value = data.alt || "";
            renderPreview(data.image, data.alt);
        }
    } catch (err) {
        console.error("Failed to load about", err);
    }
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!fileInput.files.length && !aboutAlt.value) {
        setMsg(aboutMsg, "Choose an image or update alt text.", "error");
        return;
    }

    const formData = new FormData();
    if (fileInput.files.length) {
        formData.append("image", fileInput.files[0]);
    }
    if (aboutAlt.value) {
        formData.append("alt", aboutAlt.value);
    }

    const token = window.adminAuth.getToken();
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${API}/api/about`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.addEventListener("load", () => {
        aboutSubmitBtn.disabled = false;
        aboutSubmitBtn.textContent = "Update About Image";
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_) {}

        if (xhr.status === 401) {
            window.adminAuth.logout();
            return;
        }

        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
            window.showToast("About image updated", "success");
            form.reset();
            loadAbout();
        } else {
            setMsg(aboutMsg, data.message || "Update failed.", "error");
        }
    });

    xhr.addEventListener("error", () => {
        aboutSubmitBtn.disabled = false;
        aboutSubmitBtn.textContent = "Update About Image";
        setMsg(aboutMsg, "Network error. Is the server running?", "error");
    });

    aboutSubmitBtn.disabled = true;
    aboutSubmitBtn.textContent = "Updating...";
    xhr.send(formData);
});

loadAbout();
})();
