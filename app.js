/* Domino Score Cam (MVP)
   - Uses getUserMedia for camera
   - Captures a frame
   - Counts pips using OpenCV.js contour filtering (simple heuristic)
   - Lets you add result to Team A or B
   
   Future: Can integrate TensorFlow.js model (dot_counter.h5) for tile-by-tile
   classification if needed. Current OpenCV approach works well for MVP.
*/

const $ = (id) => document.getElementById(id);

const video = $("video");
const overlay = $("overlay");
const capCanvas = $("capture");
const procCanvas = $("processed");

const startCamBtn = $("startCamBtn");
const captureBtn = $("captureBtn");
const scanBtn = $("scanBtn");

const minusBtn = $("minusBtn");
const plusBtn = $("plusBtn");
const addBtn = $("addBtn");
const resetBtn = $("resetBtn");

const detectedEl = $("detected");
const statusEl = $("status");
const manualValue = $("manualValue");

const scoreAEl = $("scoreA");
const scoreBEl = $("scoreB");

let stream = null;
let lastCaptureReady = false;
let opencvReady = false;

function setStatus(msg) { statusEl.textContent = msg; }

function getSelectedTeam() {
  const checked = document.querySelector('input[name="team"]:checked');
  return checked ? checked.value : "A";
}

function loadScores() {
  const a = Number(localStorage.getItem("scoreA") || "0");
  const b = Number(localStorage.getItem("scoreB") || "0");
  scoreAEl.textContent = a;
  scoreBEl.textContent = b;
}
function saveScores(a, b) {
  localStorage.setItem("scoreA", String(a));
  localStorage.setItem("scoreB", String(b));
}

function resizeOverlay() {
  // Match overlay canvas to video displayed size
  const rect = video.getBoundingClientRect();
  overlay.width = Math.round(rect.width * devicePixelRatio);
  overlay.height = Math.round(rect.height * devicePixelRatio);
}

window.addEventListener("resize", resizeOverlay);

startCamBtn.addEventListener("click", async () => {
  try {
    setStatus("Requesting camera…");
    // Prefer back camera on mobile
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();

    captureBtn.disabled = false;
    setStatus("Camera on. Position tiles and tap Capture.");
    setTimeout(resizeOverlay, 300);
  } catch (e) {
    console.error(e);
    setStatus("Camera failed. Make sure you allow camera permissions and use HTTPS (GitHub Pages is HTTPS).");
  }
});

captureBtn.addEventListener("click", () => {
  if (!stream) return;

  // Capture at a reasonable processing size for speed
  const targetW = 900;
  const aspect = video.videoHeight / video.videoWidth;
  const w = Math.min(targetW, video.videoWidth || targetW);
  const h = Math.round(w * aspect);

  capCanvas.width = w;
  capCanvas.height = h;
  const ctx = capCanvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);

  // Clear overlay
  const octx = overlay.getContext("2d");
  octx.clearRect(0, 0, overlay.width, overlay.height);

  lastCaptureReady = true;
  scanBtn.disabled = !opencvReady;
  setStatus(opencvReady ? "Captured. Tap Scan Pips." : "Captured. Waiting for OpenCV to load…");
});

scanBtn.addEventListener("click", () => {
  if (!lastCaptureReady) return;
  if (!opencvReady) {
    setStatus("OpenCV not ready yet…");
    return;
  }
  const result = detectPipsOpenCV();
  detectedEl.textContent = String(result.count);
  manualValue.value = String(result.count);

  minusBtn.disabled = false;
  plusBtn.disabled = false;
  addBtn.disabled = false;

  setStatus(`Scan complete. Found ${result.count} pips. Adjust if needed, then Add Score.`);
});

minusBtn.addEventListener("click", () => {
  manualValue.value = String(Math.max(0, Number(manualValue.value || "0") - 1));
});
plusBtn.addEventListener("click", () => {
  manualValue.value = String(Number(manualValue.value || "0") + 1);
});

addBtn.addEventListener("click", () => {
  const v = Number(manualValue.value || "0");
  if (v < 0) {
    setStatus("Cannot add negative score. Use +/- to adjust.");
    return;
  }
  const team = getSelectedTeam();

  let a = Number(scoreAEl.textContent || "0");
  let b = Number(scoreBEl.textContent || "0");

  if (team === "A") a += v;
  else b += v;

  scoreAEl.textContent = a;
  scoreBEl.textContent = b;
  saveScores(a, b);

  // Reset for next capture
  detectedEl.textContent = "—";
  manualValue.value = "0";
  lastCaptureReady = false;
  scanBtn.disabled = true;
  addBtn.disabled = true;
  minusBtn.disabled = true;
  plusBtn.disabled = true;

  setStatus(`Added ${v} to Team ${team}. Capture again for next hand.`);
});

