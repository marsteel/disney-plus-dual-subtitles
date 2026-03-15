// Background service worker
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log("Disney+ Dual Subtitles installed.");

    // Set default state using browser UI language as secondary language
    const uiLang = chrome.i18n.getUILanguage().split('-')[0]; // e.g., 'zh' from 'zh-CN'
    chrome.storage.sync.set({
      enabled: true,
      primaryLang: 'en',
      secondaryLang: uiLang
    });

    // Open changelog for new installation
    chrome.tabs.create({ url: "https://disney-plus-dual-subtitles.magang.net/changelog.html" });
  } else if (details.reason === 'update') {
    const currentVersion = chrome.runtime.getManifest().version;
    if (details.previousVersion !== currentVersion) {
      console.log(`Disney+ Dual Subtitles updated from ${details.previousVersion} to ${currentVersion}.`);
      // Open changelog after genuine version update
      chrome.tabs.create({ url: "https://disney-plus-dual-subtitles.magang.net/changelog.html" });
    } else {
      console.log("Disney+ Dual Subtitles reloaded (version unchanged).");
    }
  }
});

// Handle messages from content script or popup if necessary
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CONFIG') {
    chrome.storage.sync.get(['enabled', 'primaryLang', 'secondaryLang'], (data) => {
      sendResponse(data);
    });
    return true; // Keep message channel open for async response
  }
});
