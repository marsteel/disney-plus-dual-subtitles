// Background service worker
chrome.runtime.onInstalled.addListener((details) => {
  const currentVersion = chrome.runtime.getManifest().version;

  if (details.reason === 'install') {
    console.log("Disney+ Dual Subtitles installed.");

    // Set default state using browser UI language as secondary language
    const uiLang = chrome.i18n.getUILanguage().split('-')[0]; // e.g., 'zh' from 'zh-CN'
    chrome.storage.sync.set({
      enabled: true,
      primaryLang: 'en',
      secondaryLang: uiLang
    });

    // Open usage guidance for new installation
    chrome.tabs.create({ url: "https://disney-plus-dual-subtitles.magang.net/guidance.html" });
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion;

    if (previousVersion) {
      const p = parseVersion(previousVersion);
      const c = parseVersion(currentVersion);

      // Open changelog only for Major or Minor updates
      if (c.major > p.major || (c.major === p.major && c.minor > p.minor)) {
        console.log(`Disney+ Dual Subtitles: Significant update detected (${previousVersion} -> ${currentVersion}). Opening changelog.`);
        chrome.tabs.create({ url: "https://disney-plus-dual-subtitles.magang.net/changelog.html" });
      } else {
        console.log(`Disney+ Dual Subtitles: Patch update or reload (${previousVersion} -> ${currentVersion}). Staying silent.`);
      }
    }
  }
});

// Helper to parse semantic versioning (Major.Minor.Patch)
function parseVersion(versionStr) {
  const parts = versionStr.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

// Handle messages from content script or popup if necessary
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CONFIG') {
    chrome.storage.sync.get(['enabled', 'primaryLang', 'secondaryLang'], (data) => {
      sendResponse(data);
    });
    return true; // Keep message channel open for async response
  }
});
