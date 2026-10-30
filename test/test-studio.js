/**
 * Snap Vanish - Interactive Test Studio Controller
 * Standalone testing ground for webcam capture, hand tracking, white ash snap, and auto-mute.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const outputCanvas = document.getElementById('outputCanvas');
  const outputCtx = outputCanvas.getContext('2d');
  const trackingCanvas = document.getElementById('trackingCanvas');
  const trackingCtx = trackingCanvas.getContext('2d');
  const bgPlateCanvas = document.getElementById('bgPlateCanvas');
  const bgPlateCtx = bgPlateCanvas.getContext('2d');

  const megaSnapBtn = document.getElementById('megaSnapBtn');
  const megaBtnTitle = document.getElementById('megaBtnTitle');
  const snapToast = document.getElementById('snapToast');
  const meetingStateTag = document.getElementById('meetingStateTag');
  const studioStatus = document.getElementById('studioStatus');

  const handTelemetry = document.getElementById('handTelemetry');
  const bgTelemetry = document.getElementById('bgTelemetry');

  const micLevelFill = document.getElementById('micLevelFill');
  const micLevelVal = document.getElementById('micLevelVal');
  const snapTransientFill = document.getElementById('snapTransientFill');
  const snapTransientVal = document.getElementById('snapTransientVal');
  const micStatusPill = document.getElementById('micStatusPill');
  const micStatusLabel = document.getElementById('micStatusLabel');

  const sensitivityGroup = document.getElementById('sensitivityGroup');
  const studioAudioToggle = document.getElementById('studioAudioToggle');
  const studioDuration = document.getElementById('studioDuration');
  const dustDurationLabel = document.getElementById('dustDurationLabel');
  const studioDirection = document.getElementById('studioDirection');
  const eventLog = document.getElementById('eventLog');

  // Video Element
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;

  // Initialize Engines
  const snapEngine = new SnapEngine({
    sensitivity: 'medium',
    requireAudioConfirmation: true
  });
  const segmentationEngine = new SegmentationEngine(640, 360);
  const dustEngine = new ThanosDustEngine({
    duration: 2.5,
    direction: 'disperse',
    enableEmbers: true
  });

  let isVanished = false;
  let audioContext = null;
  let audioGainNode = null;

  function logEvent(text, type = 'normal') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString().split(' ')[0];
    entry.textContent = `[${time}] ${text}`;
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  // 1. Acquire Camera & Microphone
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 360 },
      audio: true
    });

    video.srcObject = stream;
    await video.play();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
    const micSource = audioContext.createMediaStreamSource(stream);
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.setValueAtTime(1.0, audioContext.currentTime);

    snapEngine.attachAudioStream(stream);

    logEvent('Camera & Microphone connected successfully.', 'normal');
    studioStatus.textContent = 'Camera & Mic Active';
  } catch (err) {
    console.error('Failed to get media:', err);
    logEvent(`Error accessing camera/mic: ${err.message}`, 'snap');
    studioStatus.textContent = 'Camera Error';
    studioStatus.className = 'badge badge-purple';
  }

  // 2. Snap Detection Hook
  snapEngine.onSnapDetected = () => {
    logEvent('🫰 FINGER SNAP DETECTED! Dual-gate gesture confirmed.', 'snap');
    toggleSnap();
  };

  // Toggle Action
  function toggleSnap() {
    if (!video || video.readyState < 2) return;

    const segResult = segmentationEngine.process(video, isVanished);
    const newState = dustEngine.toggleSnap(
      video,
      segResult.personMask,
      outputCanvas.width,
      outputCanvas.height
    );

    isVanished = (newState === 'vanished');

    if (isVanished) {
      megaBtnTitle.textContent = 'Snap to Return';
      meetingStateTag.textContent = '🟣 VANISHED (MUTED)';
      meetingStateTag.style.background = 'rgba(139, 92, 246, 0.2)';
      meetingStateTag.style.color = '#c084fc';
      meetingStateTag.style.borderColor = 'rgba(139, 92, 246, 0.4)';

      micStatusPill.className = 'mic-status-pill muted';
      micStatusLabel.textContent = 'Mic Auto-Muted (Silent)';

      if (audioGainNode && audioContext) {
        audioGainNode.gain.setTargetAtTime(0.0, audioContext.currentTime, 0.02);
      }

      showToast('🫰 SNAP! Vanished into white ash & Mic Muted');
      logEvent('User disintegrated into white ash dust. Mic muted.', 'snap');
    } else {
      megaBtnTitle.textContent = 'Snap to Vanish';
      meetingStateTag.textContent = '🟢 LIVE FEED';
      meetingStateTag.style.background = 'rgba(16, 185, 129, 0.15)';
      meetingStateTag.style.color = '#34d399';
      meetingStateTag.style.borderColor = 'rgba(16, 185, 129, 0.3)';

      micStatusPill.className = 'mic-status-pill';
      micStatusLabel.textContent = 'Mic Active & Unmuted';

      if (audioGainNode && audioContext) {
        audioGainNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.02);
      }

      showToast('🫰 Welcome Back! Ash dust reassembled & Mic Unmuted');
      logEvent('White ash flew back together. Person restored. Mic unmuted.', 'snap');
    }
  }

  function showToast(msg) {
    snapToast.textContent = msg;
    snapToast.classList.add('show');
    clearTimeout(snapToast.__timer);
    snapToast.__timer = setTimeout(() => {
      snapToast.classList.remove('show');
    }, 2800);
  }

  megaSnapBtn.addEventListener('click', toggleSnap);

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      toggleSnap();
    }
  });

  // Settings
  sensitivityGroup.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const val = e.target.dataset.val;
      snapEngine.applySensitivity(val);
      sensitivityGroup.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target));
      logEvent(`Sensitivity set to ${val}.`, 'normal');
    }
  });

  studioAudioToggle.addEventListener('change', () => {
    snapEngine.options.requireAudioConfirmation = studioAudioToggle.checked;
    logEvent(`Mic click confirmation: ${studioAudioToggle.checked ? 'Enabled' : 'Disabled'}.`, 'normal');
  });

  studioDuration.addEventListener('input', () => {
    dustDurationLabel.textContent = `${studioDuration.value}s`;
    dustEngine.setDuration(parseFloat(studioDuration.value));
  });

  studioDirection.addEventListener('change', () => {
    dustEngine.setDirection(studioDirection.value);
    logEvent(`Dust direction set to ${studioDirection.value}.`, 'normal');
  });

  // 3. Processing & Render Loop
  const downCanvas = document.createElement('canvas');
  downCanvas.width = 160;
  downCanvas.height = 90;
  const downCtx = downCanvas.getContext('2d', { willReadFrequently: true });

  let lastPinchState = false;

  function loop() {
    if (video && video.readyState >= 2) {
      const w = outputCanvas.width;
      const h = outputCanvas.height;

      // A. Segmentation & Background Plate (Auto-accumulated)
      const segResult = segmentationEngine.process(video, isVanished);

      // B. Audio Analysis
      const audioRes = snapEngine.processAudioFrame();
      if (audioRes.energyFlux) {
        const normLevel = Math.min(100, Math.round((audioRes.avgHighBand / 128) * 100));
        micLevelFill.style.width = `${normLevel}%`;
        micLevelVal.textContent = `${normLevel}%`;

        const spike = Math.min(100, Math.round((audioRes.energyFlux / 60) * 100));
        snapTransientFill.style.width = `${Math.max(0, spike)}%`;
        if (audioRes.snapDetected) {
          snapTransientVal.textContent = '💥 CLICK!';
          snapTransientVal.style.color = '#ef4444';
          logEvent('Audio transient click detected on mic.', 'gesture');
        } else {
          snapTransientVal.textContent = 'Normal';
          snapTransientVal.style.color = '#94a3b8';
        }
      }

      // C. Video Hand Tracking
      downCtx.drawImage(video, 0, 0, downCanvas.width, downCanvas.height);
      const visualRes = snapEngine.processVideoFrame(downCanvas);

      trackingCtx.clearRect(0, 0, trackingCanvas.width, trackingCanvas.height);
      trackingCtx.drawImage(video, 0, 0, trackingCanvas.width, trackingCanvas.height);

      if (visualRes.handDetected) {
        const scaleX = trackingCanvas.width / downCanvas.width;
        const scaleY = trackingCanvas.height / downCanvas.height;

        // Active snap zone boundary
        trackingCtx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
        trackingCtx.setLineDash([4, 4]);
        trackingCtx.beginPath();
        trackingCtx.moveTo(0, trackingCanvas.height * 0.78);
        trackingCtx.lineTo(trackingCanvas.width, trackingCanvas.height * 0.78);
        trackingCtx.stroke();
        trackingCtx.setLineDash([]);

        // Hand Centroid
        const hx = visualRes.centroidX * scaleX;
        const hy = visualRes.centroidY * scaleY;

        trackingCtx.fillStyle = visualRes.handState === 'PINCH_READY' ? '#ffffff' : '#38bdf8';
        trackingCtx.beginPath();
        trackingCtx.arc(hx, hy, 8, 0, Math.PI * 2);
        trackingCtx.fill();

        trackingCtx.strokeStyle = visualRes.handState === 'PINCH_READY' ? '#e2e8f0' : '#0284c7';
        trackingCtx.lineWidth = 2;
        trackingCtx.beginPath();
        trackingCtx.arc(hx, hy, 16, 0, Math.PI * 2);
        trackingCtx.stroke();

        handTelemetry.textContent = `State: ${visualRes.handState} (x:${Math.round(hx)}, y:${Math.round(hy)})`;

        if (visualRes.handState === 'PINCH_READY' && !lastPinchState) {
          logEvent('Hand elevated & Pinch detected. Ready for snap.', 'gesture');
          lastPinchState = true;
        } else if (visualRes.handState !== 'PINCH_READY') {
          lastPinchState = false;
        }
      } else {
        handTelemetry.textContent = 'State: IDLE (No hand in snap zone)';
      }

      // Draw Clean Empty Room Plate monitor
      bgPlateCtx.drawImage(segResult.bgPlateCanvas, 0, 0, bgPlateCanvas.width, bgPlateCanvas.height);
      bgTelemetry.textContent = segmentationEngine.hasMPMask ? 'ML Clean Room (No Ghosting)' : 'Synthesized Clean Room';

      // D. Dual Gate Decision
      snapEngine.evaluateSnap(visualRes, audioRes);

      // E. Render Final Meeting Output Canvas
      dustEngine.render(outputCtx, video, segResult.bgPlateCanvas, w, h);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
