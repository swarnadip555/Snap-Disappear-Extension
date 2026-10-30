# 🫰 Snap Vanish - Thanos Webcam Snap & Auto-Mute

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Privacy: 100% On-Device](https://img.shields.io/badge/Privacy-100%25_On--Device-success)](README.md)
[![WebGL](https://img.shields.io/badge/Render-WebGL_Particles-orange)](README.md)
[![MediaPipe](https://img.shields.io/badge/Vision-MediaPipe_Selfie_Segmentation-0097A7)](https://developers.google.com/mediapipe)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Vanish from any video call with a finger snap, Endgame style, turning into white ash dust that blows away, leaving an empty room behind you, and muting your mic. Snap again, and the ash dust flies back together.**

Built for **Google Meet**, **Microsoft Teams (web)**, **Zoom (web)**, and any browser-based webcam site. Runs **100% on-device** in Chrome with zero external servers.

---

## ⚡ What it Does

- 🌪️ **White Ash Thanos Disintegration**: When you snap your fingers on camera, your video feed dissolves into 12,000+ realistic dust particles and white ash sparkles (silvery/white ash, no yellow) that blow away with curl-noise wind aerodynamics.
- 🛋️ **Automatic Empty Room**: Dynamically and continuously accumulates background pixels as you move in front of the camera, using content-aware inpainting to seamlessly fill occluded areas. Meeting participants see your clean empty room—**no manual calibration needed, and not a blurry silhouette**.
- 🔇 **Auto-Mute**: Automatically mutes your microphone stream the instant you vanish, and unmutes when you return.
- ⏪ **Snap to Return**: Snap your fingers again (or press `Alt + S`), and the white ash dust flies back together in reverse, reconstituting you on camera and unmuting your mic.
- 🎯 **Dual-Gate Finger Snap Detection**: Uses computer vision hand tracking (pinch tension -> explosive release in the upper camera frame) combined with high-frequency acoustic click analysis from your microphone. Normal typing and hand waving will **not** trigger it.
- 🔒 **Privacy by Design**: Runs 100% locally on your machine using HTML5 Canvas, WebGL, MediaPipe WASM, and Web Audio APIs. No video or audio ever leaves your computer.

---

## 🚀 How to Install in Chrome (2-Minute Guide)

1. **Clone this repository**:
   ```bash
   git clone https://github.com/swarnadip555/Snap-Disappear-Extension.git
   ```
2. Open **Google Chrome** (or Microsoft Edge / Brave / any Chromium browser).
3. In the URL bar, navigate to:
   ```
   chrome://extensions
   ```
4. In the top-right corner, toggle **Developer mode** to **ON**.
5. Click the **Load unpacked** button in the top-left.
6. Select the cloned folder (`Snap-Disappear-Extension`, which contains `manifest.json`).
7. The **Snap Vanish** extension icon (🫰) will appear in your Chrome toolbar!

---

## 🎮 Testing it in the Live Studio

Before joining a meeting, try it out in the built-in sandbox:

1. Click the **Snap Vanish (🫰)** extension icon in your Chrome toolbar.
2. Click **🎮 Open Live Test Studio**.
3. Allow camera and microphone permissions when prompted.
4. Raise your hand, pinch your thumb and middle finger, and **snap**!
   - Watch yourself dissolve into white ash dust!
   - Observe the mic audio meter drop to zero (muted).
   - Snap again to watch the ash dust reassemble in reverse.
5. You can also press **Alt + S** or click **Snap Now** at any time.

---

## 💼 Using it on Google Meet / Teams / Zoom

1. Open [Google Meet](https://meet.google.com), [Microsoft Teams](https://teams.microsoft.com), or [Zoom Web](https://app.zoom.us).
2. Join or start a meeting with your webcam turned on.
3. Snap your fingers on camera to vanish and mute!
4. Snap again to return.

### Pro-Tips:
- **Backup Hotkey**: Press **Alt + S** (customizable via `chrome://extensions/shortcuts`) to trigger the vanish effect instantly even if your hand is off camera.
- **Settings**: Customize the particle wind direction (*Disperse*, *Right*, *Left*, *Upward*), ash dust duration (*1.0s to 5.0s*), and snap sensitivity directly in the popup extension menu.

---

## 🏗️ Project Structure

```
Snap-Disappear-Extension/
├── manifest.json                  # Manifest V3 extension configuration
├── README.md                      # Project documentation & setup guide
├── LICENSE                        # MIT License
├── icons/                         # Extension icons (16px, 32px, 48px, 128px)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── libs/                          # MediaPipe local WASM and TFLite models
│   └── mediapipe/                 # Offline selfie segmentation binaries & models
├── popup/                         # Chrome extension popup UI & settings
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── scripts/                       # Core extension logic
│   ├── background.js              # Service worker handling commands & badges
│   ├── content.js                 # Bridge between isolated world & DOM
│   ├── injected.bundle.js         # Camera stream interception & canvas pipe
│   ├── segmentation-engine.js     # Person segmentation & dynamic background
│   ├── snap-engine.js             # Dual-gate audio/visual snap detector
│   └── thanos-dust-engine.js      # WebGL particle physics & disintegration
└── test/                          # Interactive live test studio
    ├── test-studio.html
    ├── test-studio.css
    └── test-studio.js
```

---

## 🔒 Privacy & Permissions

This extension operates **100% locally**:
- All computer vision (MediaPipe) runs on local WASM/WebGL threads.
- All audio peak analysis is handled in-memory using Web Audio API analyzers.
- No network requests, telemetry, or server dependencies.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
