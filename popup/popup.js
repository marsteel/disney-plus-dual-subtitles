document.addEventListener('DOMContentLoaded', () => {
  const enableToggle = document.getElementById('enableToggle');
  const primaryLang = document.getElementById('primaryLang');
  const secondaryLang = document.getElementById('secondaryLang');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const settingsPanel = document.getElementById('settingsPanel');

  // Style inputs
  const styles = {
    primary: {
      color: document.getElementById('primaryColor'),
      bg: document.getElementById('primaryBg'),
      size: document.getElementById('primarySize'),
      bold: document.getElementById('primaryBold')
    },
    secondary: {
      color: document.getElementById('secondaryColor'),
      bg: document.getElementById('secondaryBg'),
      size: document.getElementById('secondarySize'),
      bold: document.getElementById('secondaryBold')
    }
  };

  const DEFAULT_STYLES = {
    primaryColor: '#ffffff',
    primaryBg: '#00000000', // transparent
    primarySize: 32,
    primaryBold: true,
    secondaryColor: '#ffcc00',
    secondaryBg: '#00000000',
    secondarySize: 24,
    secondaryBold: true
  };

  function translateUI() {
    document.getElementById('appName').textContent = chrome.i18n.getMessage('appName');
    document.getElementById('primaryLangLabel').textContent = chrome.i18n.getMessage('primaryLangLabel');
    document.getElementById('secondaryLangLabel').textContent = chrome.i18n.getMessage('secondaryLangLabel');
    saveBtn.textContent = chrome.i18n.getMessage('saveBtn');
    resetBtn.textContent = chrome.i18n.getMessage('resetBtn');
  }

  translateUI();

  const LANG_NAMES = {
    "zh-hk": "Chinese (Hong Kong - Cantonese)",
    "zh-hans": "Chinese (Simplified)",
    "zh-hant": "Chinese (Traditional)",
    "da": "Danish",
    "de": "German",
    "en": "English",
    "es-419": "Spanish (Latin America)",
    "es-es": "Spanish (Spain)",
    "fr-fr": "French",
    "el": "Greek",
    "hu": "Hungarian",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "nl": "Dutch",
    "no": "Norwegian",
    "pl": "Polish",
    "pt-pt": "Portuguese (Portugal)",
    "pt-br": "Portuguese (Brazil)",
    "ro": "Romanian",
    "sk": "Slovak",
    "fi": "Finnish",
    "sv": "Swedish",
    "tr": "Turkish",
    "cs": "Czech",
    "unknown": "Unknown"
  };

  // Setup bold toggles
  [styles.primary.bold, styles.secondary.bold].forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
    });
  });

  function applyStylesToUI(data) {
    styles.primary.color.value = data.primaryColor || DEFAULT_STYLES.primaryColor;
    styles.primary.bg.value = (data.primaryBg && data.primaryBg !== 'transparent') ? data.primaryBg : '#000000'; 
    styles.primary.size.value = data.primarySize || DEFAULT_STYLES.primarySize;
    if (data.primaryBold ?? DEFAULT_STYLES.primaryBold) styles.primary.bold.classList.add('active');
    else styles.primary.bold.classList.remove('active');

    styles.secondary.color.value = data.secondaryColor || DEFAULT_STYLES.secondaryColor;
    styles.secondary.bg.value = (data.secondaryBg && data.secondaryBg !== 'transparent') ? data.secondaryBg : '#000000';
    styles.secondary.size.value = data.secondarySize || DEFAULT_STYLES.secondarySize;
    if (data.secondaryBold ?? DEFAULT_STYLES.secondaryBold) styles.secondary.bold.classList.add('active');
    else styles.secondary.bold.classList.remove('active');
  }

  // Load current settings and detected languages
  chrome.storage.sync.get(['enabled', 'primaryLang', 'secondaryLang', 
                           'primaryColor', 'primaryBg', 'primarySize', 'primaryBold',
                           'secondaryColor', 'secondaryBg', 'secondarySize', 'secondaryBold'], (syncData) => {
    
    applyStylesToUI(syncData);

    // Get active tab to extract video ID for cache retrieval
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        const url = activeTab?.url || "";
        const match = url.match(/\/video\/([a-zA-Z0-9-]+)/);
        const videoId = match ? match[1] : (url ? new URL(url).pathname + new URL(url).hash : null);

        chrome.storage.local.get(['subtitleCache', 'detectedLanguages'], (localData) => {
            let detected = localData.detectedLanguages || [];
            
            // Try to supplement from cache if we have a videoId
            if (videoId && localData.subtitleCache && localData.subtitleCache[videoId]) {
                const cachedMap = localData.subtitleCache[videoId].map;
                detected = Array.from(new Set([...detected, ...Object.keys(cachedMap)]));
                console.log("Popup: Using cached metadata for video", videoId);
            }

            if (detected && Array.isArray(detected) && detected.length > 0) {
                const populateSelect = (selectEl, currentVal) => {
                    selectEl.innerHTML = '';
                    const offOpt = document.createElement('option');
                    offOpt.value = 'none';
                    offOpt.textContent = chrome.i18n.getMessage('off');
                    if (currentVal === 'none') offOpt.selected = true;
                    selectEl.appendChild(offOpt);

                    detected.forEach(lang => {
                        const opt = document.createElement('option');
                        opt.value = lang;
                        opt.textContent = LANG_NAMES[lang] || lang; 
                        if (lang === currentVal) opt.selected = true;
                        selectEl.appendChild(opt);
                    });
                };

                populateSelect(primaryLang, syncData.primaryLang);
                populateSelect(secondaryLang, syncData.secondaryLang);
            }

            if (syncData.enabled !== undefined) {
                enableToggle.checked = syncData.enabled;
                toggleSettingsVisibility(syncData.enabled);
            }
        });
    });
  });

  enableToggle.addEventListener('change', (e) => {
    toggleSettingsVisibility(e.target.checked);
    chrome.storage.sync.set({ enabled: e.target.checked });
  });

  saveBtn.addEventListener('click', () => {
    const config = {
      enabled: enableToggle.checked,
      primaryLang: primaryLang.value,
      secondaryLang: secondaryLang.value,
      primaryColor: styles.primary.color.value,
      primaryBg: styles.primary.bg.value,
      primarySize: parseInt(styles.primary.size.value),
      primaryBold: styles.primary.bold.classList.contains('active'),
      secondaryColor: styles.secondary.color.value,
      secondaryBg: styles.secondary.bg.value,
      secondarySize: parseInt(styles.secondary.size.value),
      secondaryBold: styles.secondary.bold.classList.contains('active')
    };
    
    chrome.storage.sync.set(config, () => {
      window.close();
    });
  });

  resetBtn.addEventListener('click', () => {
      applyStylesToUI(DEFAULT_STYLES);
  });

  function toggleSettingsVisibility(isEnabled) {
    settingsPanel.style.opacity = isEnabled ? '1' : '0.5';
    settingsPanel.style.pointerEvents = isEnabled ? 'auto' : 'none';
  }
});
