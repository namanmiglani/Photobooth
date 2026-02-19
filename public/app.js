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

let photos = [];
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
  selectedIndexes = new Set();
  selectedFrameIndex = 0;
  progressEl.textContent = "0 / 6";
  showScreen("capture");

  try {
    await startCamera();
    for (let i = 0; i < 6; i += 1) {
      await runCountdown(2);
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
  const imgRatio = img.width / img.height;
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

const exportStrip = async () => {
  await renderPreview();

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = FRAME_WIDTH * 2;
  exportCanvas.height = FRAME_HEIGHT;
  const ctx = exportCanvas.getContext("2d");

  ctx.drawImage(previewCanvas, 0, 0);
  ctx.drawImage(previewCanvas, FRAME_WIDTH, 0);

  const dataUrl = exportCanvas.toDataURL("image/png");

  downloadLink.href = dataUrl;
  downloadLink.setAttribute("download", "photobooth-strip.png");

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl })
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

  showScreen("done");
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
