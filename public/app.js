const FRAME_WIDTH = 600;
const FRAME_HEIGHT = 1800;

const frames = [
    { id: "ubc", label: "UBC", src: "assets/UBC.png" },
    { id: "film", label: "Film", src: "assets/Film.png" },
    { id: "lights", label: "Lights", src: "assets/Lights.png" },
    { id: "red", label: "Red", src: "assets/Red.png" },
    { id: "white", label: "White", src: "assets/White.png" }
];

const slots = [
    { x: 60, y: 60, w: 480, h: 363 },
    { x: 60, y: 465, w: 480, h: 363 },
    { x: 60, y: 873, w: 480, h: 363 },
    { x: 60, y: 1278, w: 480, h: 363 }
];

const screens = {
    start: document.getElementById("screen-start"),
    capture: document.getElementById("screen-capture"),
    select: document.getElementById("screen-select"),
    preview: document.getElementById("screen-preview"),
    done: document.getElementById("screen-done")
};

const startBtn = document.getElementById("start-btn");
const video = document.getElementById("video");
const countdownEl = document.getElementById("countdown");
const progressEl = document.getElementById("progress");
const thumbGrid = document.getElementById("thumb-grid");
const selectionCountEl = document.getElementById("selection-count");
const previewBtn = document.getElementById("preview-btn");
const previewCanvas = document.getElementById("preview-canvas");
const frameGrid = document.getElementById("frame-grid");
const backBtn = document.getElementById("back-btn");
const exportBtn = document.getElementById("export-btn");
const qrImage = document.getElementById("qr-image");
const downloadLink = document.getElementById("download-link");
const restartBtn = document.getElementById("restart-btn");
const retakeBtn = document.getElementById("retake-btn");
const qrVideoImage = document.getElementById("qr-video-image");
const qrVideoLoading = document.getElementById("qr-video-loading");

let photos = [];
let captureClips = []; // stores continuous video Blobs for each of the 6 photos
let selectedIndexes = new Set();
let selectedFrameIndex = 0;
const frameCache = new Map();

const showScreen = (screenKey) => {
    Object.values(screens).forEach((screen) => screen.classList.remove("screen--active"));
    screens[screenKey].classList.add("screen--active");
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadImage = (src) =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });

const getFrameImage = async (src) => {
    if (frameCache.has(src)) {
        return frameCache.get(src);
    }
    const img = await loadImage(src);
    frameCache.set(src, img);
    return img;
};

const renderComposite = (ctx, frameImage, imageElements) => {
    ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    ctx.drawImage(frameImage, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);

    imageElements.forEach((img, idx) => {
        const slot = slots[idx];
        ctx.save();
        ctx.beginPath();
        ctx.rect(slot.x, slot.y, slot.w, slot.h);
        ctx.clip();
        drawImageCover(ctx, img, slot.x, slot.y, slot.w, slot.h);
        ctx.restore();
    });
};

const buildFrameGrid = async () => {
    if (!frameGrid) {
        return;
    }
    frameGrid.innerHTML = "";

    const selected = Array.from(selectedIndexes).map((index) => photos[index]);
    const imageElements = await Promise.all(selected.map((src) => loadImage(src)));

    await Promise.all(
        frames.map(async (frame, index) => {
            const frameImage = await getFrameImage(frame.src);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "frame-option";
            if (index === selectedFrameIndex) {
                button.classList.add("selected");
            }

            const canvas = document.createElement("canvas");
            canvas.width = FRAME_WIDTH;
            canvas.height = FRAME_HEIGHT;
            const ctx = canvas.getContext("2d");
            renderComposite(ctx, frameImage, imageElements);
            button.appendChild(canvas);

            button.addEventListener("click", async () => {
                selectedFrameIndex = index;
                frameGrid.querySelectorAll(".frame-option").forEach((el, idx) => {
                    el.classList.toggle("selected", idx === selectedFrameIndex);
                });
                await renderPreview();
            });

            frameGrid.appendChild(button);
        })
    );
};

const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
    });
    video.srcObject = stream;
    await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve();
    });
};

const stopCamera = () => {
    const stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = null;
};

const capturePhoto = () => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
};

const runCountdown = async (seconds) => {
    for (let i = seconds; i > 0; i -= 1) {
        countdownEl.textContent = i;
        await wait(1000);
    }
};

