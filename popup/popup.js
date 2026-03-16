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
    "zh-hk": "Chinese (Hong Kong)",
    "zh-hans": "Chinese (Simplified)",
    "zh-hant": "Chinese (Traditional)",
    "da": "Danish",
    "de": "Deutsch",
    "en": "English",
    "en-gb": "English (UK)",
    "es-419": "Español (Latinoamericano)",
    "es-es": "Español",
    "fr-fr": "Français",
    "el": "Greek",
    "hu": "Magyar",
    "is": "Íslenska",
    "it": "Italiano",
    "ja": "Japanese",
    "ko": "Korean",
    "nl": "Nederlands",
    "no": "Norsk",
    "pl": "Polski",
    "pt-pt": "Português",
    "pt-br": "Português (Brasil)",
    "ro": "Română",
    "sk": "Slovak",
    "fi": "Suomi",
    "sv": "Svenska",
    "tr": "Türkçe",
    "cs": "Čeština",
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
                           'secondaryColor', 'secondaryBg', 'secondarySize', 'secondaryBold',
                           'usageFreq'], (syncData) => {
    
    const usageFreq = syncData.usageFreq || {};
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
                // Sorting Helper
                const getLabel = (key, map) => {
                    const langObj = map?.[key];
                    if (langObj && langObj.name) return langObj.name;
                    let baseCode = key;
                    if (key.endsWith('-cc')) baseCode = key.replace('-cc', '');
                    else if (key.endsWith('-forced')) baseCode = key.replace('-forced', '');
                    else if (key.endsWith('-normal')) baseCode = key.replace('-normal', '');
                    return LANG_NAMES[baseCode.toLowerCase()] || baseCode;
                };

                const getPriorityScore = (key) => {
                    if (key.startsWith('zh')) return 300;
                    if (key.startsWith('en')) return 200;
                    if (key.startsWith('nl')) return 100;
                    return 0;
                };

                const populateSelect = (selectEl, currentVal) => {
                    const videoMap = (localData.subtitleCache && videoId) ? localData.subtitleCache[videoId]?.map : null;
                    
                    // Sort the detected languages
                    const sortedDetected = [...detected].sort((a, b) => {
                        // 1. Usage frequency (descending)
                        const freqDiff = (usageFreq[b] || 0) - (usageFreq[a] || 0);
                        if (freqDiff !== 0) return freqDiff;

                        // 2. Priority Group (descending)
                        const prioDiff = getPriorityScore(b) - getPriorityScore(a);
                        if (prioDiff !== 0) return prioDiff;

                        // 3. Alphabetical (ascending)
                        const labelA = getLabel(a, videoMap).toLowerCase();
                        const labelB = getLabel(b, videoMap).toLowerCase();
                        return labelA.localeCompare(labelB);
                    });

                    selectEl.innerHTML = '';
                    const offOpt = document.createElement('option');
                    offOpt.value = 'none';
                    offOpt.textContent = chrome.i18n.getMessage('off');
                    if (currentVal === 'none') offOpt.selected = true;
                    selectEl.appendChild(offOpt);

                    // Create a map to track what labels we've added to avoid confusion
                    const seenLabels = new Set();
                    
                    sortedDetected.forEach(key => {
                        const langObj = videoMap ? videoMap[key] : null;
                        
                        const opt = document.createElement('option');
                        opt.value = key;
                        
                        let label = '';
                        let baseCode = key;
                        let typeSuffix = '';

                        if (key.endsWith('-cc')) {
                            baseCode = key.replace('-cc', '');
                            typeSuffix = ' [CC]';
                        } else if (key.endsWith('-forced')) {
                            baseCode = key.replace('-forced', '');
                            typeSuffix = ' [Forced]';
                        } else if (key.endsWith('-normal')) {
                            baseCode = key.replace('-normal', '');
                        } else {
                            baseCode = key;
                        }

                        const friendlyName = LANG_NAMES[baseCode.toLowerCase()] || LANG_NAMES[baseCode.split('-')[0]];
                        const disneyName = (langObj && langObj.name) ? langObj.name : '';
                        
                        // Heuristic: If disneyName looks like a code (e.g. "es-ES--forced--"), prefer friendlyName
                        const isDisneyNameUgly = disneyName.includes('--') || disneyName.includes('_') || (!isNaN(disneyName.charAt(0)) && disneyName.includes('-'));
                        
                        if (friendlyName) {
                            label = friendlyName;
                        } else if (disneyName && !isDisneyNameUgly) {
                            label = disneyName;
                        } else {
                            label = baseCode;
                        }
                        
                        // Append type for clarity if not already in the label
                        if (typeSuffix && !label.includes('[CC]') && !label.includes('CC') && !label.includes('[Forced]') && !label.includes('Forced')) {
                            label += typeSuffix;
                        }

                        // Append (Empty) hint if track is known to be empty
                        if (langObj && langObj.isEmpty) {
                            const emptyHint = chrome.i18n.getMessage('empty_track');
                            if (emptyHint) label += ` (${emptyHint})`;
                        }

                        opt.textContent = label;
                        if (key === currentVal) opt.selected = true;
                        
                        // Small cleanup: if we have "zh-hans" and "zh-hans-normal" as distinct keys, 
                        // they are functionally the same. Only add if the full key-label combo is unique.
                        const dedupeKey = `${label}-${key.includes('-normal') ? baseCode : key}`;
                        if (!seenLabels.has(dedupeKey)) {
                            selectEl.appendChild(opt);
                            seenLabels.add(dedupeKey);
                        }
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
    
    // Update usage frequency
    chrome.storage.sync.get(['usageFreq'], (data) => {
        const freq = data.usageFreq || {};
        if (config.primaryLang !== 'none') {
            freq[config.primaryLang] = (freq[config.primaryLang] || 0) + 1;
        }
        if (config.secondaryLang !== 'none' && config.secondaryLang !== config.primaryLang) {
            freq[config.secondaryLang] = (freq[config.secondaryLang] || 0) + 1;
        }
        config.usageFreq = freq;
        
        chrome.storage.sync.set(config, () => {
          window.close();
        });
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
