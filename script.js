(function () {
    const API = (function () {
        if (window.API_BASE) return window.API_BASE;
        const { protocol, hostname, port, origin } = window.location;
        if (protocol === 'file:') return 'http://localhost:5000';
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]') {
            return (port === '5000' || port === '') ? '' : 'http://localhost:5000';
        }
        return origin; // deployed: same-origin serverless API
    })();
    // Cloudinary URLs are stored as-is; legacy local filenames resolve to /uploads.
    const mediaUrl = (f) => (f && /^https?:\/\//.test(f)) ? f : (API + "/uploads/" + f);

    // Rewrite a Cloudinary delivery URL to request a size-constrained,
    // auto-format/auto-quality derivative on the fly (no re-upload needed).
    function cldUrl(url, t) {
        if (!url || !/^https?:\/\/res\.cloudinary\.com\//.test(url)) return url;
        let target = t;
        if (typeof window !== "undefined" && window.innerWidth < 600) {
            target = target.replace(/w_\d+/, "w_550").replace(/q_auto/, "q_auto:eco");
        }
        return url.replace(/\/upload\/[^/]+/, `/upload/${target}`);
    }
    console.debug('[booking] API base =', JSON.stringify(API));

    // Self-contained toast (public site has no admin bundle).
    window.showToast = function (message, type = 'success') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
        toast.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-body">${message}</div>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hiding');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    };

    // Contact form -> creates a booking/message
    const contactForm = document.getElementById("contactForm");
    const bookingMessage = document.getElementById("bookingMessage");
    if (contactForm) {
        contactForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const payload = {
                name: document.getElementById("name").value,
                email: document.getElementById("email").value,
                phone: document.getElementById("phone").value,
                service: document.getElementById("service").value,
                date: document.getElementById("date").value,
                message: document.getElementById("message").value
            };

            try {
                const res = await fetch(`${API}/api/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    window.showToast("Thank you! Your booking request was sent. We'll be in touch soon.", "success");
                    contactForm.reset();
                } else {
                    bookingMessage.style.color = "red";
                    bookingMessage.textContent = data.message || "Something went wrong.";
                }
            } catch (err) {
                console.error('Booking request failed:', err);
                bookingMessage.style.color = "red";
                bookingMessage.textContent = "Network error. Please try again." +
                    (err && err.message ? ` (${err.message})` : "");
            }
        });
    }

    // Testimonials
    async function loadTestimonials() {
        const container = document.getElementById("testimonialContainer");
        if (!container) return;
        try {
            const res = await fetch(`${API}/api/testimonials`);
            const data = await res.json();
            const items = data.testimonials || [];
            if (!items.length) return;

            container.innerHTML = items.map(t => `
                <div class="testimonial-card">
                    <div class="stars">${"★".repeat(t.rating || 5)}</div>
                    <p>"${t.text}"</p>
                    <h4>${t.name}</h4>
                </div>`).join("");
        } catch (err) {
            console.error("Failed to load testimonials", err);
        }
    }

    loadTestimonials();

    // Mobile sidebar nav
    const navToggle = document.getElementById("navToggle");
    const sidebar = document.querySelector(".mobile-sidebar");
    const sidebarClose = document.querySelector(".sidebar-close");
    const sidebarLinks = sidebar ? sidebar.querySelectorAll("a") : [];

    function openSidebar() {
        if (!sidebar) return;
        sidebar.classList.add("open");
        document.body.style.overflow = "hidden";
    }

    function closeSidebar() {
        if (!sidebar) return;
        sidebar.classList.remove("open");
        document.body.style.overflow = "";
    }

    if (navToggle) {
        navToggle.addEventListener("click", openSidebar);
    }

    if (sidebarClose) {
        sidebarClose.addEventListener("click", closeSidebar);
    }

    if (sidebar) {
        sidebar.addEventListener("click", (e) => {
            if (e.target === sidebar.querySelector(".sidebar-backdrop")) {
                closeSidebar();
            }
        });
    }

    sidebarLinks.forEach(link => {
        link.addEventListener("click", closeSidebar);
    });

    // Featured projects carousel - slideshow
    const carouselTrack = document.getElementById("featuredCarousel");
    const prevBtn = document.getElementById("carouselPrev");
    const nextBtn = document.getElementById("carouselNext");

    if (carouselTrack) {
        let projects = [];
        let currentIndex = 0;
        let slidesPerView = 3;
        let autoplayInterval = null;

        function updateSlidesPerView() {
            if (window.innerWidth <= 768) {
                slidesPerView = 1;
            } else if (window.innerWidth <= 1024) {
                slidesPerView = 2;
            } else {
                slidesPerView = 3;
            }
        }

        function createCard(project) {
            return `
                <a class="featured-card" href="gallery.html">
                    <div class="project-cover">
                        ${project.cover
                            ? `<img src="${mediaUrl(project.cover)}" alt="${escapeHtml(project.title)}">`
                            : `<div class="project-placeholder"><i class="fa-solid fa-camera"></i></div>`}
                        <div class="project-overlay">
                            <h3>${escapeHtml(project.title)}</h3>
                            <p>${escapeHtml(project.location || "")}</p>
                        </div>
                    </div>
                </a>
            `;
        }

        async function loadProjects() {
            try {
                const res = await fetch(`${API}/api/projects`);
                const data = await res.json();
                projects = data.projects || [];
                renderCarousel();
                startAutoplay();
            } catch (err) {
                console.error("Failed to load projects", err);
                carouselTrack.innerHTML = "<p class='gallery-empty'>Could not load projects.</p>";
            }
        }

        function renderCarousel() {
            if (!projects.length) {
                carouselTrack.innerHTML = "<p class='gallery-empty'>No projects yet.</p>";
                return;
            }

            updateSlidesPerView();
            carouselTrack.innerHTML = projects.map(createCard).join("");
            currentIndex = 0;
            updateCarouselPosition(false);
        }

        function updateCarouselPosition(animate = true) {
            const cards = carouselTrack.querySelectorAll(".featured-card");
            if (!cards.length) return;

            const card = cards[0];
            const cardWidth = card.offsetWidth;
            const gap = 24;
            const maxIndex = Math.max(0, projects.length - slidesPerView);
            currentIndex = Math.min(currentIndex, maxIndex);
            currentIndex = Math.max(currentIndex, 0);

            const offset = currentIndex * (cardWidth + gap);
            carouselTrack.style.transition = animate ? "transform 0.6s ease" : "none";
            carouselTrack.style.transform = `translateX(-${offset}px)`;
        }

        function startAutoplay() {
            stopAutoplay();
            autoplayInterval = setInterval(() => {
                const cards = carouselTrack.querySelectorAll(".featured-card");
                if (!cards.length) return;
                const maxIndex = Math.max(0, projects.length - slidesPerView);
                currentIndex = currentIndex >= maxIndex ? 0 : currentIndex + 1;
                updateCarouselPosition(true);
            }, 4000);
        }

        function stopAutoplay() {
            if (autoplayInterval) {
                clearInterval(autoplayInterval);
                autoplayInterval = null;
            }
        }

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                currentIndex--;
                updateCarouselPosition(true);
                stopAutoplay();
                startAutoplay();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                currentIndex++;
                updateCarouselPosition(true);
                stopAutoplay();
                startAutoplay();
            });
        }

        carouselTrack.addEventListener("mouseenter", stopAutoplay);
        carouselTrack.addEventListener("mouseleave", startAutoplay);
        carouselTrack.addEventListener("touchstart", stopAutoplay, { passive: true });
        carouselTrack.addEventListener("touchend", () => {
            setTimeout(startAutoplay, 3000);
        });

        window.addEventListener("resize", () => {
            updateSlidesPerView();
            updateCarouselPosition(false);
        });

        loadProjects();
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // Custom date picker calendar for booking form
    if (document.getElementById('date') && document.getElementById('miniCalendar')) {
        const dateInput = document.getElementById('date');
        const miniCalendar = document.getElementById('miniCalendar');
        const monthYearTitle = document.getElementById('monthYearTitle');
        const calendarDaysGrid = document.getElementById('calendarDaysGrid');
        const prevMonthBtn = document.getElementById('prevMonthBtn');
        const nextMonthBtn = document.getElementById('nextMonthBtn');
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        let displayDate = new Date();
        let selectedDate = null;
        const realToday = new Date();

        function renderCalendar() {
            const year = displayDate.getFullYear();
            const month = displayDate.getMonth();
            monthYearTitle.textContent = `${monthNames[month]} ${year}`;
            const firstDayIndex = new Date(year, month, 1).getDay();
            const totalDays = new Date(year, month + 1, 0).getDate();
            calendarDaysGrid.innerHTML = '';

            for (let i = 0; i < firstDayIndex; i++) {
                const emptyCell = document.createElement('div');
                emptyCell.classList.add('day', 'empty');
                calendarDaysGrid.appendChild(emptyCell);
            }

            for (let day = 1; day <= totalDays; day++) {
                const dayCell = document.createElement('div');
                dayCell.classList.add('day');
                dayCell.textContent = day;
                const isToday = day === realToday.getDate() && month === realToday.getMonth() && year === realToday.getFullYear();
                const isSelected = selectedDate && day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();
                if (isToday) dayCell.classList.add('today');
                if (isSelected) dayCell.classList.add('selected');
                dayCell.addEventListener('click', () => {
                    selectedDate = new Date(year, month, day);
                    const formattedMonth = String(month + 1).padStart(2, '0');
                    const formattedDay = String(day).padStart(2, '0');
                    dateInput.value = `${year}-${formattedMonth}-${formattedDay}`;
                    renderCalendar();
                    miniCalendar.classList.remove('active');
                });
                calendarDaysGrid.appendChild(dayCell);
            }
        }

        dateInput.addEventListener('click', (e) => {
            e.stopPropagation();
            miniCalendar.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.datepicker-container')) {
                miniCalendar.classList.remove('active');
            }
        });

        prevMonthBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            displayDate.setMonth(displayDate.getMonth() - 1);
            renderCalendar();
        });

        nextMonthBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            displayDate.setMonth(displayDate.getMonth() + 1);
            renderCalendar();
        });

        renderCalendar();
    }

    // Enhanced service picker
    const servicePicker = document.getElementById('servicePicker');
    if (servicePicker) {
        const trigger = document.getElementById('servicePickerTrigger');
        const dropdown = document.getElementById('servicePickerDropdown');
        const valueEl = document.getElementById('servicePickerValue');
        const hiddenSelect = document.getElementById('service');
        const options = Array.from(dropdown.querySelectorAll('.service-picker-option'));

        function openPicker() {
            servicePicker.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
        }

        function closePicker() {
            servicePicker.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            options.forEach(opt => opt.classList.remove('focused'));
        }

        function selectOption(option) {
            const value = option.dataset.value;
            const text = option.querySelector('.service-text').textContent;
            options.forEach(opt => {
                opt.classList.remove('selected');
                opt.setAttribute('aria-selected', 'false');
            });
            option.classList.add('selected');
            option.setAttribute('aria-selected', 'true');
            valueEl.textContent = text;
            valueEl.classList.remove('placeholder');
            hiddenSelect.value = value;
            closePicker();
        }

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (servicePicker.classList.contains('open')) {
                closePicker();
            } else {
                openPicker();
            }
        });

        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (servicePicker.classList.contains('open')) {
                    closePicker();
                } else {
                    openPicker();
                }
            }
        });

        options.forEach((option, index) => {
            option.addEventListener('click', () => selectOption(option));
            option.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectOption(option);
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = options[(index + 1) % options.length];
                    next.focus();
                    options.forEach(o => o.classList.remove('focused'));
                    next.classList.add('focused');
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = options[(index - 1 + options.length) % options.length];
                    prev.focus();
                    options.forEach(o => o.classList.remove('focused'));
                    prev.classList.add('focused');
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!servicePicker.contains(e.target)) {
                closePicker();
            }
        });
    }

    // Helper to preload images into browser memory & SW cache for zero latency
    function preloadMediaAssets(urls) {
        if (!urls) return;
        const list = Array.isArray(urls) ? urls : [urls];
        list.forEach(url => {
            if (!url || typeof url !== 'string') return;
            if (/\.(mp4|mov|webm|ogv|m4v)(\?.*)?$/i.test(url)) return;
            const img = new Image();
            img.src = url;
        });
    }

    // ---- About image (dynamic & zero latency) ----
    async function loadAboutImage() {
        const wrap = document.getElementById("aboutImageContainer");
        const imgEl = document.getElementById("aboutImage");
        if (!wrap && !imgEl) return;

        const fallbackUrl = "https://images.unsplash.com/photo-1554048612-b6a482bc67e5?w=800&q=80";

        try {
            const res = await fetch(`${API}/api/about`);
            const data = await res.json();
            if (data && data.success && data.image) {
                const optimizedUrl = cldUrl(mediaUrl(data.image), 'w_800,c_limit,q_auto,f_auto');
                preloadMediaAssets(optimizedUrl);
                if (imgEl) {
                    imgEl.src = optimizedUrl;
                    if (data.alt) imgEl.alt = data.alt;
                } else if (wrap) {
                    const badgeHtml = wrap.querySelector(".about-badge") ? wrap.querySelector(".about-badge").outerHTML : '';
                    wrap.innerHTML = `<img id="aboutImage" src="${optimizedUrl}" alt="${escapeHtml(data.alt || 'Mwavuli Photographer')}" loading="eager" decoding="async" fetchpriority="high">${badgeHtml}`;
                }
            } else {
                if (imgEl && (!imgEl.src || imgEl.src.includes('about.jpg'))) {
                    imgEl.src = fallbackUrl;
                }
            }
        } catch (err) {
            console.error("Failed to load about image", err);
            if (imgEl && (!imgEl.src || imgEl.src.includes('about.jpg'))) {
                imgEl.src = fallbackUrl;
            }
        }
    }

    // ---- 3D Cover Flow Hero Slideshow (Cloudinary dynamic API) ----
    function init3DCoverFlow() {
        const track = document.getElementById("c3d-track");
        const dotsContainer = document.getElementById("c3d-dots");
        const prevBtn = document.getElementById("c3d-prev");
        const nextBtn = document.getElementById("c3d-next");
        if (!track) return;

        // Render initial skeleton shimmer cards while loading media
        track.innerHTML = `
            <div class="carousel-3d-item skeleton-card active"><div class="skel-shimmer"></div></div>
            <div class="carousel-3d-item skeleton-card prev-1"><div class="skel-shimmer"></div></div>
            <div class="carousel-3d-item skeleton-card next-1"><div class="skel-shimmer"></div></div>
        `;

        let items = [];
        let currentIndex = 0;
        let autoplayTimer = null;

        function update3DPositions() {
            const cardEls = track.querySelectorAll(".carousel-3d-item");
            const dotEls = dotsContainer ? dotsContainer.querySelectorAll(".carousel-3d-dot") : [];
            const total = cardEls.length;
            if (!total) return;

            cardEls.forEach((item, i) => {
                item.className = "carousel-3d-item";
                let diff = (i - currentIndex) % total;
                if (diff < 0) diff += total;
                if (diff > Math.floor(total / 2)) diff -= total;

                if (diff === 0) item.classList.add("active");
                else if (diff === -1) item.classList.add("prev-1");
                else if (diff === 1) item.classList.add("next-1");
                else if (diff === -2) item.classList.add("prev-2");
                else if (diff === 2) item.classList.add("next-2");
                else item.classList.add("hidden");
            });

            dotEls.forEach((dot, i) => {
                dot.classList.toggle("active", i === currentIndex);
            });
        }

        function next3D() {
            const total = track.children.length;
            if (!total) return;
            currentIndex = (currentIndex + 1) % total;
            update3DPositions();
        }

        function prev3D() {
            const total = track.children.length;
            if (!total) return;
            currentIndex = (currentIndex - 1 + total) % total;
            update3DPositions();
        }

        function startAutoplay() {
            stopAutoplay();
            autoplayTimer = setInterval(next3D, 10000); // 10s strict uninterrupted interval
        }

        function stopAutoplay() {
            if (autoplayTimer) clearInterval(autoplayTimer);
            autoplayTimer = null;
        }

        async function load3DItems() {
            try {
                // Fetch hero slides or recent photos
                const [heroRes, photosRes] = await Promise.all([
                    fetch(`${API}/api/hero`).catch(() => null),
                    fetch(`${API}/api/photos`).catch(() => null)
                ]);

                let slidesData = [];
                if (heroRes && heroRes.ok) {
                    const hData = await heroRes.json();
                    if (hData && hData.slides && hData.slides.length) {
                        slidesData = hData.slides.map(s => {
                            const isVideo = s.mediaType === 'video' || (s.image && /\.(mp4|mov|webm|ogv|m4v)(\?.*)?$/i.test(s.image));
                            return { src: cldUrl(mediaUrl(s.image), "w_1200,c_limit,q_auto,f_auto"), isVideo };
                        });
                    }
                }

                if (!slidesData.length && photosRes && photosRes.ok) {
                    const pData = await photosRes.json();
                    if (pData && pData.photos && pData.photos.length) {
                        slidesData = pData.photos.slice(0, 7).map(p => {
                            const isVideo = p.mediaType === 'video' || (p.file && /\.(mp4|mov|webm|ogv|m4v)(\?.*)?$/i.test(p.file));
                            return { src: cldUrl(mediaUrl(p.file), "w_1200,c_limit,q_auto,f_auto"), isVideo };
                        });
                    }
                }

                // Default high-quality fallbacks if backend array is empty
                if (!slidesData.length) {
                    slidesData = [
                        { src: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1000&q=80", isVideo: false },
                        { src: "https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1000&q=80", isVideo: false },
                        { src: "https://images.unsplash.com/photo-1502472581566-8ac52a65a396?w=1000&q=80", isVideo: false },
                        { src: "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=1000&q=80", isVideo: false },
                        { src: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1000&q=80", isVideo: false }
                    ];
                }

                // Preload all image assets for 0 latency slide transitions
                preloadMediaAssets(slidesData.map(s => s.src));

                track.innerHTML = slidesData.map((item, idx) => {
                    return item.isVideo
                        ? `<div class="carousel-3d-item"><video autoplay muted loop playsinline webkit-playsinline src="${item.src}"></video></div>`
                        : `<div class="carousel-3d-item"><img src="${item.src}" alt="Hero Showcase" loading="${idx === 0 ? 'eager' : 'lazy'}" fetchpriority="${idx === 0 ? 'high' : 'auto'}" decoding="async"></div>`;
                }).join("");
                
                if (dotsContainer) {
                    dotsContainer.innerHTML = slidesData.map((_, i) => `<span class="carousel-3d-dot" data-index="${i}"></span>`).join("");
                    dotsContainer.querySelectorAll(".carousel-3d-dot").forEach((dot, i) => {
                        dot.addEventListener("click", () => {
                            currentIndex = i;
                            update3DPositions();
                        });
                    });
                }

                track.querySelectorAll(".carousel-3d-item").forEach((item, i) => {
                    item.addEventListener("click", () => {
                        currentIndex = i;
                        update3DPositions();
                    });
                });

                currentIndex = Math.floor(slidesData.length / 2);
                update3DPositions();
                startAutoplay();
            } catch (err) {
                console.error("Failed to load 3D carousel items", err);
            }
        }

        if (prevBtn) prevBtn.addEventListener("click", () => { prev3D(); });
        if (nextBtn) nextBtn.addEventListener("click", () => { next3D(); });

        load3DItems();
    }

    // ---- Segmented Controls & Dynamic Cloudinary Portfolio ----
    function initMinimalPortfolio() {
        const container = document.getElementById("dynamicContainer");
        const segmentBtns = document.querySelectorAll(".segment-btn");
        const indicator = document.getElementById("segmentIndicator");
        if (!container) return;

        let projects = [];
        let allPhotos = [];

        const updateIndicator = (activeBtn) => {
            if (!indicator || !activeBtn) return;
            indicator.style.width = `${activeBtn.offsetWidth}px`;
            indicator.style.transform = `translateX(${activeBtn.offsetLeft - 6}px)`;
        };

        const activeSegment = document.querySelector(".segment-btn.active");
        if (activeSegment) updateIndicator(activeSegment);

        segmentBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                segmentBtns.forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                updateIndicator(e.target);

                const target = e.target.getAttribute("data-target");
                if (target === "albums") renderAlbums();
                else renderAllPhotos();
            });
        });

        async function fetchPortfolioData() {
            const cacheKey = "MWAVULI_PORTFOLIO_CACHE_V2";
            const cachedEntry = window.SmartCacheManager ? window.SmartCacheManager.getCache(cacheKey) : null;
            let hasCachedRender = false;

            if (cachedEntry && cachedEntry.data) {
                try {
                    const data = cachedEntry.data;
                    if (data.projects && data.allPhotos) {
                        projects = data.projects;
                        allPhotos = data.allPhotos;
                        renderAlbums();
                        hasCachedRender = true;
                    }
                } catch (_) {}
            }

            async function syncFromAPI() {
                try {
                    const [projectsRes, photosRes] = await Promise.all([
                        fetch(`${API}/api/projects`),
                        fetch(`${API}/api/photos`)
                    ]);
                    const projectsData = await projectsRes.json();
                    const photosData = await photosRes.json();

                    const freshProjects = projectsData.projects || [];
                    const freshPhotos = photosData.photos || [];
                    const freshPayload = { projects: freshProjects, allPhotos: freshPhotos };

                    // Incremental Hash Diff Check: update ONLY if payload actually changed!
                    if (!window.SmartCacheManager || window.SmartCacheManager.hasChanged(cacheKey, freshPayload)) {
                        const pDiff = window.SmartCacheManager
                            ? window.SmartCacheManager.diffMerge(projects, freshProjects)
                            : { merged: freshProjects, hasChanges: true };
                        const phDiff = window.SmartCacheManager
                            ? window.SmartCacheManager.diffMerge(allPhotos, freshPhotos)
                            : { merged: freshPhotos, hasChanges: true };

                        if (pDiff.hasChanges || phDiff.hasChanges || !hasCachedRender) {
                            projects = pDiff.merged;
                            allPhotos = phDiff.merged;
                            if (window.SmartCacheManager) {
                                window.SmartCacheManager.saveCache(cacheKey, { projects, allPhotos });
                            } else {
                                localStorage.setItem(cacheKey, JSON.stringify({ data: { projects, allPhotos } }));
                            }

                            // Perform targeted DOM update only when necessary
                            const activeTarget = document.querySelector(".segment-btn.active")?.getAttribute("data-target");
                            if (activeTarget === "all") {
                                renderAllPhotos();
                            } else {
                                renderAlbums();
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to load portfolio data", err);
                    if (!hasCachedRender) {
                        container.innerHTML = "<p class='gallery-empty' style='text-align:center;'>Could not load portfolio photos.</p>";
                    }
                }
            }

            syncFromAPI();

            // Real-time Cross-Tab Storage Sync
            window.addEventListener("storage", (e) => {
                if (e.key === cacheKey && e.newValue) {
                    try {
                        const parsed = JSON.parse(e.newValue);
                        if (parsed && parsed.data) {
                            projects = parsed.data.projects || [];
                            allPhotos = parsed.data.allPhotos || [];
                            renderAlbums();
                        }
                    } catch (_) {}
                }
            });

            // Refresh background cache on tab visibility regain
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") syncFromAPI();
            });
        }

        function renderAlbums() {
            if (!projects.length) {
                renderAllPhotos();
                return;
            }

            container.innerHTML = `<div class="albums-grid"></div>`;
            const grid = container.querySelector(".albums-grid");

            projects.forEach(p => {
                const pPhotos = allPhotos.filter(photo => photo.project === p._id);
                const count = pPhotos.length || 1;
                const isVideoCover = p.mediaType === 'video' || (p.cover && /\.(mp4|mov|webm|ogv|m4v)(\?.*)?$/i.test(p.cover));
                const coverUrl = p.cover
                    ? cldUrl(mediaUrl(p.cover), "w_800,c_limit,q_auto,f_auto")
                    : "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&q=80";

                const card = document.createElement("div");
                card.className = "album-card reveal-item reveal active";
                card.innerHTML = `
                    <div class="album-cover">
                        ${isVideoCover 
                            ? `<video autoplay muted loop playsinline webkit-playsinline src="${coverUrl}"></video>` 
                            : `<img src="${coverUrl}" alt="${escapeHtml(p.title)}" loading="lazy">`
                        }
                    </div>
                    <div class="album-info">
                        <div class="album-title">${escapeHtml(p.title)}</div>
                        <div class="album-count">${count} photos</div>
                    </div>
                `;
                card.addEventListener("click", () => renderAlbumPhotos(p._id, p.title));
                grid.appendChild(card);
            });
            playAllVideosOnPage();
        }

        function renderAllPhotos() {
            renderPhotoGrid(allPhotos);
        }

        function renderAlbumPhotos(projectId, projectTitle) {
            const pPhotos = allPhotos.filter(photo => photo.project === projectId);
            renderPhotoGrid(pPhotos, projectTitle);
        }

        function renderPhotoGrid(photosList, albumTitle = null) {
            if (albumTitle) {
                segmentBtns.forEach(b => b.classList.remove("active"));
                if (indicator) indicator.style.width = "0";
            }

            let html = "";
            if (albumTitle) {
                html += `
                    <div class="header-actions">
                        <button class="back-btn" id="backToAlbumsBtn">
                            <i class="fa-solid fa-arrow-left"></i> Back to Albums
                        </button>
                        <h2>${escapeHtml(albumTitle)}</h2>
                    </div>
                `;
            }

            html += `<div class="photos-grid"></div>`;
            container.innerHTML = html;
            const grid = container.querySelector(".photos-grid");

            if (!photosList.length) {
                grid.innerHTML = "<p class='gallery-empty' style='grid-column:1/-1; text-align:center;'>No photos available in this album.</p>";
                return;
            }

            const MOSAIC = ["big", "", "tall", "", "wide", "", "tall", "", "", "wide"];
            const fullUrls = photosList.map(p => cldUrl(mediaUrl(p.file), "w_1600,c_limit,q_auto,f_auto"));

            photosList.forEach((photo, idx) => {
                const item = document.createElement("div");
                const spanClass = MOSAIC[idx % MOSAIC.length];
                item.className = `photo-item reveal-item reveal active ${spanClass}`;
                const thumbUrl = cldUrl(mediaUrl(photo.thumbnail || photo.file), "w_800,c_limit,q_auto,f_auto");
                const isVideo = photo.mediaType === "video" || (photo.file && /\.(mp4|mov|webm|ogv|m4v)(\?.*)?$/i.test(photo.file));
                
                if (isVideo) {
                    item.innerHTML = `<video autoplay muted loop playsinline webkit-playsinline src="${cldUrl(mediaUrl(photo.file), "w_1200,c_limit,q_auto,f_auto")}"></video>`;
                } else {
                    item.innerHTML = `<img src="${thumbUrl}" alt="${escapeHtml(photo.title || 'Photo')}" loading="lazy">`;
                }

                item.addEventListener("click", () => {
                    if (window.openLightbox) window.openLightbox(fullUrls, idx);
                });
                grid.appendChild(item);
            });

            const backBtn = document.getElementById("backToAlbumsBtn");
            if (backBtn) {
                backBtn.addEventListener("click", () => {
                    const albBtn = document.querySelector('.segment-btn[data-target="albums"]');
                    if (albBtn) albBtn.click();
                    else renderAlbums();
                });
            }
            playAllVideosOnPage();
        }

        fetchPortfolioData();
    }

    // Lightbox integration
    // Lightbox integration - Zero latency preloading, image & video aspect ratio preservation
    (function initLightbox() {
        const lightbox = document.getElementById("lightbox");
        const lightboxImg = document.getElementById("lightbox-img");
        const lightboxVideo = document.getElementById("lightbox-video");
        const closeBtn = document.getElementById("lightboxClose");
        const prevBtn = document.getElementById("lightboxPrev");
        const nextBtn = document.getElementById("lightboxNext");
        const audioToggleBtn = document.getElementById("lightboxAudioToggle");
        const audioToggleIcon = document.getElementById("audioToggleIcon");
        if (!lightbox) return;

        let sources = [];
        let currentIndex = 0;
        const memoryCache = new Map();

        function isVideoUrl(item) {
            if (!item) return false;
            if (typeof item === "object" && item.type === "video") return true;
            const str = typeof item === "object" ? item.url : item;
            return /\.(mp4|mov|webm|ogv|m4v)(\?.*)?$/i.test(str);
        }

        function getUrl(item) {
            if (!item) return "";
            return typeof item === "object" ? item.url : item;
        }

        function preload(item) {
            const url = getUrl(item);
            if (!url || memoryCache.has(url) || isVideoUrl(item)) return;
            const img = new Image();
            img.decoding = "async";
            img.src = url;
            memoryCache.set(url, img);
        }

        window.preloadLightboxSources = function (urls) {
            if (Array.isArray(urls)) urls.forEach(preload);
        };

        window.openLightbox = function (imgs, idx = 0) {
            if (!imgs || !imgs.length) return;
            sources = imgs;
            currentIndex = idx;
            sources.forEach(preload);

            showCurrent();
            lightbox.classList.add("active");
            document.body.style.overflow = "hidden";
        };

        function updateAudioIcon() {
            if (!audioToggleIcon || !lightboxVideo) return;
            audioToggleIcon.className = lightboxVideo.muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
        }

        function showCurrent() {
            if (!sources.length) return;
            const currentItem = sources[currentIndex];
            const url = getUrl(currentItem);

            if (isVideoUrl(currentItem)) {
                if (lightboxImg) lightboxImg.style.display = "none";
                if (lightboxVideo) {
                    lightboxVideo.style.display = "block";
                    lightboxVideo.loop = true;
                    lightboxVideo.removeAttribute("controls");
                    const fastUrl = cldUrl(url, "q_auto,f_auto,w_1200");
                    if (lightboxVideo.src !== fastUrl) {
                        lightboxVideo.src = fastUrl;
                    }
                    lightboxVideo.muted = false;
                    lightboxVideo.volume = 1.0;
                    if (audioToggleBtn) audioToggleBtn.style.display = "flex";
                    updateAudioIcon();

                    const p = lightboxVideo.play();
                    if (p !== undefined) {
                        p.catch(() => {
                            lightboxVideo.muted = true;
                            updateAudioIcon();
                            lightboxVideo.play().then(() => {
                                lightboxVideo.muted = false;
                                updateAudioIcon();
                            }).catch(() => {});
                        });
                    }
                }
            } else {
                if (lightboxVideo) {
                    lightboxVideo.pause();
                    lightboxVideo.src = "";
                    lightboxVideo.style.display = "none";
                }
                if (audioToggleBtn) audioToggleBtn.style.display = "none";
                if (lightboxImg) {
                    lightboxImg.style.display = "block";
                    lightboxImg.src = url;
                }
            }

            const nextIdx = (currentIndex + 1) % sources.length;
            const prevIdx = (currentIndex - 1 + sources.length) % sources.length;
            preload(sources[nextIdx]);
            preload(sources[prevIdx]);
        }

        if (audioToggleBtn && lightboxVideo) {
            audioToggleBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                lightboxVideo.muted = !lightboxVideo.muted;
                updateAudioIcon();
            });
        }

        function close() {
            if (lightboxVideo) {
                lightboxVideo.pause();
                lightboxVideo.src = "";
            }
            lightbox.classList.remove("active");
            document.body.style.overflow = "";
        }

        if (closeBtn) closeBtn.addEventListener("click", close);
        if (prevBtn) prevBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            currentIndex = (currentIndex - 1 + sources.length) % sources.length;
            showCurrent();
        });
        if (nextBtn) nextBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            currentIndex = (currentIndex + 1) % sources.length;
            showCurrent();
        });

        // Touch Swipe Navigation for mobile devices
        let touchStartX = 0;
        let touchEndX = 0;
        lightbox.addEventListener("touchstart", (e) => {
            if (e.touches && e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
            }
        }, { passive: true });

        lightbox.addEventListener("touchend", (e) => {
            if (e.changedTouches && e.changedTouches.length === 1) {
                touchEndX = e.changedTouches[0].clientX;
                const diff = touchEndX - touchStartX;
                if (Math.abs(diff) > 40) {
                    if (diff < 0) {
                        currentIndex = (currentIndex + 1) % sources.length;
                    } else {
                        currentIndex = (currentIndex - 1 + sources.length) % sources.length;
                    }
                    showCurrent();
                }
            }
        }, { passive: true });

        document.addEventListener("keydown", (e) => {
            if (!lightbox.classList.contains("active")) return;
            if (e.key === "Escape") close();
            if (e.key === "ArrowLeft") {
                currentIndex = (currentIndex - 1 + sources.length) % sources.length;
                showCurrent();
            }
            if (e.key === "ArrowRight") {
                currentIndex = (currentIndex + 1) % sources.length;
                showCurrent();
            }
        });

        lightbox.addEventListener("click", (e) => { if (e.target === lightbox) close(); });
    })();

    // Floating WhatsApp FAB with Guaranteed Popup Audio Sound
    function initBookNowFab() {
        const fab = document.getElementById("bookNowFab");
        const hero = document.getElementById("home");
        if (!fab || !hero) return;

        let soundPlayed = false;
        const popupAudio = new Audio("assets/audio/popup.mp3");
        popupAudio.preload = "auto";

        // Global Web Audio Context for zero-latency pop sound
        let audioCtx = null;
        function getAudioContext() {
            if (!audioCtx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) audioCtx = new AudioCtx();
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
            return audioCtx;
        }

        // Silent unlock listener on first user interaction
        function unlockAudioEngine() {
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
            popupAudio.load();
        }

        window.addEventListener("pointerdown", unlockAudioEngine, { once: true, passive: true });
        window.addEventListener("touchstart", unlockAudioEngine, { once: true, passive: true });
        window.addEventListener("scroll", unlockAudioEngine, { once: true, passive: true });

        function playPop() {
            // 1. Play Web Audio API pop sound (instant, 100% reliable)
            try {
                const ctx = getAudioContext();
                if (ctx) {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(320, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

                    gain.gain.setValueAtTime(0.5, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.12);
                }
            } catch (e) {}

            // 2. Play MP3 file
            try {
                popupAudio.currentTime = 0;
                popupAudio.play().catch(() => {});
            } catch (e) {}
        }

        window.addEventListener("scroll", () => {
            const threshold = hero.offsetHeight * 0.25;
            if (window.scrollY > threshold) {
                if (!fab.classList.contains("visible")) {
                    fab.classList.add("visible");
                    if (!soundPlayed) {
                        playPop();
                        soundPlayed = true;
                    }
                }
            }
        });
    }

    // Global scroll reveal
    function initScrollReveal() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("active");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
    }

    function playAllVideosOnPage() {
        const videos = document.querySelectorAll("video");
        videos.forEach(v => {
            v.muted = true;
            v.playsInline = true;
            v.setAttribute("autoplay", "");
            v.setAttribute("muted", "");
            v.setAttribute("playsinline", "");
            v.setAttribute("webkit-playsinline", "");
            const p = v.play();
            if (p !== undefined) {
                p.catch(() => {});
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            loadAboutImage();
            playAllVideosOnPage();
            init3DCoverFlow();
            initMinimalPortfolio();
            initBookNowFab();
            initScrollReveal();
        });
    } else {
        loadAboutImage();
        playAllVideosOnPage();
        init3DCoverFlow();
        initMinimalPortfolio();
        initBookNowFab();
        initScrollReveal();
    }

    ['click', 'touchstart', 'scroll', 'keydown'].forEach(evt => {
        window.addEventListener(evt, playAllVideosOnPage, { once: true, passive: true });
    });
})();