const startCaptureFlow = async () => {
    photos = [];
    captureClips = [];
    selectedIndexes = new Set();
    selectedFrameIndex = 0;
    progressEl.textContent = "0 / 6";
    showScreen("capture");

    try {
        await startCamera();

        // Determine a supported mimeType for clip recording
        let clipMime = "video/webm;codecs=vp9";
        if (!MediaRecorder.isTypeSupported(clipMime)) clipMime = "video/webm;codecs=vp8";
        if (!MediaRecorder.isTypeSupported(clipMime)) clipMime = "video/webm";

        for (let i = 0; i < 6; i += 1) {
            // Record a continuous video clip during the countdown
            const clipChunks = [];
            const clipRecorder = new MediaRecorder(video.srcObject, { mimeType: clipMime });
            clipRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) clipChunks.push(e.data);
            };
            const clipDone = new Promise((resolve) => {
                clipRecorder.onstop = () => resolve(new Blob(clipChunks, { type: "video/webm" }));
            });

            clipRecorder.start();
            await runCountdown(2);
            clipRecorder.stop();

            const clipBlob = await clipDone;
            captureClips.push(clipBlob);

            const dataUrl = capturePhoto();
            photos.push(dataUrl);
            progressEl.textContent = `${i + 1} / 6`;
        }
    } catch (error) {
        alert("Camera permission is required to use the photobooth.");
        showScreen("start");
        return;
    } finally {
        stopCamera();
    }

    buildSelectionGrid();
    showScreen("select");
};

const buildSelectionGrid = () => {
    thumbGrid.innerHTML = "";
    photos.forEach((dataUrl, index) => {
        const thumb = document.createElement("div");
        thumb.className = "thumb";
        const img = document.createElement("img");
        img.src = dataUrl;
        thumb.appendChild(img);
        thumb.addEventListener("click", () => toggleSelection(index, thumb));
        thumbGrid.appendChild(thumb);
    });
    updateSelectionStatus();
};

const toggleSelection = (index, thumbEl) => {
    if (selectedIndexes.has(index)) {
        selectedIndexes.delete(index);
        thumbEl.classList.remove("selected");
    } else {
        if (selectedIndexes.size >= 4) {
            return;
        }
        selectedIndexes.add(index);
        thumbEl.classList.add("selected");
    }
    updateSelectionStatus();
};

const updateSelectionStatus = () => {
    selectionCountEl.textContent = `${selectedIndexes.size} / 4 selected`;
    previewBtn.disabled = selectedIndexes.size !== 4;
};

const drawImageCover = (ctx, img, x, y, w, h) => {
    const srcW = img.videoWidth || img.width;
    const srcH = img.videoHeight || img.height;
    const imgRatio = srcW / srcH;
    const boxRatio = w / h;
    let drawWidth = w;
    let drawHeight = h;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > boxRatio) {
        drawWidth = h * imgRatio;
        offsetX = (w - drawWidth) / 2;
    } else {
        drawHeight = w / imgRatio;
        offsetY = (h - drawHeight) / 2;
    }

    ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
};

const renderPreview = async () => {
    const ctx = previewCanvas.getContext("2d");
    const frame = frames[selectedFrameIndex] ?? frames[0];
    const frameImage = await getFrameImage(frame.src);
    previewCanvas.width = FRAME_WIDTH;
    previewCanvas.height = FRAME_HEIGHT;

    const selected = Array.from(selectedIndexes).map((index) => photos[index]);
    const imageElements = await Promise.all(selected.map((src) => loadImage(src)));

    renderComposite(ctx, frameImage, imageElements);
};

