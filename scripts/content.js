/**
 * Snap Vanish - Isolated World Content Script
 * Relays messages and storage settings between Extension Popup / Background and Injected Main World script.
 */

(function() {
  console.log('[SnapVanish] Content script bridge running...');

  // 1. Load initial saved settings and send to page script
  chrome.storage.sync.get({
    enabled: true,
    sensitivity: 'medium',
    requireAudioConfirmation: true,
    dustDuration: 2.5,
    dustDirection: 'disperse',
    enableEmbers: true
  }, (items) => {
    window.postMessage({
      source: 'SNAP_VANISH_EXTENSION',
      type: 'UPDATE_SETTINGS',
      payload: items
    }, '*');
  });

  // 2. Listen to storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      const updated = {};
      for (const [key, change] of Object.entries(changes)) {
        updated[key] = change.newValue;
      }
      window.postMessage({
        source: 'SNAP_VANISH_EXTENSION',
        type: 'UPDATE_SETTINGS',
        payload: updated
      }, '*');
    }
  });

  // 3. Listen to messages from popup or background service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'TOGGLE_VANISH') {
      window.postMessage({ source: 'SNAP_VANISH_EXTENSION', type: 'TOGGLE_VANISH' }, '*');
      sendResponse({ status: 'sent' });
    } else if (request.action === 'GET_STATE') {
      window.postMessage({ source: 'SNAP_VANISH_EXTENSION', type: 'GET_STATE' }, '*');
      sendResponse({ status: 'sent' });
    } else if (request.action === 'UPDATE_SETTINGS') {
      window.postMessage({
        source: 'SNAP_VANISH_EXTENSION',
        type: 'UPDATE_SETTINGS',
        payload: request.settings
      }, '*');
      sendResponse({ status: 'sent' });
    }
    return true;
  });

  // 4. Keyboard shortcut in page as backup (Alt+S)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      window.postMessage({ source: 'SNAP_VANISH_EXTENSION', type: 'TOGGLE_VANISH' }, '*');
    }
  });

  // 5. Listen to responses from Injected Page Script
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'SNAP_VANISH_PAGE') return;

    if (event.data.type === 'STATE_UPDATE') {
      chrome.runtime.sendMessage({
        action: 'PAGE_STATE_UPDATED',
        state: event.data.state
      }).catch(() => {});
    }
  });
})();
