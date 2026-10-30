/**
 * Snap Vanish - Finger Snap Detection Engine
 * Integrates Computer Vision Hand Tracking + Web Audio Acoustic Transient Detection.
 * 
 * Rules:
 * - Detects a real finger snap using hand tracking (pinch tension -> explosive release in upper frame).
 * - Ignores normal typing and desk movements (filtered by height zone, pose dynamics, and frequency).
 * - Uses acoustic snap click from microphone to confirm visual gesture.
 */

class SnapEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      sensitivity: 'medium', // 'low', 'medium', 'high'
      requireAudioConfirmation: true,
      audioSnapThreshold: 42,
      visualVelocityThreshold: 1.8,
      cooldownMs: 1400,
      debug: false
    }, options);

    // Audio Analysis State
    this.audioContext = null;
    this.analyser = null;
    this.freqData = null;
    this.timeData = null;
    this.lastAcousticSnapTime = 0;
    this.acousticSnapStrength = 0;
    this.prevHighBandEnergy = 0;

    // Visual Hand Tracking State
    this.lastVisualSnapTime = 0;
    this.visualSnapConfidence = 0;
    this.handState = 'IDLE'; // IDLE, HAND_RAISED, PINCH_READY, SNAP_RELEASE
    this.pinchStartTime = 0;
    this.prevHandY = null;
    this.prevHandArea = null;
    this.handHistory = [];
    this.lastTriggerTime = 0;

    // Callbacks
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
    } else { // medium
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
      console.warn('[SnapVanish] Failed to attach audio analyzer:', e);
    }
  }

  processAudioFrame() {
    if (!this.analyser) return { snapDetected: false, level: 0 };

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const binCount = this.analyser.frequencyBinCount;
    const sampleRate = (this.audioContext && this.audioContext.sampleRate) || 48000;
    const binHz = (sampleRate / 2) / binCount;

    // High frequency band for finger snap acoustic shockwave
    const lowBin = Math.max(0, Math.floor(2200 / binHz));
    const highBin = Math.min(binCount - 1, Math.ceil(7000 / binHz));

    let highBandEnergy = 0;
    for (let i = lowBin; i <= highBin; i++) {
      highBandEnergy += this.freqData[i];
    }
    const avgHighBand = highBandEnergy / (highBin - lowBin + 1);

    // Crest factor
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
      this.acousticSnapStrength = energyFlux;
      isAcousticSnap = true;
    }

    return {
      snapDetected: isAcousticSnap,
      level: avgHighBand,
      crest: crestFactor,
      flux: energyFlux
    };
  }

  processVideoFrame(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const now = performance.now();

    // Snap Zone: Upper 75% of screen (typing at bottom 25% is ignored)
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

    return {
      handDetected,
      handState: this.handState,
      isVisualSnap,
      centroidX,
      centroidY,
      confidence: this.visualSnapConfidence
    };
  }

  evaluateSnap(visualResult, audioResult) {
    const now = performance.now();

    if (now - this.lastTriggerTime < this.options.cooldownMs) {
      return { triggered: false };
    }

    let snapConfirmed = false;
    let confidence = 0;

    if (this.options.requireAudioConfirmation) {
      const timeDiff = Math.abs(this.lastVisualSnapTime - this.lastAcousticSnapTime);
      if (
        this.lastVisualSnapTime > 0 &&
        this.lastAcousticSnapTime > 0 &&
        timeDiff <= this.coincidenceWindowMs &&
        (now - Math.max(this.lastVisualSnapTime, this.lastAcousticSnapTime)) < 350
      ) {
        snapConfirmed = true;
        confidence = 0.95;
      }
    } else {
      if (visualResult.isVisualSnap) {
        snapConfirmed = true;
        confidence = 0.85;
      }
    }

    if (snapConfirmed) {
      this.lastTriggerTime = now;
      this.lastVisualSnapTime = 0;
      this.lastAcousticSnapTime = 0;
      this.handState = 'IDLE';

      if (typeof this.onSnapDetected === 'function') {
        this.onSnapDetected({ timestamp: now, confidence });
      }

      return { triggered: true, confidence };
    }

    return { triggered: false };
  }
}

if (typeof window !== 'undefined') {
  window.SnapEngine = SnapEngine;
}
