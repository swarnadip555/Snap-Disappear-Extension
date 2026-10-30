/**
 * Snap Vanish - Popup Controller
 * Manages user preferences, status reporting, and direct triggers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const masterToggle = document.getElementById('masterToggle');
  const statusBanner = document.getElementById('statusBanner');
  const statusText = document.getElementById('statusText');
  const snapNowBtn = document.getElementById('snapNowBtn');
  const snapBtnLabel = document.getElementById('snapBtnLabel');
  const sensitivityControl = document.getElementById('sensitivityControl');
  const audioConfirmToggle = document.getElementById('audioConfirmToggle');
  const dustDuration = document.getElementById('dustDuration');
  const durationVal = document.getElementById('durationVal');
  const dustDirection = document.getElementById('dustDirection');
  const embersToggle = document.getElementById('embersToggle');
  const openStudioBtn = document.getElementById('openStudioBtn');

  let currentSettings = {
    enabled: true,
    sensitivity: 'medium',
    requireAudioConfirmation: true,
    dustDuration: 2.5,
    dustDirection: 'disperse',
    enableEmbers: true
  };

  let isVanished = false;

  // 1. Load Settings
  chrome.storage.sync.get(currentSettings, (items) => {
    currentSettings = items;
    applySettingsToUI(items);
  });

  function applySettingsToUI(s) {
    masterToggle.checked = !!s.enabled;
    audioConfirmToggle.checked = !!s.requireAudioConfirmation;
    dustDuration.value = s.dustDuration || 2.5;
    durationVal.textContent = `${s.dustDuration || 2.5}s`;
    dustDirection.value = s.dustDirection || 'disperse';
    embersToggle.checked = typeof s.enableEmbers === 'undefined' ? true : !!s.enableEmbers;

    const btns = sensitivityControl.querySelectorAll('button');
    btns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === s.sensitivity);
    });

    updateBannerUI();
  }

  function saveSettings() {
    chrome.storage.sync.set(currentSettings);
    sendTabMessage({ action: 'UPDATE_SETTINGS', settings: currentSettings });
  }

  function updateBannerUI() {
    if (!currentSettings.enabled) {
      statusBanner.className = 'status-banner disabled';
      statusText.textContent = 'Snap Vanish is Disabled';
      snapBtnLabel.textContent = 'Extension Off';
    } else if (isVanished) {
      statusBanner.className = 'status-banner vanished';
      statusText.textContent = 'Vanished · Mic Auto-Muted';
      snapBtnLabel.textContent = 'Snap to Return';
    } else {
      statusBanner.className = 'status-banner';
      statusText.textContent = 'Active & Ready to Snap';
      snapBtnLabel.textContent = 'Snap Now';
    }
  }

  // 2. Query Tab State
  async function queryTabState() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_STATE' }, (res) => {
          if (chrome.runtime.lastError) return;
        });
      }
    } catch (e) {}
  }
  queryTabState();

  // Listen to state broadcast from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'PAGE_STATE_UPDATED' && msg.state) {
      isVanished = !!msg.state.isVanished;
      if (typeof msg.state.enabled !== 'undefined') {
        currentSettings.enabled = msg.state.enabled;
        masterToggle.checked = currentSettings.enabled;
      }
      updateBannerUI();
    }
  });

  // Helper to send messages to active tab
  async function sendTabMessage(msg) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
      }
    } catch (e) {}
  }

  // 3. Event Handlers
  masterToggle.addEventListener('change', () => {
    currentSettings.enabled = masterToggle.checked;
    saveSettings();
    updateBannerUI();
  });

  snapNowBtn.addEventListener('click', () => {
    if (!currentSettings.enabled) return;
    isVanished = !isVanished;
    updateBannerUI();
    sendTabMessage({ action: 'TOGGLE_VANISH' });
  });

  sensitivityControl.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const val = e.target.dataset.val;
      currentSettings.sensitivity = val;
      const btns = sensitivityControl.querySelectorAll('button');
      btns.forEach(b => b.classList.toggle('active', b === e.target));
      saveSettings();
    }
  });

  audioConfirmToggle.addEventListener('change', () => {
    currentSettings.requireAudioConfirmation = audioConfirmToggle.checked;
    saveSettings();
  });

  dustDuration.addEventListener('input', () => {
    durationVal.textContent = `${dustDuration.value}s`;
    currentSettings.dustDuration = parseFloat(dustDuration.value);
    saveSettings();
  });

  dustDirection.addEventListener('change', () => {
    currentSettings.dustDirection = dustDirection.value;
    saveSettings();
  });

  embersToggle.addEventListener('change', () => {
    currentSettings.enableEmbers = embersToggle.checked;
    saveSettings();
  });

  openStudioBtn.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('test/test-studio.html')
    });
  });
});
