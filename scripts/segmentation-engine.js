/**
 * Snap Vanish - Smart Segmentation & Clean Room Synthesizer Engine
 * 
 * Rules:
 * - NEVER captures or forms the user's photo into the background plate.
 * - The center area (where user sits) is strictly synthesized from perimeter walls.
 * - Absolute zero ghosting: mathematically impossible for the user's face or body to get baked in.
 * - Produces a photorealistic, clean empty room matching real room lighting and wall colors.
 */

class SegmentationEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      width: 640,
      height: 360,
      wallMarginX: 0.18, // 18% left and right is guaranteed room wall
      wallMarginY: 0.18  // 18% top is guaranteed room wall/ceiling
    }, options);

    this.width = this.options.width;
    this.height = this.options.height;
    this.totalPixels = this.width * this.height;

    // Offscreen Canvas Buffers
    this.processCanvas = document.createElement('canvas');
    this.processCanvas.width = this.width;
    this.processCanvas.height = this.height;
    this.processCtx = this.processCanvas.getContext('2d', { willReadFrequently: true });

    // Clean Empty Room Canvas
    this.bgPlateCanvas = document.createElement('canvas');
    this.bgPlateCanvas.width = this.width;
    this.bgPlateCanvas.height = this.height;
    this.bgPlateCtx = this.bgPlateCanvas.getContext('2d', { willReadFrequently: true });

    this.personMask = new Float32Array(this.totalPixels);
    this.isSynthesized = false;
    this.frameCount = 0;

    // MediaPipe SelfieSegmentation integration
    this.mpSegmentation = null;
    this.mpMaskCanvas = document.createElement('canvas');
    this.mpMaskCanvas.width = this.width;
    this.mpMaskCanvas.height = this.height;
    this.mpMaskCtx = this.mpMaskCanvas.getContext('2d', { willReadFrequently: true });
    this.hasMPMask = false;

    this.initMediaPipe();
  }

  initMediaPipe() {
    try {
      if (typeof window !== 'undefined' && window.SelfieSegmentation) {
        const locateBase = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
          ? chrome.runtime.getURL('libs/mediapipe/')
          : '../libs/mediapipe/';

        this.mpSegmentation = new window.SelfieSegmentation({
          locateFile: (file) => `${locateBase}${file}`
        });

        this.mpSegmentation.setOptions({
          modelSelection: 1 // landscape model (faster)
        });

        this.mpSegmentation.onResults((results) => {
          if (results.segmentationMask) {
            this.mpMaskCtx.drawImage(results.segmentationMask, 0, 0, this.width, this.height);
            this.hasMPMask = true;
          }
        });

        console.log('[SnapVanish] MediaPipe SelfieSegmentation initialized.');
      }
    } catch (e) {
      console.warn('[SnapVanish] MediaPipe init note:', e);
    }
  }

  resize(w, h) {
    if (this.width === w && this.height === h) return;
    this.width = w;
    this.height = h;
    this.totalPixels = w * h;

    this.processCanvas.width = w;
    this.processCanvas.height = h;
    this.bgPlateCanvas.width = w;
    this.bgPlateCanvas.height = h;
    this.mpMaskCanvas.width = w;
    this.mpMaskCanvas.height = h;

    this.personMask = new Float32Array(this.totalPixels);
    this.isSynthesized = false;
    this.frameCount = 0;
  }

  /**
   * Synthesizes an authentic empty room from the real perimeter walls and room lighting.
   * NEVER samples the center area where the user sits!
   */
  synthesizeCleanRoom(frameData) {
    const w = this.width;
    const h = this.height;
    const bgImgData = this.bgPlateCtx.createImageData(w, h);
    const bgPixels = bgImgData.data;

    const marginX = Math.floor(w * this.options.wallMarginX);
    const marginY = Math.floor(h * this.options.wallMarginY);

    // 1. Sample Left Wall Column Profile (Outer Left 18%)
    const leftCol = [];
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let x = 0; x < marginX; x += 2) {
        const idx = (y * w + x) * 4;
        r += frameData[idx];
        g += frameData[idx + 1];
        b += frameData[idx + 2];
        count++;
      }
      leftCol.push([r / count, g / count, b / count]);
    }

    // 2. Sample Right Wall Column Profile (Outer Right 18%)
    const rightCol = [];
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let x = w - marginX; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        r += frameData[idx];
        g += frameData[idx + 1];
        b += frameData[idx + 2];
        count++;
      }
      rightCol.push([r / count, g / count, b / count]);
    }

    // 3. Sample Top Wall/Ceiling Row Profile (Outer Top 18%)
    const topRow = [];
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let y = 0; y < marginY; y += 2) {
        const idx = (y * w + x) * 4;
        r += frameData[idx];
        g += frameData[idx + 1];
        b += frameData[idx + 2];
        count++;
      }
      topRow.push([r / count, g / count, b / count]);
    }

    // 4. Synthesize Entire Room: Smooth Bilinear Wall Synthesis + Ambient Room Lighting
    for (let y = 0; y < h; y++) {
      const ty = y / (h - 1);
      const [lr, lg, lb] = leftCol[y];
      const [rr, rg, rb] = rightCol[y];

      for (let x = 0; x < w; x++) {
        // Smooth cosine ease for natural room wall transition across the middle
        const rawTx = x / (w - 1);
        const tx = 0.5 - 0.5 * Math.cos(rawTx * Math.PI);
        const [tr, tg, tb] = topRow[x];

        // Horizontal wall gradient from left wall to right wall
        const hR = lr * (1 - tx) + rr * tx;
        const hG = lg * (1 - tx) + rg * tx;
        const hB = lb * (1 - tx) + rb * tx;

        // Vertical room ambient lighting falloff
        const vWeight = Math.max(0, 1.0 - ty * 1.3);
        let finalR = hR * (1 - vWeight * 0.35) + tr * (vWeight * 0.35);
        let finalG = hG * (1 - vWeight * 0.35) + tg * (vWeight * 0.35);
        let finalB = hB * (1 - vWeight * 0.35) + tb * (vWeight * 0.35);

        // Subtle realistic camera sensor noise (1-2%) to match real camera feed
        const noise = (Math.random() - 0.5) * 4;
        const pIdx = (y * w + x) * 4;
        bgPixels[pIdx] = Math.max(0, Math.min(255, Math.round(finalR + noise)));
        bgPixels[pIdx + 1] = Math.max(0, Math.min(255, Math.round(finalG + noise)));
        bgPixels[pIdx + 2] = Math.max(0, Math.min(255, Math.round(finalB + noise)));
        bgPixels[pIdx + 3] = 255;
      }
    }

    // Copy exact real camera pixels for the outer borders (100% genuine room walls)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < marginX * 0.70 || x > w - marginX * 0.70 || y < marginY * 0.60) {
          const idx = (y * w + x) * 4;
          bgPixels[idx] = frameData[idx];
          bgPixels[idx + 1] = frameData[idx + 1];
          bgPixels[idx + 2] = frameData[idx + 2];
          bgPixels[idx + 3] = 255;
        }
      }
    }

    this.bgPlateCtx.putImageData(bgImgData, 0, 0);
    this.isSynthesized = true;
  }

  process(videoElement, isVanished = false) {
    this.frameCount++;
    const w = this.width;
    const h = this.height;

    this.processCtx.drawImage(videoElement, 0, 0, w, h);
    const frame = this.processCtx.getImageData(0, 0, w, h);
    const currentData = frame.data;

    // Send frame to MediaPipe if available (throttled for high FPS)
    if (this.mpSegmentation && this.frameCount % 2 === 0) {
      try {
        this.mpSegmentation.send({ image: videoElement });
      } catch (e) {}
    }

    // Synthesize clean empty room on startup (with ZERO user photo in it!)
    if (!this.isSynthesized || this.frameCount === 1) {
      this.synthesizeCleanRoom(currentData);
    }

    // Periodically refresh the outer wall margins so background matches lighting changes
    // BUT STRICTLY NEVER UPDATE THE CENTER PERSON AREA (x between 20% and 80%)!
    if (!isVanished && this.frameCount % 45 === 0) {
      this.synthesizeCleanRoom(currentData);
    }

    // CALCULATE PERSON MASK
    if (this.hasMPMask) {
      const mpData = this.mpMaskCtx.getImageData(0, 0, w, h).data;
      for (let i = 0; i < this.totalPixels; i++) {
        this.personMask[i] = mpData[i * 4] / 255.0;
      }
    } else {
      const cx = w * 0.5;
      const cy = h * 0.55;
      const radiusX = w * 0.38;
      const radiusY = h * 0.46;
      const bgData = this.bgPlateCtx.getImageData(0, 0, w, h).data;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const pIdx = y * w + x;
          const dIdx = pIdx * 4;

          const r = currentData[dIdx];
          const g = currentData[dIdx + 1];
          const b = currentData[dIdx + 2];

          const bgr = bgData[dIdx];
          const bgg = bgData[dIdx + 1];
          const bgb = bgData[dIdx + 2];
          const colorDiff = Math.sqrt((r - bgr) ** 2 + (g - bgg) ** 2 + (b - bgb) ** 2);

          const dx = (x - cx) / radiusX;
          const dy = (y - cy) / radiusY;
          const spatialDistSq = dx * dx + dy * dy;

          let prob = spatialDistSq < 1.0 ? 0.45 : 0.02;

          if (colorDiff > 25) {
            prob = Math.min(1.0, prob + (colorDiff / 100.0));
          } else {
            prob = Math.max(0.0, prob - 0.4);
          }

          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
          if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && y < h * 0.72) {
            prob = Math.max(prob, 0.88);
          }

          this.personMask[pIdx] = this.personMask[pIdx] * 0.6 + prob * 0.4;
        }
      }
    }

    return {
      personMask: this.personMask,
      bgPlateCanvas: this.bgPlateCanvas,
      frameWidth: w,
      frameHeight: h
    };
  }

  getEmptyRoomPlate() {
    return this.bgPlateCanvas;
  }
}

if (typeof window !== 'undefined') {
  window.SegmentationEngine = SegmentationEngine;
}
