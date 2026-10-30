/**
 * Snap Vanish - Background Service Worker
 * Handles keyboard shortcuts (Alt+S), badge updates, and install lifecycle.
 */

chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.sync.set({
    enabled: true,
    sensitivity: 'medium',
    requireAudioConfirmation: true,
    dustDuration: 2.5,
    dustDirection: 'disperse',
    enableEmbers: true
  });

  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('test/test-studio.html')
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-vanish') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_VANISH' }).catch(() => {
        console.log('[SnapVanish] Tab did not respond to shortcut.');
      });
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'PAGE_STATE_UPDATED' && request.state) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      if (request.state.isVanished) {
        chrome.action.setBadgeText({ text: 'GONE', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId });
      } else if (request.state.isActiveCall) {
        chrome.action.setBadgeText({ text: 'LIVE', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId });
      } else {
        chrome.action.setBadgeText({ text: '', tabId });
      }
    }
  }
});