const recordIterationVideo = async () => {
    // Use an offscreen canvas — no visible recording screen
    const offCanvas = document.createElement("canvas");
    offCanvas.width = FRAME_WIDTH;
    offCanvas.height = FRAME_HEIGHT;
    const ctx = offCanvas.getContext("2d");

    const frame = frames[selectedFrameIndex] ?? frames[0];
    const frameImage = await getFrameImage(frame.src);
    const selectedPhotos = Array.from(selectedIndexes);
    const frozenImages = await Promise.all(
        selectedPhotos.map((index) => loadImage(photos[index]))
    );

    const stream = offCanvas.captureStream(30);
    let mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm;codecs=vp8";
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
    }
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };

    const videoPromise = new Promise((resolve) => {
        mediaRecorder.onstop = () => {
            resolve(new Blob(chunks, { type: "video/webm" }));
        };
    });

    mediaRecorder.start();

    // Compose each slot by playing back the recorded webcam clip
    for (let i = 0; i < selectedPhotos.length; i++) {
        const photoIndex = selectedPhotos[i];
        const clipBlob = captureClips[photoIndex];
        const slot = slots[i];

        // Create a video element to play back the saved clip
        const clipVideo = document.createElement("video");
        clipVideo.muted = true;
        clipVideo.playsInline = true;
        clipVideo.src = URL.createObjectURL(clipBlob);
        await new Promise((resolve) => { clipVideo.onloadeddata = resolve; });
        clipVideo.play();

        // Draw the clip into the strip canvas at ~30fps until it ends
        await new Promise((resolve) => {
            const drawFrame = () => {
                if (clipVideo.ended || clipVideo.paused) {
                    resolve();
                    return;
                }

                ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
                ctx.drawImage(frameImage, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);

                // Draw previously frozen slots
                for (let j = 0; j < i; j++) {
                    const s = slots[j];
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(s.x, s.y, s.w, s.h);
                    ctx.clip();
                    drawImageCover(ctx, frozenImages[j], s.x, s.y, s.w, s.h);
                    ctx.restore();
                }

                // Draw current clip in the current slot
                ctx.save();
                ctx.beginPath();
                ctx.rect(slot.x, slot.y, slot.w, slot.h);
                ctx.clip();
                drawImageCover(ctx, clipVideo, slot.x, slot.y, slot.w, slot.h);
                ctx.restore();

                requestAnimationFrame(drawFrame);
            };
            requestAnimationFrame(drawFrame);
        });

        URL.revokeObjectURL(clipVideo.src);

        // Flash effect
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
        await wait(100);

        // Freeze: draw the final photo in this slot
        ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        ctx.drawImage(frameImage, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        for (let j = 0; j <= i; j++) {
            const s = slots[j];
            ctx.save();
            ctx.beginPath();
            ctx.rect(s.x, s.y, s.w, s.h);
            ctx.clip();
            drawImageCover(ctx, frozenImages[j], s.x, s.y, s.w, s.h);
            ctx.restore();
        }
        await wait(500);
    }

    // Hold the completed strip
    await wait(800);
    mediaRecorder.stop();

    // Free memory
    captureClips = [];

    return await videoPromise;
};

const blobToDataUrl = (blob) =>
    new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });

const exportStrip = async () => {
    await renderPreview();

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = FRAME_WIDTH * 2;
    exportCanvas.height = FRAME_HEIGHT;
    const ctx = exportCanvas.getContext("2d");

    ctx.drawImage(previewCanvas, 0, 0);
    ctx.drawImage(previewCanvas, FRAME_WIDTH, 0);

    const dataUrl = exportCanvas.toDataURL("image/png");
    const singleStripDataUrl = previewCanvas.toDataURL("image/png");

    downloadLink.href = dataUrl;
    downloadLink.setAttribute("download", "photobooth-strip.png");

    // Show done screen immediately with video loading state
    qrVideoImage.style.display = "none";
    if (qrVideoLoading) qrVideoLoading.style.display = "";
    showScreen("done");

    // Upload photo strip
    try {
        const response = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl: singleStripDataUrl })
        });
        const result = await response.json();
        if (result.downloadUrl) {
            downloadLink.href = result.downloadUrl;
            downloadLink.setAttribute("download", "photobooth-strip.png");
            qrImage.src = result.qrDataUrl;
        }
    } catch (error) {
        qrImage.alt = "QR generation failed";
    }

    // Upload 4x6 double-strip for admin printing
    try {
        await fetch("/api/upload-print", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl })
        });
    } catch (error) {
        console.error("Print upload failed:", error);
    }

    // Compose and upload video in background
    try {
        const videoBlob = await recordIterationVideo();
        const videoDataUrl = await blobToDataUrl(videoBlob);
        const response = await fetch("/api/upload-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl: videoDataUrl })
        });
        const result = await response.json();
        if (result.qrDataUrl) {
            qrVideoImage.src = result.qrDataUrl;
            qrVideoImage.style.display = "";
            if (qrVideoLoading) qrVideoLoading.style.display = "none";
        }
    } catch (error) {
        console.error("Video error:", error);
        if (qrVideoLoading) qrVideoLoading.textContent = "Video unavailable";
    }
};

startBtn.addEventListener("click", startCaptureFlow);
previewBtn.addEventListener("click", async () => {
    await buildFrameGrid();
    await renderPreview();
    showScreen("preview");
});
backBtn.addEventListener("click", () => showScreen("select"));
exportBtn.addEventListener("click", exportStrip);
restartBtn.addEventListener("click", () => showScreen("start"));
retakeBtn.addEventListener("click", startCaptureFlow);
