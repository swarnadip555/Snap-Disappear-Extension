/**
 * Snap Vanish - Core Injected Script (Main World)
 * Runs at document_start in world: "MAIN"
 * 
 * Capabilities:
 * - Monkey-patches navigator.mediaDevices.getUserMedia and legacy getUserMedia
 * - Feeds raw webcam video and mic into SnapVanish Pipeline
 * - Real-time hand tracking + acoustic transient click detection
 * - Automatic empty room synthesizer (NEVER captures user's photo into background)
 * - Translucent white ash bubble particle simulation with reverse flyback
 * - Automatic microphone muting and unmuting
 * - Synchronizes with extension popup and keyboard shortcuts via postMessage
 */

(function() {
  if (window.__SNAP_VANISH_INITIALIZED__) return;
  window.__SNAP_VANISH_INITIALIZED__ = true;

  console.log('[SnapVanish] Initializing Snap Vanish WebRTC pipeline hook...');

  // =========================================================================
  // 1. EMBEDDED ENGINES
  // =========================================================================

  // --- SNAP DETECTION ENGINE ---
  class SnapEngine {
    constructor(options = {}) {
      this.options = Object.assign({
        sensitivity: 'medium',
        requireAudioConfirmation: true,
        cooldownMs: 1400
      }, options);

      this.audioContext = null;
      this.analyser = null;
      this.freqData = null;
      this.timeData = null;
      this.lastAcousticSnapTime = 0;
      this.prevHighBandEnergy = 0;

      this.lastVisualSnapTime = 0;
      this.visualSnapConfidence = 0;
      this.handState = 'IDLE';
      this.pinchStartTime = 0;
      this.handHistory = [];
      this.lastTriggerTime = 0;

      this.onSnapDetected = null;
      this.applySensitivity(this.options.sensitivity);
    }

    applySensitivity(level) {
      this.options.sensitivity = level;
      if (level === 'high') {
        this.audioThreshold = 26;
        this.velocityThreshold = 1.3;
        this.coincidenceWindowMs = 280;
      } else if (level === 'low') {
        this.audioThreshold = 65;
        this.velocityThreshold = 2.4;
        this.coincidenceWindowMs = 180;
      } else {
        this.audioThreshold = 40;
        this.velocityThreshold = 1.8;
        this.coincidenceWindowMs = 230;
      }
    }

    attachAudioStream(audioStream) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(audioStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.05;
        source.connect(this.analyser);
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeData = new Uint8Array(this.analyser.fftSize);

        if (this.audioContext.state === 'suspended') {
          const resume = () => {
            this.audioContext.resume();
            window.removeEventListener('click', resume);
          };
          window.addEventListener('click', resume);
        }
      } catch (e) {
        console.warn('[SnapVanish] Audio attach warning:', e);
      }
    }

    processAudioFrame() {
      if (!this.analyser) return { snapDetected: false };
      this.analyser.getByteFrequencyData(this.freqData);
      this.analyser.getByteTimeDomainData(this.timeData);

      const binCount = this.analyser.frequencyBinCount;
      const sampleRate = (this.audioContext && this.audioContext.sampleRate) || 48000;
      const binHz = (sampleRate / 2) / binCount;

      const lowBin = Math.max(0, Math.floor(2200 / binHz));
      const highBin = Math.min(binCount - 1, Math.ceil(7000 / binHz));

      let highBandEnergy = 0;
      for (let i = lowBin; i <= highBin; i++) {
        highBandEnergy += this.freqData[i];
      }
      const avgHighBand = highBandEnergy / (highBin - lowBin + 1);

      let sumSquares = 0;
      let peakDev = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const dev = Math.abs(this.timeData[i] - 128);
        if (dev > peakDev) peakDev = dev;
        sumSquares += dev * dev;
      }
      const rms = Math.sqrt(sumSquares / this.timeData.length) || 1;
      const crestFactor = peakDev / rms;

      const energyFlux = avgHighBand - this.prevHighBandEnergy;
      this.prevHighBandEnergy = avgHighBand;

      const now = performance.now();
      let isAcousticSnap = false;

      if (energyFlux > this.audioThreshold && crestFactor > 4.0 && peakDev > 22) {
        this.lastAcousticSnapTime = now;
        isAcousticSnap = true;
      }

      return { snapDetected: isAcousticSnap, energyFlux, crestFactor, avgHighBand };
    }

    processVideoFrame(canvas) {
      const width = canvas.width;
      const height = canvas.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      const now = performance.now();

      const maxY = Math.floor(height * 0.78);
      const minY = Math.floor(height * 0.12);

      let skinPixelCount = 0;
      let sumX = 0, sumY = 0;
      let minX = width, maxX = 0;
      let boundingMinY = height, boundingMaxY = 0;

      const step = 2;
      for (let y = minY; y < maxY; y += step) {
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

          if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
            if (r > 60 && g > 40 && b > 20 && Math.abs(r - g) > 12) {
              skinPixelCount++;
              sumX += x;
              sumY += y;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < boundingMinY) boundingMinY = y;
              if (y > boundingMaxY) boundingMaxY = y;
            }
          }
        }
      }

      const minHandPixels = (width * height * 0.007) / (step * step);
      const maxHandPixels = (width * height * 0.30) / (step * step);

      let handDetected = false;
      let centroidX = 0, centroidY = 0;
      let handBoxWidth = 0, handBoxHeight = 0;

      if (skinPixelCount > minHandPixels && skinPixelCount < maxHandPixels) {
        handDetected = true;
        centroidX = sumX / skinPixelCount;
        centroidY = sumY / skinPixelCount;
        handBoxWidth = maxX - minX;
        handBoxHeight = boundingMaxY - boundingMinY;
      }

      this.handHistory.push({
        time: now,
        detected: handDetected,
        x: centroidX,
        y: centroidY,
        w: handBoxWidth,
        h: handBoxHeight,
        area: skinPixelCount
      });
      if (this.handHistory.length > 25) this.handHistory.shift();

      let isVisualSnap = false;

      if (handDetected && this.handHistory.length >= 6) {
        const recent = this.handHistory[this.handHistory.length - 1];
        const prev4 = this.handHistory[this.handHistory.length - 4];

        const aspectRatio = (recent.w / Math.max(1, recent.h));
        const isElevated = recent.y < height * 0.65;
        const isCompact = aspectRatio > 0.45 && aspectRatio < 1.40;
        const isStableHold = Math.abs(recent.y - prev4.y) < 7 && Math.abs(recent.x - prev4.x) < 9;

        if (isElevated && isCompact && isStableHold) {
          if (this.handState === 'IDLE' || this.handState === 'HAND_RAISED') {
            this.handState = 'PINCH_READY';
            this.pinchStartTime = now;
          }
        }

        const deltaY = recent.y - prev4.y;
        const deltaTime = (recent.time - prev4.time) / 1000.0;
        const velocityY = deltaTime > 0 ? (deltaY / (height * deltaTime)) : 0;
        const hadPinch = (now - this.pinchStartTime) < 550 && (now - this.pinchStartTime) > 85;

        if (hadPinch && velocityY > this.velocityThreshold) {
          this.lastVisualSnapTime = now;
          this.visualSnapConfidence = Math.min(1.0, velocityY / (this.velocityThreshold * 1.5));
          isVisualSnap = true;
          this.handState = 'SNAP_RELEASE';
        }
      } else {
        if (now - this.pinchStartTime > 600) {
          this.handState = 'IDLE';
        }
      }

      return { handDetected, handState: this.handState, isVisualSnap, centroidX, centroidY };
    }

    evaluateSnap(visualResult, audioResult) {
      const now = performance.now();
      if (now - this.lastTriggerTime < this.options.cooldownMs) {
        return { triggered: false };
      }

      let snapConfirmed = false;
      if (this.options.requireAudioConfirmation) {
        const timeDiff = Math.abs(this.lastVisualSnapTime - this.lastAcousticSnapTime);
        if (
          this.lastVisualSnapTime > 0 &&
          this.lastAcousticSnapTime > 0 &&
          timeDiff <= this.coincidenceWindowMs &&
          (now - Math.max(this.lastVisualSnapTime, this.lastAcousticSnapTime)) < 350
        ) {
          snapConfirmed = true;
        }
      } else {
        if (visualResult.isVisualSnap) snapConfirmed = true;
      }

      if (snapConfirmed) {
        this.lastTriggerTime = now;
        this.lastVisualSnapTime = 0;
        this.lastAcousticSnapTime = 0;
        this.handState = 'IDLE';
        if (typeof this.onSnapDetected === 'function') {
          this.onSnapDetected();
        }
        return { triggered: true };
      }
      return { triggered: false };
    }
  }

  // --- AUTOMATIC CLEAN ROOM SYNTHESIZER ---
  class SegmentationEngine {
    constructor(w = 640, h = 360) {
      this.width = w;
      this.height = h;
      this.totalPixels = w * h;

      this.processCanvas = document.createElement('canvas');
      this.processCanvas.width = w;
      this.processCanvas.height = h;
      this.processCtx = this.processCanvas.getContext('2d', { willReadFrequently: true });

      this.bgPlateCanvas = document.createElement('canvas');
      this.bgPlateCanvas.width = w;
      this.bgPlateCanvas.height = h;
      this.bgPlateCtx = this.bgPlateCanvas.getContext('2d', { willReadFrequently: true });

      this.personMask = new Float32Array(this.totalPixels);
      this.isSynthesized = false;
      this.frameCount = 0;
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
      this.personMask = new Float32Array(this.totalPixels);
      this.isSynthesized = false;
      this.frameCount = 0;
    }

    synthesizeCleanRoom(frameData) {
      const w = this.width;
      const h = this.height;
      const bgImgData = this.bgPlateCtx.createImageData(w, h);
      const bgPixels = bgImgData.data;

      const marginX = Math.floor(w * 0.18);
      const marginY = Math.floor(h * 0.18);

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

      for (let y = 0; y < h; y++) {
        const ty = y / (h - 1);
        const [lr, lg, lb] = leftCol[y];
        const [rr, rg, rb] = rightCol[y];

        for (let x = 0; x < w; x++) {
          const rawTx = x / (w - 1);
          const tx = 0.5 - 0.5 * Math.cos(rawTx * Math.PI);
          const [tr, tg, tb] = topRow[x];

          const hR = lr * (1 - tx) + rr * tx;
          const hG = lg * (1 - tx) + rg * tx;
          const hB = lb * (1 - tx) + rb * tx;

          const vWeight = Math.max(0, 1.0 - ty * 1.3);
          let finalR = hR * (1 - vWeight * 0.35) + tr * (vWeight * 0.35);
          let finalG = hG * (1 - vWeight * 0.35) + tg * (vWeight * 0.35);
          let finalB = hB * (1 - vWeight * 0.35) + tb * (vWeight * 0.35);

          const noise = (Math.random() - 0.5) * 4;
          const pIdx = (y * w + x) * 4;
          bgPixels[pIdx] = Math.max(0, Math.min(255, Math.round(finalR + noise)));
          bgPixels[pIdx + 1] = Math.max(0, Math.min(255, Math.round(finalG + noise)));
          bgPixels[pIdx + 2] = Math.max(0, Math.min(255, Math.round(finalB + noise)));
          bgPixels[pIdx + 3] = 255;
        }
      }

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

      if (!this.isSynthesized || this.frameCount === 1) {
        this.synthesizeCleanRoom(currentData);
      }

      if (!isVanished && this.frameCount % 45 === 0) {
        this.synthesizeCleanRoom(currentData);
      }

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

      return { personMask: this.personMask, bgPlateCanvas: this.bgPlateCanvas };
    }
  }

  // --- TRANSLUCENT WHITE ASH BUBBLE ENGINE ---
  class ThanosDustEngine {
    constructor(options = {}) {
      this.options = Object.assign({
        duration: 2.5,
        direction: 'disperse',
        enableEmbers: true,
        particleDensity: 2
      }, options);

      this.state = 'PRESENT';
      this.progress = 0;
      this.transitionStartTime = 0;
      this.transitionDuration = this.options.duration * 1000;
      this.particles = [];
    }

    setDuration(seconds) {
      this.options.duration = Math.max(0.5, Math.min(8.0, seconds));
      this.transitionDuration = this.options.duration * 1000;
    }

    setDirection(dir) {
      this.options.direction = dir;
    }

    snapVanish(videoElement, personMask, width, height, snapPoint = null) {
      if (this.state === 'DISINTEGRATING' || this.state === 'VANISHED') return;
      this.state = 'DISINTEGRATING';
      this.transitionStartTime = performance.now();
      this.progress = 0;
      this.initParticles(videoElement, personMask, width, height, snapPoint);
    }

    snapReturn() {
      if (this.state === 'PRESENT' || this.state === 'REINTEGRATING') return;
      this.state = 'REINTEGRATING';
      this.transitionStartTime = performance.now();
      this.progress = 1.0;
    }

    toggleSnap(videoElement, personMask, width, height, snapPoint = null) {
      if (this.state === 'PRESENT' || this.state === 'REINTEGRATING') {
        this.snapVanish(videoElement, personMask, width, height, snapPoint);
        return 'vanished';
      } else {
        this.snapReturn();
        return 'present';
      }
    }

    initParticles(videoElement, personMask, width, height, snapPoint) {
      this.particles = [];

      const step = this.options.particleDensity;
      const direction = this.options.direction;
      const originX = snapPoint ? snapPoint.x : width * 0.5;
      const originY = snapPoint ? snapPoint.y : height * 0.45;
      const maxRadius = Math.sqrt(width * width + height * height);

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const pIdx = y * width + x;
          const maskVal = personMask ? personMask[pIdx] : 1.0;

          if (maskVal > 0.32) {
            let threshold = 0;
            if (direction === 'right') {
              threshold = (x / width) * 0.75 + (Math.random() * 0.25);
            } else if (direction === 'left') {
              threshold = ((width - x) / width) * 0.75 + (Math.random() * 0.25);
            } else if (direction === 'upward') {
              threshold = ((height - y) / height) * 0.75 + (Math.random() * 0.25);
            } else {
              const dist = Math.sqrt((x - originX) ** 2 + (y - originY) ** 2);
              threshold = (dist / maxRadius) * 0.75 + (Math.random() * 0.25);
            }

            let baseVx = 0;
            let baseVy = -2.0 - Math.random() * 2.5;

            if (direction === 'right') {
              baseVx = 2.5 + Math.random() * 3.5;
              baseVy = -1.2 + (Math.random() - 0.5) * 1.8;
            } else if (direction === 'left') {
              baseVx = -(2.5 + Math.random() * 3.5);
              baseVy = -1.2 + (Math.random() - 0.5) * 1.8;
            } else if (direction === 'upward') {
              baseVx = (Math.random() - 0.5) * 2.5;
              baseVy = -(3.5 + Math.random() * 4.5);
            } else {
              const angle = Math.atan2(y - originY, x - originX) + (Math.random() - 0.5) * 0.7;
              const speed = 2.0 + Math.random() * 3.5;
              baseVx = Math.cos(angle) * speed;
              baseVy = Math.sin(angle) * speed - 1.8;
            }

            const bubbleRadius = 0.7 + Math.random() * 1.3;

            this.particles.push({
              origX: x,
              origY: y,
              currX: x,
              currY: y,
              maxDispersedX: x + baseVx * 46 + (Math.random() - 0.5) * 32,
              maxDispersedY: y + baseVy * 42 - Math.random() * 45,
              radius: bubbleRadius,
              threshold,
              seed: Math.random() * 100,
              wobbleSpeed: 4 + Math.random() * 4,
              alpha: 0.60
            });
          }
        }
      }
    }

    render(targetCtx, liveVideoElement, emptyRoomCanvas, width, height) {
      const now = performance.now();

      if (this.state === 'DISINTEGRATING') {
        const elapsed = now - this.transitionStartTime;
        this.progress = Math.min(1.0, elapsed / this.transitionDuration);
        if (this.progress >= 1.0) this.state = 'VANISHED';
      } else if (this.state === 'REINTEGRATING') {
        const elapsed = now - this.transitionStartTime;
        this.progress = Math.max(0.0, 1.0 - (elapsed / this.transitionDuration));
        if (this.progress <= 0.0) {
          this.state = 'PRESENT';
          this.particles = [];
        }
      }

      if (this.state === 'PRESENT') {
        targetCtx.drawImage(liveVideoElement, 0, 0, width, height);
        return;
      }

      if (this.state === 'VANISHED') {
        if (emptyRoomCanvas) {
          targetCtx.drawImage(emptyRoomCanvas, 0, 0, width, height);
        } else {
          targetCtx.fillStyle = '#100e18';
          targetCtx.fillRect(0, 0, width, height);
        }
        return;
      }

      // Draw clean empty room base
      if (emptyRoomCanvas) {
        targetCtx.drawImage(emptyRoomCanvas, 0, 0, width, height);
      } else {
        targetCtx.fillStyle = '#100e18';
        targetCtx.fillRect(0, 0, width, height);
      }

      // Live person dissolves cleanly away: ZERO frozen photo ghosting
      const dissolveProgress = this.progress;
      if (dissolveProgress < 0.96) {
        targetCtx.save();
        targetCtx.globalAlpha = Math.max(0, 1.0 - dissolveProgress * 1.12);
        targetCtx.drawImage(liveVideoElement, 0, 0, width, height);
        targetCtx.restore();
      }

      // Render Translucent White Ash Bubbles
      const timeSec = now * 0.001;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (dissolveProgress >= p.threshold) {
          const bubbleLife = Math.min(1.0, (dissolveProgress - p.threshold) / 0.55);
          const swirlX = Math.sin(p.seed + timeSec * 3 + p.origY * 0.02) * 10 * bubbleLife;
          const swirlY = Math.cos(p.seed + timeSec * 2.5 + p.origX * 0.02) * 6 * bubbleLife;
          const ease = 1 - Math.pow(1 - bubbleLife, 2);

          p.currX = p.origX + (p.maxDispersedX - p.origX) * ease + swirlX;
          p.currY = p.origY + (p.maxDispersedY - p.origY) * ease + swirlY;

          const wobble = 1.0 + Math.sin(p.seed + timeSec * p.wobbleSpeed) * 0.12;
          const curRadius = Math.max(0.5, p.radius * wobble);

          p.alpha = Math.max(0, (1.0 - bubbleLife * 0.95) * 0.55);

          if (p.alpha > 0.03) {
            // 1. Translucent inner bubble core
            targetCtx.beginPath();
            targetCtx.arc(p.currX, p.currY, curRadius, 0, Math.PI * 2);
            targetCtx.fillStyle = `rgba(240, 248, 255, ${p.alpha * 0.28})`;
            targetCtx.fill();

            // 2. Delicate outer membrane ring
            targetCtx.lineWidth = 0.55;
            targetCtx.strokeStyle = `rgba(255, 255, 255, ${p.alpha * 0.80})`;
            targetCtx.stroke();

            // 3. Specular sheen glint
            if (curRadius > 1.0) {
              targetCtx.beginPath();
              targetCtx.arc(p.currX - curRadius * 0.35, p.currY - curRadius * 0.35, curRadius * 0.28, 0, Math.PI * 2);
              targetCtx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.90})`;
              targetCtx.fill();
            }

            // 4. White Ash Sparkle
            if (this.options.enableEmbers && bubbleLife < 0.12) {
              targetCtx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.85})`;
              targetCtx.fillRect(p.currX - 0.6, p.currY - 0.6, 1.2, 1.2);
            }
          }
        }
      }
    }
  }

  // =========================================================================
  // 2. MASTER CONTROLLER & MEDIADEVICES INTERCEPTOR
  // =========================================================================

  class SnapVanishController {
    constructor() {
      this.enabled = true;
      this.settings = {
        sensitivity: 'medium',
        requireAudioConfirmation: true,
        dustDuration: 2.5,
        dustDirection: 'disperse',
        enableEmbers: true
      };

      this.snapEngine = new SnapEngine(this.settings);
      this.segmentationEngine = new SegmentationEngine(640, 360);
      this.dustEngine = new ThanosDustEngine({
        duration: this.settings.dustDuration,
        direction: this.settings.dustDirection,
        enableEmbers: this.settings.enableEmbers
      });

      this.isVanished = false;
      this.rawVideoStream = null;
      this.rawAudioStream = null;
      this.audioGainNode = null;
      this.audioContext = null;
      this.processedStream = null;

      this.videoElement = document.createElement('video');
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;

      this.outputCanvas = document.createElement('canvas');
      this.outputCanvas.width = 640;
      this.outputCanvas.height = 360;
      this.outputCtx = this.outputCanvas.getContext('2d');

      this.downscaleCanvas = document.createElement('canvas');
      this.downscaleCanvas.width = 160;
      this.downscaleCanvas.height = 90;
      this.downscaleCtx = this.downscaleCanvas.getContext('2d', { willReadFrequently: true });

      this.isRunning = false;

      this.snapEngine.onSnapDetected = () => {
        if (!this.enabled) return;
        this.toggleVanish();
      };

      this.initMessageBridge();
    }

    initMessageBridge() {
      window.addEventListener('message', (event) => {
        if (!event.data || event.data.source !== 'SNAP_VANISH_EXTENSION') return;

        const { type, payload } = event.data;
        if (type === 'TOGGLE_VANISH') {
          this.toggleVanish();
        } else if (type === 'UPDATE_SETTINGS') {
          this.updateSettings(payload);
        } else if (type === 'GET_STATE') {
          this.broadcastState();
        }
      });
    }

    broadcastState() {
      window.postMessage({
        source: 'SNAP_VANISH_PAGE',
        type: 'STATE_UPDATE',
        state: {
          enabled: this.enabled,
          isVanished: this.isVanished,
          dustState: this.dustEngine.state,
          settings: this.settings,
          isActiveCall: !!this.rawVideoStream
        }
      }, '*');
    }

    updateSettings(newSettings) {
      if (!newSettings) return;
      Object.assign(this.settings, newSettings);
      if (typeof newSettings.enabled !== 'undefined') {
        this.enabled = !!newSettings.enabled;
      }
      if (newSettings.sensitivity) {
        this.snapEngine.applySensitivity(newSettings.sensitivity);
      }
      if (typeof newSettings.requireAudioConfirmation !== 'undefined') {
        this.snapEngine.options.requireAudioConfirmation = !!newSettings.requireAudioConfirmation;
      }
      if (newSettings.dustDuration) {
        this.dustEngine.setDuration(parseFloat(newSettings.dustDuration));
      }
      if (newSettings.dustDirection) {
        this.dustEngine.setDirection(newSettings.dustDirection);
      }
      if (typeof newSettings.enableEmbers !== 'undefined') {
        this.dustEngine.setEmbersEnabled(newSettings.enableEmbers);
      }
      this.broadcastState();
    }

    toggleVanish() {
      if (!this.videoElement || this.videoElement.readyState < 2) return;

      const segResult = this.segmentationEngine.process(this.videoElement, this.isVanished);
      const newState = this.dustEngine.toggleSnap(
        this.videoElement,
        segResult.personMask,
        this.outputCanvas.width,
        this.outputCanvas.height
      );

      this.isVanished = (newState === 'vanished');

      if (this.audioGainNode && this.audioContext) {
        const targetGain = this.isVanished ? 0.0 : 1.0;
        this.audioGainNode.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.02);
      }

      this.showToast(this.isVanished ? '🫰 Snapped! Vanished & Mic Muted.' : '🫰 Snapped back! Welcome back.');
      this.broadcastState();
    }

    showToast(message) {
      try {
        let toast = document.getElementById('__snap_vanish_toast__');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = '__snap_vanish_toast__';
          toast.style.cssText = `
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(18, 14, 30, 0.95);
            color: #ffffff;
            padding: 10px 22px;
            border-radius: 24px;
            border: 1px solid rgba(220, 225, 240, 0.4);
            box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 16px rgba(255,255,255,0.2);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            z-index: 2147483647;
            pointer-events: none;
            transition: opacity 0.3s ease, transform 0.3s ease;
          `;
          document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(toast.__timer);
        toast.__timer = setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(-50%) translateY(-10px)';
        }, 2600);
      } catch (e) {}
    }

    initPipeline(rawStream, constraints) {
      this.rawVideoStream = rawStream;
      const videoTrack = rawStream.getVideoTracks()[0];
      const audioTrack = rawStream.getAudioTracks()[0];

      if (!videoTrack) return rawStream;

      const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
      const width = settings.width || 640;
      const height = settings.height || 360;

      this.outputCanvas.width = width;
      this.outputCanvas.height = height;
      this.segmentationEngine.resize(width, height);

      this.videoElement.srcObject = new MediaStream([videoTrack]);
      this.videoElement.play().catch(() => {});

      let outputAudioTrack = audioTrack;
      if (audioTrack) {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          this.audioContext = new AudioCtx();
          const source = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
          this.audioGainNode = this.audioContext.createGain();
          this.audioGainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);

          this.snapEngine.attachAudioStream(new MediaStream([audioTrack]));

          const dest = this.audioContext.createMediaStreamDestination();
          source.connect(this.audioGainNode);
          this.audioGainNode.connect(dest);
          outputAudioTrack = dest.stream.getAudioTracks()[0];
        } catch (e) {
          console.warn('[SnapVanish] Audio pipeline error:', e);
        }
      }

      const canvasStream = this.outputCanvas.captureStream(30);
      const processedVideoTrack = canvasStream.getVideoTracks()[0];

      if (processedVideoTrack && videoTrack) {
        try {
          Object.defineProperty(processedVideoTrack, 'label', {
            get: () => videoTrack.label || 'Snap Vanish Virtual Camera'
          });
        } catch (e) {}
      }

      this.startLoop();

      const compositeStream = new MediaStream();
      if (processedVideoTrack) compositeStream.addTrack(processedVideoTrack);
      if (outputAudioTrack) compositeStream.addTrack(outputAudioTrack);

      this.processedStream = compositeStream;
      this.broadcastState();

      return compositeStream;
    }

    startLoop() {
      if (this.isRunning) return;
      this.isRunning = true;

      const loop = () => {
        if (!this.isRunning) return;

        if (this.videoElement && this.videoElement.readyState >= 2) {
          const w = this.outputCanvas.width;
          const h = this.outputCanvas.height;

          const segResult = this.segmentationEngine.process(this.videoElement, this.isVanished);

          if (this.enabled) {
            const audioRes = this.snapEngine.processAudioFrame();

            this.downscaleCtx.drawImage(this.videoElement, 0, 0, this.downscaleCanvas.width, this.downscaleCanvas.height);
            const visualRes = this.snapEngine.processVideoFrame(this.downscaleCanvas);

            this.snapEngine.evaluateSnap(visualRes, audioRes);
          }

          this.dustEngine.render(
            this.outputCtx,
            this.videoElement,
            segResult.bgPlateCanvas,
            w,
            h
          );
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    }
  }

  window.__snapVanish = new SnapVanishController();

  // =========================================================================
  // 3. MONKEY-PATCH getUserMedia
  // =========================================================================

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function(constraints) {
      if (!constraints || !constraints.video) {
        return origGetUserMedia(constraints);
      }

      console.log('[SnapVanish] Intercepting getUserMedia call with constraints:', constraints);
      try {
        const rawStream = await origGetUserMedia(constraints);
        return window.__snapVanish.initPipeline(rawStream, constraints);
      } catch (err) {
        console.error('[SnapVanish] Failed to intercept getUserMedia:', err);
        return origGetUserMedia(constraints);
      }
    };
  }

  const legacyGUM = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
  if (legacyGUM) {
    const boundLegacy = legacyGUM.bind(navigator);
    const hookedGUM = function(constraints, success, error) {
      boundLegacy(constraints, (stream) => {
        if (constraints && constraints.video) {
          const processed = window.__snapVanish.initPipeline(stream, constraints);
          success(processed);
        } else {
          success(stream);
        }
      }, error);
    };
    navigator.getUserMedia = hookedGUM;
    navigator.webkitGetUserMedia = hookedGUM;
  }

  console.log('[SnapVanish] getUserMedia successfully hooked!');
})();