resetBtn.addEventListener("click", () => {
  scoreAEl.textContent = "0";
  scoreBEl.textContent = "0";
  saveScores(0, 0);

  detectedEl.textContent = "—";
  manualValue.value = "0";
  addBtn.disabled = true;
  minusBtn.disabled = true;
  plusBtn.disabled = true;

  setStatus("Scores reset.");
});

// --- OpenCV init hook ---
function waitForOpenCV() {
  let attempts = 0;
  const maxAttempts = 200; // ~30 seconds max wait
  const check = () => {
    if (window.cv && window.cv.Mat) {
      opencvReady = true;
      setStatus(stream ? "OpenCV ready. Capture and Scan." : "OpenCV ready. Start Camera to begin.");
      scanBtn.disabled = !lastCaptureReady;
      return;
    }
    attempts++;
    if (attempts >= maxAttempts) {
      setStatus("OpenCV failed to load. Check your connection or try refreshing.");
      return;
    }
    setTimeout(check, 150);
  };
  check();
}
waitForOpenCV();

// --- Pip detection (heuristic) ---
function detectPipsOpenCV() {
  // Read capture canvas into OpenCV Mat
  const src = cv.imread(capCanvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // Reduce noise, then threshold
  const blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

  const bin = new cv.Mat();
  // Adaptive works well across lighting changes
  cv.adaptiveThreshold(
    blur, bin,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    31,
    7
  );

  // Morphological opening to remove specks, then close to solidify pips
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  const opened = new cv.Mat();
  cv.morphologyEx(bin, opened, cv.MORPH_OPEN, kernel);

  const closed = new cv.Mat();
  cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, kernel);

  // Find contours
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // Filter contours that look like pip circles
  const pipRects = [];
  let pipCount = 0;

  const imgArea = src.cols * src.rows;
  const minArea = Math.max(20, imgArea * 0.00001);    // scale with image size
  const maxArea = imgArea * 0.002;                    // avoid big blobs

  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area < minArea || area > maxArea) continue;

    const perimeter = cv.arcLength(c, true);
    if (perimeter <= 0) continue;
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter);

    // pips should be fairly circular
    if (circularity < 0.55) continue;

    const r = cv.boundingRect(c);
    const aspect = r.width / r.height;
    if (aspect < 0.6 || aspect > 1.6) continue;

    pipCount++;
    pipRects.push(r);
  }

  // Draw debug overlays on processed canvas
  procCanvas.width = capCanvas.width;
  procCanvas.height = capCanvas.height;
  cv.imshow(procCanvas, closed);

  // Draw rectangles over video overlay (scaled)
  drawOverlayRects(pipRects, src.cols, src.rows);

  // Cleanup
  src.delete(); gray.delete(); blur.delete(); bin.delete();
  opened.delete(); closed.delete();
  contours.delete(); hierarchy.delete();
  kernel.delete();

  return { count: pipCount };
}

function drawOverlayRects(rects, srcW, srcH) {
  // Overlay canvas is sized to displayed video, not capture canvas.
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // Simple label
  ctx.font = `${14 * devicePixelRatio}px ui-sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText("Detected pips", 12 * devicePixelRatio, 22 * devicePixelRatio);

  // Draw count badge
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(12 * devicePixelRatio, 28 * devicePixelRatio, 170 * devicePixelRatio, 28 * devicePixelRatio);
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillText(`Pips: ${manualValue.value || 0}`, 20 * devicePixelRatio, 48 * devicePixelRatio);
  
  // Optional: Draw detected pip locations (scaled to video view)
  if (rects.length > 0 && video.videoWidth > 0) {
    const scaleX = overlay.width / srcW;
    const scaleY = overlay.height / srcH;
    ctx.strokeStyle = "rgba(31,111,235,.6)";
    ctx.lineWidth = 1.5 * devicePixelRatio;
    rects.forEach(r => {
      ctx.strokeRect(r.x * scaleX, r.y * scaleY, r.width * scaleX, r.height * scaleY);
    });
  }
}

// Init
loadScores();
setStatus("OpenCV loading… Tap Start Camera when ready.");
