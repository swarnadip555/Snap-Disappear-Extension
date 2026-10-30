/**
 * Snap Vanish - Translucent Ash Bubble & Disintegration Engine
 * 
 * Rules:
 * - Turns the person into tiny, translucent white ash bubbles that drift and float away.
 * - Much smaller particles (0.7px - 2.2px) with delicate bubble membrane, transparent fill, and specular glints.
 * - Simulates buoyant upward drift, wobble, aerodynamic turbulence, and gentle dissipation.
 * - ZERO retention of the user's snapshot or frozen image: completely dissolves into the clean empty room.
 * - On "Snap Again", seamlessly reverses time: bubbles float back together and reconstitute the user.
 */

class ThanosDustEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      duration: 2.5, // seconds
      direction: 'disperse', // 'disperse', 'right', 'left', 'upward'
      enableEmbers: true,
      particleDensity: 2 // tighter step = 20,000+ micro bubbles
    }, options);

    // States: 'PRESENT', 'DISINTEGRATING', 'VANISHED', 'REINTEGRATING'
    this.state = 'PRESENT';
    this.progress = 0; // 0.0 = fully present, 1.0 = fully vanished
    this.transitionStartTime = 0;
    this.transitionDuration = this.options.duration * 1000;

    this.particles = [];
  }

  setDuration(seconds) {
    this.options.duration = Math.max(0.5, Math.min(8.0, seconds));
    this.transitionDuration = this.options.duration * 1000;
  }

  setDirection(direction) {
    this.options.direction = direction;
  }

  setEmbersEnabled(enabled) {
    this.options.enableEmbers = !!enabled;
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

        // Spawn bubbles along the human silhouette
        if (maskVal > 0.32) {
          let threshold = 0;
          if (direction === 'right') {
            threshold = (x / width) * 0.75 + (Math.random() * 0.25);
          } else if (direction === 'left') {
            threshold = ((width - x) / width) * 0.75 + (Math.random() * 0.25);
          } else if (direction === 'upward') {
            threshold = ((height - y) / height) * 0.75 + (Math.random() * 0.25);
          } else { // 'disperse'
            const dist = Math.sqrt((x - originX) ** 2 + (y - originY) ** 2);
            threshold = (dist / maxRadius) * 0.75 + (Math.random() * 0.25);
          }

          // Aerodynamic buoyancy vectors (ash bubbles float upward & sideways)
          let baseVx = 0;
          let baseVy = -2.0 - Math.random() * 2.5; // upward buoyancy float

          if (direction === 'right') {
            baseVx = 2.5 + Math.random() * 3.5;
            baseVy = -1.2 + (Math.random() - 0.5) * 1.8;
          } else if (direction === 'left') {
            baseVx = -(2.5 + Math.random() * 3.5);
            baseVy = -1.2 + (Math.random() - 0.5) * 1.8;
          } else if (direction === 'upward') {
            baseVx = (Math.random() - 0.5) * 2.5;
            baseVy = -(3.5 + Math.random() * 4.5);
          } else { // 'disperse'
            const angle = Math.atan2(y - originY, x - originX) + (Math.random() - 0.5) * 0.7;
            const speed = 2.0 + Math.random() * 3.5;
            baseVx = Math.cos(angle) * speed;
            baseVy = Math.sin(angle) * speed - 1.8; // buoyancy
          }

          // Small translucent bubble radius: 0.7px to 2.0px
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

    // 1. UPDATE TRANSITION PROGRESS
    if (this.state === 'DISINTEGRATING') {
      const elapsed = now - this.transitionStartTime;
      this.progress = Math.min(1.0, elapsed / this.transitionDuration);
      if (this.progress >= 1.0) {
        this.state = 'VANISHED';
      }
    } else if (this.state === 'REINTEGRATING') {
      const elapsed = now - this.transitionStartTime;
      this.progress = Math.max(0.0, 1.0 - (elapsed / this.transitionDuration));
      if (this.progress <= 0.0) {
        this.state = 'PRESENT';
        this.particles = [];
      }
    }

    // SCENARIO A: 100% Present (Normal camera feed)
    if (this.state === 'PRESENT') {
      targetCtx.drawImage(liveVideoElement, 0, 0, width, height);
      return;
    }

    // SCENARIO B: 100% Vanished (Clean empty room background)
    if (this.state === 'VANISHED') {
      if (emptyRoomCanvas) {
        targetCtx.drawImage(emptyRoomCanvas, 0, 0, width, height);
      } else {
        targetCtx.fillStyle = '#100e18';
        targetCtx.fillRect(0, 0, width, height);
      }
      return;
    }

    // SCENARIO C: In Transition (Disintegrating / Reintegrating)
    // 1. Draw Clean Empty Room Base
    if (emptyRoomCanvas) {
      targetCtx.drawImage(emptyRoomCanvas, 0, 0, width, height);
    } else {
      targetCtx.fillStyle = '#100e18';
      targetCtx.fillRect(0, 0, width, height);
    }

    // 2. Smoothly Dissolve the Live Person into the Clean Room
    // No frozen photo snapshots: live feed gently fades out as bubbles release
    const dissolveProgress = this.progress;
    if (dissolveProgress < 0.96) {
      targetCtx.save();
      targetCtx.globalAlpha = Math.max(0, 1.0 - dissolveProgress * 1.12);
      targetCtx.drawImage(liveVideoElement, 0, 0, width, height);
      targetCtx.restore();
    }

    // 3. Render Translucent White Ash Bubbles
    const timeSec = now * 0.001;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      if (dissolveProgress >= p.threshold) {
        const bubbleLife = Math.min(1.0, (dissolveProgress - p.threshold) / 0.55);

        // Gentle buoyant drift + aerodynamic vortex swirl
        const swirlX = Math.sin(p.seed + timeSec * 3 + p.origY * 0.02) * 10 * bubbleLife;
        const swirlY = Math.cos(p.seed + timeSec * 2.5 + p.origX * 0.02) * 6 * bubbleLife;

        const ease = 1 - Math.pow(1 - bubbleLife, 2);
        p.currX = p.origX + (p.maxDispersedX - p.origX) * ease + swirlX;
        p.currY = p.origY + (p.maxDispersedY - p.origY) * ease + swirlY;

        // Subtle wobble pulsation
        const wobble = 1.0 + Math.sin(p.seed + timeSec * p.wobbleSpeed) * 0.12;
        const curRadius = Math.max(0.5, p.radius * wobble);

        // Alpha transparency: starts semi-transparent (~0.55) and softly dissipates
        p.alpha = Math.max(0, (1.0 - bubbleLife * 0.95) * 0.55);

        if (p.alpha > 0.03) {
          // BUBBLE EFFECT RENDERING:
          // 1. Translucent inner core
          targetCtx.beginPath();
          targetCtx.arc(p.currX, p.currY, curRadius, 0, Math.PI * 2);
          targetCtx.fillStyle = `rgba(240, 248, 255, ${p.alpha * 0.28})`;
          targetCtx.fill();

          // 2. Delicate outer membrane ring
          targetCtx.lineWidth = 0.55;
          targetCtx.strokeStyle = `rgba(255, 255, 255, ${p.alpha * 0.80})`;
          targetCtx.stroke();

          // 3. Tiny specular sheen glint (sub-pixel highlight)
          if (curRadius > 1.0) {
            targetCtx.beginPath();
            targetCtx.arc(p.currX - curRadius * 0.35, p.currY - curRadius * 0.35, curRadius * 0.28, 0, Math.PI * 2);
            targetCtx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.90})`;
            targetCtx.fill();
          }

          // 4. White Ash Sparkle on freshly detached bubbles
          if (this.options.enableEmbers && bubbleLife < 0.12) {
            targetCtx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.85})`;
            targetCtx.fillRect(p.currX - 0.6, p.currY - 0.6, 1.2, 1.2);
          }
        }
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.ThanosDustEngine = ThanosDustEngine;
}
