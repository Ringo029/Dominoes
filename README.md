# Domino Score Cam

A simple MVP web app for counting domino tile pips (dots) using your phone camera and OpenCV.js in the browser.

## Features

- 📷 Opens phone camera (prefers back camera)
- 📸 Captures a frame from the video stream
- 🔍 Uses OpenCV.js to count pips (dots) in the captured image
- ➕ Add detected count to Team A or Team B
- 💾 Persistent score tracking (localStorage)
- 🔄 Reset scores

## How to Use

1. **Start Camera** - Tap to request camera permissions
2. **Position Tiles** - Lay domino tiles pips-up on a plain background
3. **Capture** - Tap to capture the current frame
4. **Scan Pips** - Tap to detect and count pips using OpenCV.js
5. **Adjust** - Use +/- buttons or type manually if needed
6. **Add Score** - Select Team A or B, then tap Add Score

## Tips for Better Detection

- Lay tiles on a plain, matte surface (white/gray works great)
- Ensure pips are facing up and not glossy from glare
- Fill most of the frame with the tiles, keep the camera steady
- Good lighting helps significantly
- If detection is off, use +/- or type the value manually

## Deployment to GitHub Pages

1. Push this repo to GitHub
2. Go to Settings → Pages
3. Select your branch (usually `main` or `master`)
4. Select `/ (root)` as the source
5. Save - your app will be live at `https://yourusername.github.io/Dominoes/`

**Note:** GitHub Pages serves over HTTPS, which is required for camera access.

## Security & Privacy

✅ **Security measures in place:**
- No API keys or secrets in the code
- All processing happens client-side (no data sent to servers)
- Camera access requires user permission (browser security)
- Scores stored only in browser localStorage (local to your device)
- No hardcoded user paths or personal information
- `.gitignore` configured to exclude sensitive files

**Before publishing:**
- Review `.gitignore` to ensure training data/images aren't committed
- The `data/` folder is excluded by default (large image files)
- Model files (`.h5`) are included but can be excluded if too large

## Technical Details

- **OpenCV.js**: Used for image processing and pip detection via contour filtering
- **Camera API**: `getUserMedia` for video stream access
- **Storage**: `localStorage` for persistent score tracking
- **No backend required**: Everything runs in the browser

## Future Enhancements

- **Hand Mode**: Scan → show detected score → Confirm → auto-advance
- **Improved Accuracy**: 
  - Detect domino tile rectangles first, then count pips inside each tile region
  - Add "lighting" toggle (threshold presets)
- **Game Rules**: Add "rounds to 200" rules + winner banner (classic PR domino vibe)
- **TensorFlow.js Integration**: Optionally integrate the `dot_counter.h5` model for tile-by-tile classification

## Model Integration Note

The `dot_counter.h5` model in `models/app/backend/models/` is a TensorFlow/Keras classification model trained to classify individual domino tiles (0-12 pips). To use it in the browser:

1. Convert the `.h5` model to TensorFlow.js format using `tensorflowjs_converter`
2. Load the model in the browser using TensorFlow.js
3. Detect individual tiles first, then classify each tile
4. Sum the pips from all detected tiles

The current OpenCV.js approach works well for the MVP and doesn't require model conversion or additional dependencies.

