// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("Disney+ Dual Subtitles installed.");
  
  // Set default state
  chrome.storage.sync.set({ 
    enabled: true,
    primaryLang: 'en',
    secondaryLang: 'zh' // Chinese
  });
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
