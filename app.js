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

  // Reset for next capture (auto-advance workflow)
  detectedEl.textContent = "—";
  manualValue.value = "0";
  lastCaptureReady = false;
  scanBtn.disabled = true;
  addBtn.disabled = true;
  minusBtn.disabled = true;
  plusBtn.disabled = true;
  captureBtn.disabled = false; // Re-enable capture for next hand

  setStatus(`Added ${v} to Team ${team}. Ready for next hand — tap Capture.`);
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

// --- Helper: Find domino tile rectangles ---
function findTileRects(gray) {
  // Tiles are bright vs wood background → threshold without inversion
  const blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);

  const tileBin = new cv.Mat();
  cv.threshold(blur, tileBin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

  // Close to solidify tile regions
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
  const closed = new cv.Mat();
  cv.morphologyEx(tileBin, closed, cv.MORPH_CLOSE, k);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const imgArea = gray.cols * gray.rows;
  const candidates = [];

  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area < imgArea * 0.01) continue; // ignore small blobs

    const r = cv.boundingRect(c);
    const aspect = r.width / r.height;
    // Domino tile aspect: allow both orientations
    const okAspect = (aspect > 0.30 && aspect < 0.80) || (aspect > 1.25 && aspect < 3.2);
    if (!okAspect) continue;

    candidates.push({ r, area });
  }

  // pick the 2 largest rectangles
  candidates.sort((a, b) => b.area - a.area);
  const top = candidates.slice(0, 2).map(x => x.r);

  blur.delete(); tileBin.delete(); closed.delete();
  contours.delete(); hierarchy.delete(); k.delete();

  return top;
}

// --- Helper: Add padding to tile rectangles (prevents edge pips being cut) ---
function padRect(r, pad, maxW, maxH) {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  const w = Math.min(maxW - x, r.width + pad * 2);
  const h = Math.min(maxH - y, r.height + pad * 2);
  return new cv.Rect(x, y, w, h);
}

// --- Helper: Blob-based pip detection (more reliable than circularity) ---
function countPipsBlobDetector(roiGray) {
  const blur = new cv.Mat();
  cv.GaussianBlur(roiGray, blur, new cv.Size(5, 5), 0);

  const bin = new cv.Mat();
  cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  const closed = new cv.Mat();
  cv.morphologyEx(bin, closed, cv.MORPH_CLOSE, k);

  const params = new cv.SimpleBlobDetector_Params();
  const roiArea = roiGray.cols * roiGray.rows;

  params.filterByArea = true;
  params.minArea = Math.max(18, roiArea * 0.00010);
  params.maxArea = roiArea * 0.02;

  params.filterByCircularity = true;
  params.minCircularity = 0.15;

  params.filterByInertia = true;
  params.minInertiaRatio = 0.05;

  params.filterByConvexity = true;
  params.minConvexity = 0.25;

  const detector = new cv.SimpleBlobDetector(params);
  const keypoints = new cv.KeyPointVector();
  detector.detect(closed, keypoints);

  const pipRects = [];
  for (let i = 0; i < keypoints.size(); i++) {
    const kp = keypoints.get(i);
    const rad = Math.max(6, Math.round(kp.size / 2));
    pipRects.push({
      x: Math.round(kp.pt.x - rad),
      y: Math.round(kp.pt.y - rad),
      width: rad * 2,
      height: rad * 2
    });
  }

  const count = keypoints.size();

  // Cleanup
  blur.delete(); bin.delete(); closed.delete(); k.delete();
  keypoints.delete(); detector.delete();

  return { count, pipRects };
}

// --- Pip detection (tile-first approach) ---
function detectPipsOpenCV() {
  const src = cv.imread(capCanvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const tileRects = findTileRects(gray);

  let totalPips = 0;
  const allPipRects = [];
  const tileDebugRects = [];

  for (const tr0 of tileRects) {
    const tr = padRect(tr0, 8, gray.cols, gray.rows); // 8px pad
    tileDebugRects.push(tr);

    // Crop ROI
    const roiGray = gray.roi(tr);

    // Use blob detector for more tolerant pip detection
    const { count, pipRects } = countPipsBlobDetector(roiGray);
    totalPips += count;

    // Convert ROI rects → full image coords
    for (const r of pipRects) {
      allPipRects.push({
        x: r.x + tr.x,
        y: r.y + tr.y,
        width: r.width,
        height: r.height
      });
    }

    roiGray.delete();
  }

  // Debug: show full-frame threshold (helps tune)
  procCanvas.width = capCanvas.width;
  procCanvas.height = capCanvas.height;

  const dbgBlur = new cv.Mat();
  cv.GaussianBlur(gray, dbgBlur, new cv.Size(5, 5), 0);
  const dbgBin = new cv.Mat();
  cv.threshold(dbgBlur, dbgBin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
  const dbgK = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  const dbgClosed = new cv.Mat();
  cv.morphologyEx(dbgBin, dbgClosed, cv.MORPH_CLOSE, dbgK);

  cv.imshow(procCanvas, dbgClosed);

  dbgBlur.delete(); dbgBin.delete(); dbgClosed.delete(); dbgK.delete();

  // Draw rectangles over video overlay (scaled)
  drawOverlay(tileDebugRects, allPipRects, src.cols, src.rows);

  // Cleanup
  src.delete(); gray.delete();

  return { count: totalPips };
}

function drawOverlay(tileRects, pipRects, srcW, srcH) {
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // Map capture coords → overlay coords
  const sx = overlay.width / srcW;
  const sy = overlay.height / srcH;

  // draw tiles (white outlines)
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 2 * devicePixelRatio;
  for (const r of tileRects) {
    ctx.strokeRect(r.x * sx, r.y * sy, r.width * sx, r.height * sy);
  }

  // draw pips (blue outlines)
  ctx.strokeStyle = "rgba(31,111,235,.95)";
  ctx.lineWidth = 2 * devicePixelRatio;
  for (const r of pipRects) {
    ctx.strokeRect(r.x * sx, r.y * sy, r.width * sx, r.height * sy);
  }

  // label
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(10 * devicePixelRatio, 10 * devicePixelRatio, 160 * devicePixelRatio, 30 * devicePixelRatio);
  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.font = `${14 * devicePixelRatio}px system-ui`;
  ctx.fillText(`Pips: ${manualValue.value || 0}`, 18 * devicePixelRatio, 31 * devicePixelRatio);
}

// Init
loadScores();
setStatus("OpenCV loading… Tap Start Camera when ready.");
