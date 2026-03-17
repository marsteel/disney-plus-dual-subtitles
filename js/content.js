// Content script to handle secondary subtitles logic
console.log("Disney+ Dual Subtitles content script loaded");

let extensionConfig = {
  enabled: true,
  primaryLang: 'en',
  secondaryLang: 'zh',
  primaryColor: '#ffffff',
  primaryBg: 'transparent',
  primarySize: 32,
  primaryBold: true,
  secondaryColor: '#ffcc00',
  secondaryBg: 'transparent',
  secondarySize: 24,
  secondaryBold: true
};

let subtitleLangMap = {}; // Maps key (e.g. "en-cc") -> {url, lang, name, isCC, isForced}
let m3u8ContentCache = {}; // Cache for .m3u8 text contents
// Helper for rate limiting
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let primarySubs = []; // Array of parsed chunks: {start, end, text}
let secondarySubs = [];
let videoElement = null;
let subtitleOverlay = null;

let subtitleBaseUrls = {
  primary: [],
  secondary: []
};

// Unique key for metadata caching
function getVideoId() {
  const match = location.href.match(/\/video\/([a-zA-Z0-9-]+)/);
  if (match) return match[1];
  // Fallback to the whole path or hash if it's a specific router structure
  return location.pathname + location.hash;
}

let lastUrl = location.href;
window.disneyDualIntervals = window.disneyDualIntervals || [];

function clearAllIntervals() {
  window.disneyDualIntervals.forEach(id => clearInterval(id));
  window.disneyDualIntervals = [];
}

function resetSubtitleState() {
  console.log("Disney+ Dual Subtitles: Resetting state for new video...");
  primarySubs = [];
  secondarySubs = [];
  subtitleLangMap = {};
  processedSegments.clear();
  subtitleBaseUrls = { primary: [], secondary: [] };
  if (window.disneySegmentOffsets) window.disneySegmentOffsets = {};

  if (subtitleOverlay) {
    subtitleOverlay.style.visibility = 'hidden';
    const prim = subtitleOverlay.querySelector('#disney-dual-primary');
    const sec = subtitleOverlay.querySelector('#disney-dual-secondary');
    if (prim) prim.innerHTML = '';
    if (sec) sec.innerHTML = '';
  }

  // Load from cache if available
  const videoId = getVideoId();
  chrome.storage.local.get(['subtitleCache'], (data) => {
    const cache = data.subtitleCache || {};
    if (cache[videoId]) {
      console.log("Disney+ Dual Subtitles: Restoring subtitle map from cache for", videoId);
      Object.assign(subtitleLangMap, cache[videoId].map);
      
      // Map keys are now composite (lang-type), still save them for popup
      chrome.storage.local.set({ detectedLanguages: Object.keys(subtitleLangMap) });
    }
  });
}

// Inject interceptor script into the main page
function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('js/inject.js');
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Initialize config
chrome.storage.sync.get(['enabled', 'primaryLang', 'secondaryLang',
  'primaryColor', 'primaryBg', 'primarySize', 'primaryBold',
  'secondaryColor', 'secondaryBg', 'secondarySize', 'secondaryBold'], (data) => {
    if (data) Object.assign(extensionConfig, data);
    if (extensionConfig.enabled) {
      initDualSubtitles();
    }
  });

function applyCurrentStyles() {
  if (!subtitleOverlay) return;
  const prim = subtitleOverlay.querySelector('#disney-dual-primary');
  const sec = subtitleOverlay.querySelector('#disney-dual-secondary');

  const applyTo = (el, color, bg, size, bold) => {
    if (!el) return;
    el.style.setProperty('color', color, 'important');
    // If background is purely black hex from a "transparent" default or #000000, 
    // we might need to decide if user wants transparency.
    // For now, if we saved it as 'transparent' or they didn't change it, use transparent.
    const finalBg = (bg === '#000000' || bg === 'transparent') ? 'transparent' : bg;
    el.style.setProperty('background-color', finalBg, 'important');
    el.style.setProperty('font-size', size + 'px', 'important');
    el.style.setProperty('font-weight', bold ? 'bold' : 'normal', 'important');
  };

  applyTo(prim, extensionConfig.primaryColor, extensionConfig.primaryBg, extensionConfig.primarySize, extensionConfig.primaryBold);
  applyTo(sec, extensionConfig.secondaryColor, extensionConfig.secondaryBg, extensionConfig.secondarySize, extensionConfig.secondaryBold);
}

// Listen for messages from injected script
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.type !== 'DISNEY_SUB_INTERCEPT') {
    return;
  }

  const { url, lang, isMaster, subtitlesMap } = event.data;
  console.log("Disney+ Dual Subtitles: Intercepted raw track", lang, typeof url === 'string' ? url.substring(0, 100) + '...' : '');

  // If this is a master mapping
  if (subtitlesMap) {
    console.log("Disney+ Dual Subtitles: Got master subtitle map!", Object.keys(subtitlesMap));
    resetSubtitleState();
    Object.assign(subtitleLangMap, subtitlesMap);

    // Save detected languages for the popup
    chrome.storage.local.set({ detectedLanguages: Object.keys(subtitleLangMap) });

    // Build/Update persistent cache
    const videoId = getVideoId();
    chrome.storage.local.get(['subtitleCache'], (data) => {
      let cache = data.subtitleCache || {};
      cache[videoId] = {
        map: subtitleLangMap,
        timestamp: Date.now()
      };

      // Limit to last 10 videos
      const keys = Object.keys(cache);
      if (keys.length > 10) {
        const sortedKeys = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
        delete cache[sortedKeys[0]]; // Remove oldest
      }

      chrome.storage.local.set({ subtitleCache: cache });
      console.log("Disney+ Dual Subtitles: Metadata cached for video", videoId);
    });

    if (extensionConfig.enabled) {
      // Load Primary
      if (extensionConfig.primaryLang !== 'none') {
        const keys = Object.keys(subtitleLangMap);
        let primaryKey = keys.find(k => k === extensionConfig.primaryLang);
        if (!primaryKey) primaryKey = keys.find(k => k.startsWith(extensionConfig.primaryLang + '-'));
        if (!primaryKey) primaryKey = keys.find(k => k.startsWith(extensionConfig.primaryLang));

        if (primaryKey) {
          loadSubtitleTarget(subtitleLangMap[primaryKey], 'primary');
        }
      }

      // Load Secondary
      if (extensionConfig.secondaryLang !== 'none') {
        const keys = Object.keys(subtitleLangMap);
        let secondaryKey = keys.find(k => k === extensionConfig.secondaryLang);
        if (!secondaryKey) secondaryKey = keys.find(k => k.startsWith(extensionConfig.secondaryLang + '-'));
        if (!secondaryKey) secondaryKey = keys.find(k => k.startsWith(extensionConfig.secondaryLang));

        if (secondaryKey) {
          loadSubtitleTarget(subtitleLangMap[secondaryKey], 'secondary');
        }
      }
    }
    return;
  }

  if (lang && lang !== 'unknown') {
    // If it's a fallback detection (single segment), use it as 'normal' type if not already present
    const key = `${lang}-normal`;
    if (!subtitleLangMap[key]) {
        subtitleLangMap[key] = { url, lang, name: '', isCC: false, isForced: false };
    }
  }

  if (extensionConfig.enabled) {
    let target = null;
    // Try exact match first, then fallback to startsWith
    if (lang !== 'unknown') {
      const keys = Object.keys(subtitleLangMap);
      // Try exact key first
      let targetKey = keys.find(k => k === extensionConfig.secondaryLang);
      if (!targetKey) targetKey = keys.find(k => k === extensionConfig.primaryLang);
      
      // Fallback to lang code logic
      if (!targetKey) {
          if (lang === extensionConfig.secondaryLang || lang.startsWith(extensionConfig.secondaryLang)) target = 'secondary';
          else if (lang === extensionConfig.primaryLang || lang.startsWith(extensionConfig.primaryLang)) target = 'primary';
      } else {
          target = (targetKey === extensionConfig.secondaryLang) ? 'secondary' : 'primary';
      }
    }

    if (!target && url.includes('.vtt')) {
      // Fallback: match by Base URL if lang is "unknown" or "seg"
      if (subtitleBaseUrls.primary.some(base => url.startsWith(base))) target = 'primary';
      else if (subtitleBaseUrls.secondary.some(base => url.startsWith(base))) target = 'secondary';
    }

    if (target) {
      if (url.includes('.vtt')) {
        fetchAndAppendSegment(url, target);
      } else {
        loadSubtitleTarget(url, target);
      }
    }
  }
});

// Periodic URL check to handle SPA navigation
setInterval(() => {
  if (location.href !== lastUrl) {
    console.log("Disney+ Dual Subtitles: URL changed, resetting...");
    lastUrl = location.href;
    resetSubtitleState();
  }
}, 2000);

let processedSegments = new Set();

async function fetchAndAppendSegment(url, target = 'secondary') {
  if (processedSegments.has(url)) return;
  processedSegments.add(url);

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const text = await res.text();

    // Determine the timeline offset
    // Priority 1: Check the global offset map (hydrated by M3U8 parsing)
    let timelineOffset = 0;
    if (window.disneySegmentOffsets && window.disneySegmentOffsets[url] !== undefined) {
      timelineOffset = window.disneySegmentOffsets[url];
    }

    // Parse VTT (passing null for timelineOffset forces it to check MPEGTS headers if our map failed)
    const newCues = parseVTT(text, timelineOffset, url);

    const targetArray = target === 'primary' ? primarySubs : secondarySubs;
    for (const cue of newCues) {
      if (!targetArray.some(existing => Math.abs(existing.start - cue.start) < 0.1)) {
        targetArray.push(cue);
      }
    }
    targetArray.sort((a, b) => a.start - b.start);
  } catch (err) {
    console.error(`Failed to load VTT segment for ${target}:`, err);
  }
}

// Listen for config changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.enabled) extensionConfig.enabled = changes.enabled.newValue;
    if (changes.primaryLang) {
      extensionConfig.primaryLang = changes.primaryLang.newValue;
      if (extensionConfig.primaryLang === 'none') {
        primarySubs = [];
      } else {
        const targetLang = Object.keys(subtitleLangMap).find(k => k.startsWith(extensionConfig.primaryLang));
        if (targetLang) {
          loadSubtitleTarget(subtitleLangMap[targetLang], 'primary');
        } else {
          primarySubs = [];
        }
      }
    }
    if (changes.secondaryLang) {
      extensionConfig.secondaryLang = changes.secondaryLang.newValue;
      if (extensionConfig.secondaryLang === 'none') {
        secondarySubs = [];
      } else {
        const targetLang = Object.keys(subtitleLangMap).find(k => k.startsWith(extensionConfig.secondaryLang));
        if (targetLang) {
          loadSubtitleTarget(subtitleLangMap[targetLang], 'secondary');
        } else {
          secondarySubs = [];
        }
      }
    }

    // Handle styling changes
    const styleKeys = [
      'primaryColor', 'primaryBg', 'primarySize', 'primaryBold',
      'secondaryColor', 'secondaryBg', 'secondarySize', 'secondaryBold'
    ];
    let styleChanged = false;
    styleKeys.forEach(key => {
      if (changes[key]) {
        extensionConfig[key] = changes[key].newValue;
        styleChanged = true;
      }
    });
    if (styleChanged) {
      applyCurrentStyles();
    }

    if (extensionConfig.enabled) {
      initDualSubtitles();
    } else {
      cleanupSubtitles();
    }
  }
});

function initDualSubtitles() {
  console.log("Initializing dual subtitles for Disney+...");
  injectScript();
  injectHideNativeCSS();
  setupSync();
}

function injectHideNativeCSS() {
  if (document.getElementById('disney-dual-hide-native')) return;
  const style = document.createElement('style');
  style.id = 'disney-dual-hide-native';
  // Attempt to hide standard Disney subtitle containers. 
  // Disney's CSS classes change, but they often use track-text or dss-subtitle
  style.textContent = `
    .dss-subtitle-container { display: none !important; opacity: 0 !important; visibility: hidden !important; }
    ::cue { color: transparent !important; background: transparent !important; text-shadow: none !important; }
  `;
  document.head.appendChild(style);
}

async function loadSubtitleTarget(targetInput, target = 'secondary', skipClear = false) {
  // targetInput can be a URL string (backward compat) or our new metadata object
  const url = typeof targetInput === 'string' ? targetInput : targetInput?.url;
  if (!url) return;

  console.log(`Disney+ Dual Subtitles: Loading ${target} subtitles (skipClear=${skipClear}) for language [${target === 'primary' ? extensionConfig.primaryLang : extensionConfig.secondaryLang}] from:`, url);

  if (!skipClear) {
    // Clear processedSegments for this target so it can be re-loaded if switched back
    const currentBases = subtitleBaseUrls[target] || [];
    for (const segUrl of processedSegments) {
      if (currentBases.some(base => segUrl.startsWith(base))) {
        processedSegments.delete(segUrl);
      }
    }

    // Clear existing state for this target to prevent mixing languages
    if (target === 'primary') {
      primarySubs = [];
      subtitleBaseUrls.primary = [];
    } else {
      secondarySubs = [];
      subtitleBaseUrls.secondary = [];
    }
  }

  // Store the base URL to identify segment requests later
  try {
    const base = url.substring(0, url.lastIndexOf('/') + 1);
    if (!subtitleBaseUrls[target].includes(base)) {
      subtitleBaseUrls[target].push(base);
    }
  } catch (e) { }

  try {
    let text;
    if (m3u8ContentCache[url]) {
      text = m3u8ContentCache[url];
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Network response was not ok");
      text = await res.text();
      if (url.includes('.m3u8')) m3u8ContentCache[url] = text;
    }

    if (url.includes('.m3u8')) {
      // Pass the intended language to parseM3u8 for cancellation check
      const intendedLang = target === 'primary' ? extensionConfig.primaryLang : extensionConfig.secondaryLang;
      await parseM3u8(url, text, target, intendedLang);
    } else {
      if (target === 'primary') {
        primarySubs = parseVTT(text, 0, url);
      } else {
        secondarySubs = parseVTT(text, 0, url);
      }
    }
  } catch (err) {
    console.error(`Failed to load ${target} subtitles:`, err);
  }
}

async function parseM3u8(baseUrl, m3u8Text, target = 'secondary', intendedLang = null) {
  const lines = m3u8Text.split('\n');
  const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  let segmentList = [];
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      // Parse duration (e.g. "#EXTINF:10.000,")
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;

      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === '' || lines[j].trim().startsWith('#'))) {
        j++;
      }
      if (j < lines.length) {
        const urlLine = lines[j].trim();
        const url = urlLine.startsWith('http') ? urlLine : basePath + urlLine;
        segmentList.push({ url, offset: currentOffset });
        currentOffset += duration;
        i = j;
      }
    }
  }

  console.log(`Disney+ Dual Subtitles: Found ${segmentList.length} VTT segments for ${target}. Total duration: ${currentOffset.toFixed(1)}s. Starting download...`);

  if (!window.disneySegmentOffsets) window.disneySegmentOffsets = {};
  for (const seg of segmentList) {
    // Correcting the offset map to use the real segment offset from M3U8
    window.disneySegmentOffsets[seg.url] = seg.offset;
  }

  let allCues = [];
  let segmentsProcessed = 0;
  let emptySegments = 0;

  // Priority sorting: segments AFTER current time first, then segments before.
  const video = getActiveVideo();
  const currentTime = video ? (video.currentTime - (window.disneyStableOffset || 0) - (window.disneyDualSubDelay || 0)) : 0;

  // Priority sorting: segments NEAREST to current playback time first.
  const sortedSegments = [...segmentList].sort((a, b) => {
    const distA = Math.abs(a.offset - currentTime);
    const distB = Math.abs(b.offset - currentTime);
    return distA - distB;
  });

  // Unique ID for this download task to allow interruptions on seek
  const taskId = Math.random().toString(36).substring(7);
  if (target === 'primary') window.lastPrimaryTaskId = taskId;
  else window.lastSecondaryTaskId = taskId;

  for (const segment of sortedSegments) {
    // Cancellation check: Language switch
    const currentLabel = target === 'primary' ? extensionConfig.primaryLang : extensionConfig.secondaryLang;
    if (intendedLang && currentLabel !== intendedLang) {
      console.log(`Disney+ Dual Subtitles: Cancellation triggered for ${target} [${intendedLang} -> ${currentLabel}]. Stopping.`);
      return;
    }

    // Cancellation check: Reprioritization (Seek)
    const lastId = target === 'primary' ? window.lastPrimaryTaskId : window.lastSecondaryTaskId;
    if (lastId !== taskId) {
      console.log(`Disney+ Dual Subtitles: Reprioritization triggered for ${target}. Stopping old task.`);
      return;
    }

    if (processedSegments.has(segment.url)) continue;

    // Delay for rate limiting
    await sleep(50);

    try {
      // Double check processed map after sleep to avoid race
      if (processedSegments.has(segment.url)) continue;
      processedSegments.add(segment.url);

      const segRes = await fetch(segment.url);
      const segText = await segRes.text();

      const cues = parseVTT(segText, segment.offset, segment.url);
      if (cues.length === 0) {
        emptySegments++;
        // Low-level log for developers to see it's intentional
        // console.log(`Disney+ Dual Subtitles: Segment ${segment.url} is empty (Normal for Forced tracks).`);
      }
      allCues = allCues.concat(cues);

      segmentsProcessed++;
      
      // Partial flush to show subtitles as they download
      if (segmentsProcessed === 1 || segmentsProcessed % 5 === 0) {
        const targetArray = target === 'primary' ? primarySubs : secondarySubs;
        let addedCount = 0;
        for (const c of allCues) {
          if (!targetArray.some(e => Math.abs(e.start - c.start) < 0.1)) {
            targetArray.push(c);
            addedCount++;
          }
        }
        targetArray.sort((a, b) => a.start - b.start);
        if (addedCount > 0) {
          console.log(`Disney+ Dual Subtitles: Loaded ${addedCount} new cues for ${target} (Total: ${targetArray.length})`);
        }
        allCues = []; // Clear buffer once pushed
      }
    } catch (e) {
      console.error(`Failed to fetch VTT segment for ${target}:`, e);
    }
  }

  if (allCues.length > 0) {
    const targetArray = target === 'primary' ? primarySubs : secondarySubs;
    let addedCount = 0;
    for (const c of allCues) {
      if (!targetArray.some(e => Math.abs(e.start - c.start) < 0.1)) {
        targetArray.push(c);
        addedCount++;
      }
    }
    targetArray.sort((a, b) => a.start - b.start);
    if (addedCount > 0) {
      console.log(`Disney+ Dual Subtitles: Final flush: Loaded ${addedCount} cues for ${target} (Total: ${targetArray.length})`);
    }
  }

  // After processing everything (or a large chunk), check if it's suspiciously empty or has content
  const targetArray = target === 'primary' ? primarySubs : secondarySubs;
  const langKey = target === 'primary' ? extensionConfig.primaryLang : extensionConfig.secondaryLang;
  const videoId = getVideoId();

  if (videoId && langKey) {
    chrome.storage.local.get(['subtitleCache'], (data) => {
        const cache = data.subtitleCache || {};
        if (cache[videoId] && cache[videoId].map && cache[videoId].map[langKey]) {
            const currentObj = cache[videoId].map[langKey];
            
            // If we found cues, ensure isEmpty is false
            if (targetArray.length > 0 && currentObj.isEmpty) {
                currentObj.isEmpty = false;
                chrome.storage.local.set({ subtitleCache: cache });
                console.log(`Disney+ Dual Subtitles: [Info] Track [${langKey}] is no longer empty. Clearing flag.`);
            } 
            // If still empty after a significant number of segments, set isEmpty
            else if (segmentsProcessed > 5 && targetArray.length === 0 && !currentObj.isEmpty) {
                currentObj.isEmpty = true;
                chrome.storage.local.set({ subtitleCache: cache });
                console.warn(`Disney+ Dual Subtitles: [Warning] Track [${langKey}] is entirely empty after ${segmentsProcessed} segments. Flagging as empty.`);
            }
        }
    });
  }

  console.log(`Disney+ Dual Subtitles: Finished loading all ${target} segments.`);
}

function parseVTT(vttData, timelineOffset = 0, sourceUrl = null) {
  const cues = [];

  // Parse X-TIMESTAMP-MAP to find the MPEGTS anchor if present
  // Example: X-TIMESTAMP-MAP=MPEGTS:1791000,LOCAL:00:00:00.000
  let mpegtsValue = null;
  let localValue = 0;

  const headerMatch = vttData.match(/X-TIMESTAMP-MAP=MPEGTS:(\d+),LOCAL:([\d:.]+)/);
  if (headerMatch) {
    mpegtsValue = parseInt(headerMatch[1]) / 90000; // 90kHz clock
    localValue = timeStrToSeconds(headerMatch[2]);
  }

  // Check for absolute MPEGTS anchor
  if (mpegtsValue !== null) {
    // In a perfectly synced world, mpegtsValue - localValue should be 0 for absolute VTTs
    // on the Disney+ timeline. If it's not, it's a drift adjustment.
    const driftAdjustment = mpegtsValue - localValue;

    if (Math.abs(driftAdjustment) > 0.1) {
      // Log drift but don't force-offset yet as it's often small/jitter
      // console.log(`Disney+ Dual Subtitles: [Anchoring] Drift for ${sourceUrl}: ${driftAdjustment.toFixed(3)}s`);
    }

    // If we were given a timelineOffset (e.g. from M3U8), and it conflicts, log it
    if (timelineOffset !== 0 && Math.abs(timelineOffset - driftAdjustment) > 0.1) {
      // console.log(`Disney+ Dual Subtitles: [Anchoring] Mapping conflict for ${sourceUrl}: M3U8 (${timelineOffset.toFixed(1)}s) vs VTT-Header (${driftAdjustment.toFixed(1)}s).`);
    }
  }

  const blocks = vttData.split(/(?:\r?\n){2,}/);
  
  // Peak at first cue to decide if VTT is absolute
  let isAbsolute = false;
  const firstCueMatch = vttData.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) -->/);
  if (firstCueMatch) {
    const firstStart = timeStrToSeconds(firstCueMatch[1]);
    // If first cue starts mid-way (e.g. at 5 mins) and segment offset is also large,
    // it's likely an absolute VTT file.
    if (firstStart > 10 && timelineOffset > 10 && Math.abs(firstStart - timelineOffset) < 120) {
      isAbsolute = true;
    }
  }

  for (let block of blocks) {
    const lines = block.trim().split(/\r?\n/);

    const firstLine = lines[0].trim();
    if (firstLine.includes('WEBVTT') || firstLine.includes('X-TIMESTAMP-MAP') ||
        firstLine.startsWith('STYLE') || firstLine.startsWith('NOTE')) {
      continue;
    }

    let timeLineIdx = lines.findIndex(l => l.includes('-->'));
    if (timeLineIdx !== -1) {
      const timeParts = lines[timeLineIdx].split('-->');
      const startStr = timeParts[0].trim();
      const endStr = timeParts[1].trim().split(' ')[0];

      const text = lines.slice(timeLineIdx + 1)
        .join(' ')
        .replace(/<\/?[^>]+(>|$)/g, "")
        .trim();

      const localStart = timeStrToSeconds(startStr);
      const localEnd = timeStrToSeconds(endStr);

      const finalOffset = isAbsolute ? 0 : (timelineOffset || 0);
      cues.push({
        start: localStart + finalOffset,
        end: localEnd + finalOffset,
        text: text,
        source: sourceUrl ? sourceUrl.split('/').pop() : 'inline'
      });
    }
  }
  return cues;
}

function timeStrToSeconds(timeStr) {
  const parts = timeStr.split(':');
  let seconds = 0;
  if (parts.length === 3) {
    // HH:MM:SS.mmm
    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    // MM:SS.mmm
    seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return seconds;
}

function findCueWithPersistence(subs, time) {
  if (!subs || subs.length === 0) return null;

  // 1. Strict match
  const cue = subs.find(c => time >= c.start && time <= c.end);
  if (cue) return cue;

  // 2. Persistence / Gap Bridging (150ms)
  // Look for a cue that just ended but we are still within a small grace period.
  // This prevents "flicker" when primary/secondary timestamps are slightly off.
  const gracePeriod = 0.300; // 300ms
  const recentCue = subs.find(c => time > c.end && time <= (c.end + gracePeriod));

  // Only use persistence if the NEXT cue hasn't started yet
  if (recentCue) {
    const nextCue = subs.find(c => c.start > recentCue.end);
    if (nextCue && time >= nextCue.start) {
      return null; // Next one started, drop persistence
    }
    return recentCue;
  }

  return null;
}

function getActiveVideo() {
  const vids = Array.from(document.querySelectorAll('video'));
  if (vids.length === 0) return null;

  let bestVid = vids[0];
  let maxScore = -1;

  vids.forEach((vid, idx) => {
    const rect = vid.getBoundingClientRect();
    const area = rect.width * rect.height;
    let score = area;
    if (rect.width < 300) score -= 1000000;
    if (!vid.paused) score += 500000;
    if (score > maxScore) {
      maxScore = score;
      bestVid = vid;
    }
  });
  return bestVid;
}

function guessUITime() {
  // Priority 1: Shadow DOM Slider (Modern Disney+ UI)
  try {
    const playerUI = document.querySelector("disney-web-player-ui");
    const progressBar = playerUI ? playerUI.querySelector("progress-bar") : null;
    if (progressBar && progressBar.shadowRoot) {
      const ariaEl = progressBar.shadowRoot.querySelector("[aria-valuenow]");
      if (ariaEl) {
        const val = parseFloat(ariaEl.ariaValueNow || ariaEl.getAttribute('aria-valuenow'));
        if (!isNaN(val)) return val;
      }
    }
  } catch (e) { /* silent fail */ }

  // Priority 2: High-precision slider attribute (aria-valuenow on Disney+ slider)
  const slider = document.querySelector('.slider-container');
  if (slider && slider.getAttribute('aria-valuenow')) {
    const sliderValue = parseFloat(slider.getAttribute('aria-valuenow'));
    if (!isNaN(sliderValue)) return sliderValue;
  }

  // Reference logic from user snippet: document.querySelector("div[class='slider-container']").ariaValueNow
  const sliderDiv = document.querySelector("div[class='slider-container']");
  if (sliderDiv && sliderDiv.ariaValueNow) {
    const val = parseFloat(sliderDiv.ariaValueNow);
    if (!isNaN(val)) return val;
  }

  // Priority 3: DOM scraping for text (fallback when slider is missing/unpopulated)
  const timeElements = document.querySelectorAll('[class*="time" i], [data-testid*="time" i], span, div');
  for (let el of timeElements) {
    if (el.children.length > 0) continue;
    const text = el.innerText ? el.innerText.trim() : "";
    if (text && /^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(text)) {
      return timeStrToSeconds(text);
    }
  }
  return null;
}

function findNativeSubtitleText() {
  // Disney+ uses containers like .dss-subtitle-container or .shaka-text-container
  // We look for any text content in these areas (even though we hide them)
  const containers = document.querySelectorAll('.dss-subtitle-container, .shaka-text-container, [class*="subtitle-container" i]');
  let fullText = "";
  for (const container of containers) {
    // We want the actual text being rendered
    const text = container.innerText ? container.innerText.trim() : "";
    if (text) {
      fullText += (fullText ? " " : "") + text;
    }
  }
  // Clean up for matching (normalize spaces)
  return fullText.replace(/\s+/g, " ").trim();
}

function setupSync() {
  if (videoElement) return; // Already setup

  console.log("Disney+ Dual Subtitles: Setting up sync...");

  // We need to poll to find the video element since Disney+ is a client side rendered app
  const findVideoTimer = setInterval(() => {
    const vid = document.querySelector('video');
    if (vid) {
      console.log("Disney+ Dual Subtitles: Found video element!");
      clearInterval(findVideoTimer);
      // Remove from tracking if it was there
      window.disneyDualIntervals = window.disneyDualIntervals.filter(id => id !== findVideoTimer);

      videoElement = vid;

      // Handle re-prioritization on seek
      videoElement.addEventListener('seeked', () => {
        console.log("Disney+ Dual Subtitles: Seek detected. Re-prioritizing downloads...");
        if (extensionConfig.enabled) {
          Object.keys(subtitleLangMap).forEach(lang => {
            if (lang === extensionConfig.primaryLang || lang.startsWith(extensionConfig.primaryLang)) {
              loadSubtitleTarget(subtitleLangMap[lang], 'primary', true);
            }
            if (lang === extensionConfig.secondaryLang || lang.startsWith(extensionConfig.secondaryLang)) {
              loadSubtitleTarget(subtitleLangMap[lang], 'secondary', true);
            }
          });
        }
      });

      // Create subtitle container
      if (!subtitleOverlay) {
        subtitleOverlay = document.createElement('div');
        subtitleOverlay.className = 'disney-dual-subtitles-container';

        // Force inline styles in case Disney+ CSS overrides our external stylesheet
        subtitleOverlay.style.cssText = `
          position: fixed !important;
          bottom: 10% !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 80% !important;
          text-align: center !important;
          pointer-events: none !important;
          z-index: 2147483647 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 2px !important;
        `;

        const primaryText = document.createElement('div');
        primaryText.id = 'disney-dual-primary';
        primaryText.className = 'disney-dual-subtitles-text primary';
        primaryText.style.cssText = `
          font-family: inherit !important;
          padding: 0px 4px !important;
          border-radius: 4px !important;
          text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 0px 4px rgba(0,0,0,0.8) !important;
          visibility: hidden;
          min-height: 2.5em !important; /* Fixed height for 2 lines */
          display: flex !important;
          align-items: flex-end !important; /* Align to bottom of slot */
          justify-content: center !important;
        `;

        const secondaryText = document.createElement('div');
        secondaryText.id = 'disney-dual-secondary';
        secondaryText.className = 'disney-dual-subtitles-text secondary';
        secondaryText.style.cssText = `
          font-family: inherit !important;
          padding: 0px 4px !important;
          border-radius: 4px !important;
          text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 0px 4px rgba(0,0,0,0.8) !important;
          visibility: hidden;
          min-height: 2.5em !important; /* Fixed height for 2 lines */
          display: flex !important;
          align-items: flex-start !important; /* Align to top of slot */
          justify-content: center !important;
        `;

        subtitleOverlay.appendChild(primaryText);
        subtitleOverlay.appendChild(secondaryText);

        applyCurrentStyles();

        console.log("Disney+ Dual Subtitles: Appending subtitle overlay to document.body");
        document.body.appendChild(subtitleOverlay);
      }

      // Handle cases where Disney+ navigates away and destroys the video or our overlay
      const enforceOverlayId = setInterval(() => {
        const activeVid = getActiveVideo();
        if (!activeVid) {
          if (subtitleOverlay) subtitleOverlay.style.visibility = 'hidden';
          return;
        }

        // Determine where the overlay should live (fullscreen support)
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        const targetParent = fsElement ? activeVid.parentElement : document.body;

        if (subtitleOverlay && subtitleOverlay.parentElement !== targetParent) {
          console.log("Disney+ Dual Subtitles: Moving overlay to correct container for visibility...");
          targetParent.appendChild(subtitleOverlay);

          // Adjust styles for fullscreen parent
          if (fsElement) {
            subtitleOverlay.style.position = 'absolute';
            subtitleOverlay.style.bottom = '15%';
          } else {
            subtitleOverlay.style.position = 'fixed';
            subtitleOverlay.style.bottom = '10%';
          }
        }

        const debugBox = document.getElementById('disney-dual-debug-box');
        if (debugBox && !document.body.contains(debugBox)) {
          document.body.appendChild(debugBox);
        }

        const currentVids = document.querySelectorAll('video');
        let timeText = `VIDEOS FOUND: ${currentVids.length}<br>`;
        currentVids.forEach((vid, idx) => {
          timeText += `Vid ${idx}: ${vid.currentTime.toFixed(2)}s<br>`;
        });

        if (debugBox) {
          debugBox.innerHTML = timeText;
        }
      }, 500);
      window.disneyDualIntervals.push(enforceOverlayId);

      let lastPrimText = "";
      let lastSecText = "";
      let lastLogTime = 0;

      // Add manual sync variables and keydown listener
      if (typeof window.disneyDualSubDelay === 'undefined') {
        window.disneyDualSubDelay = 0;
        document.addEventListener('keydown', (e) => {
          if (e.key === '[' || e.key === ']') {
            if (e.key === '[') window.disneyDualSubDelay -= 0.5; // shift earlier
            if (e.key === ']') window.disneyDualSubDelay += 0.5; // shift later

            // Show a temporary toast
            let toast = document.getElementById('disney-dual-toast');
            if (!toast) {
              toast = document.createElement('div');
              toast.id = 'disney-dual-toast';
              toast.style.cssText = `
                          position: fixed !important; top: 15% !important; left: 50% !important; transform: translateX(-50%) !important;
                          background: rgba(0, 0, 0, 0.8) !important; color: white !important; padding: 10px 20px !important;
                          border-radius: 5px !important; z-index: 2147483647 !important; font-size: 24px !important; font-weight: bold !important;
                          pointer-events: none !important; transition: opacity 0.3s !important; text-align: center !important;
                      `;
              document.body.appendChild(toast);
            }

            const labelDelayed = chrome.i18n.getMessage('delayed');
            const labelAdvanced = chrome.i18n.getMessage('advanced');
            const delayLabel = window.disneyDualSubDelay > 0 ? `+${window.disneyDualSubDelay.toFixed(1)}s (${labelDelayed})` :
              window.disneyDualSubDelay < 0 ? `${window.disneyDualSubDelay.toFixed(1)}s (${labelAdvanced})` : `0.0s`;

            toast.innerText = chrome.i18n.getMessage('syncToast', [delayLabel]);
            toast.style.opacity = '1';

            if (window.disneyDualToastTimeout) clearTimeout(window.disneyDualToastTimeout);
            window.disneyDualToastTimeout = setTimeout(() => toast.style.opacity = '0', 2000);

            console.log(`Disney+ Dual Subtitles: Key pressed ${e.key}, manual delay adjusted to ${window.disneyDualSubDelay}s`);
          }
        }, true);
      }

      if (typeof window.disneyStableOffset === 'undefined') {
        window.disneyStableOffset = 20.0; // Default to 20s as observed
      }

      // Replace timeupdate listener with a direct polling interval
      const syncLoopId = setInterval(() => {
        if (!extensionConfig.enabled) return;

        const activeVideo = getActiveVideo();
        if (!activeVideo) {
          if (subtitleOverlay) subtitleOverlay.style.visibility = 'hidden';
          return;
        }

        // Continuously calibrate offset using high-precision UI time if available
        const uiTime = guessUITime();
        if (uiTime !== null) {
          const currentOffset = activeVideo.currentTime - uiTime;
          // Calibrate if we see a stable, plausible offset (usually 20.0s)
          // Fix jitter: Only snap on initial sync or large drifts (>2.0s)
          const isInitialSync = (Math.abs(window.disneyStableOffset - 20.0) < 0.01);
          if (isInitialSync || Math.abs(window.disneyStableOffset - currentOffset) > 2.0) {
            window.disneyStableOffset = currentOffset;
          }
        }

        let effectiveTime = activeVideo.currentTime - window.disneyStableOffset - window.disneyDualSubDelay;

        // Ensure effectiveTime isn't negative
        if (effectiveTime < 0) effectiveTime = 0;

        // Log every 5 seconds
        if (activeVideo.currentTime - lastLogTime > 5 || activeVideo.currentTime < lastLogTime) {
          function formatTime(s) {
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${sec.toString().padStart(2, '0')}`;
          }
          const primCue = primarySubs.find(cue => effectiveTime >= cue.start && effectiveTime <= cue.end);
          const secCue = secondarySubs.find(cue => effectiveTime >= cue.start && effectiveTime <= cue.end);
          const sourceInfo = primCue ? ` [P: ${primCue.source}]` : (secCue ? ` [S: ${secCue.source}]` : "");

          console.log(`Disney+ Dual Subtitles: [Sync] Video: ${activeVideo.currentTime.toFixed(1)}s, Baseline: ${window.disneyStableOffset.toFixed(1)}s, Effective: ${formatTime(effectiveTime)} (${effectiveTime.toFixed(1)}s)${sourceInfo}`);
          lastLogTime = activeVideo.currentTime;
        }

        const overlayPrimary = subtitleOverlay.querySelector('.primary');
        const overlaySecondary = subtitleOverlay.querySelector('.secondary');

        // Handle Primary
        let currentPrimText = "";
        let primCue = findCueWithPersistence(primarySubs, effectiveTime);

        // [Visual Snap Fallback]
        if (!primCue) {
          const nativeText = findNativeSubtitleText();
          if (nativeText && nativeText.length > 3) {
            const match = primarySubs.find(cue => {
              const cleanCueText = cue.text.replace(/<br>/g, " ").replace(/\s+/g, " ").trim();
              return cleanCueText.toLowerCase().includes(nativeText.toLowerCase()) ||
                nativeText.toLowerCase().includes(cleanCueText.toLowerCase());
            });

            if (match) {
              const midPoint = (match.start + match.end) / 2;
              const desiredOffset = activeVideo.currentTime - midPoint - window.disneyDualSubDelay;

              if (Math.abs(window.disneyStableOffset - desiredOffset) > 0.5 && Math.abs(window.disneyStableOffset - desiredOffset) < 60) {
                console.log(`Disney+ Dual Subtitles: [Visual Snap] Matched native text "${nativeText}". recalibrating baseline: ${window.disneyStableOffset.toFixed(1)}s -> ${desiredOffset.toFixed(1)}s`);
                window.disneyStableOffset = desiredOffset;
                effectiveTime = activeVideo.currentTime - window.disneyStableOffset - window.disneyDualSubDelay;
                primCue = match;
              }
            }
          }
        }

        if (primCue) {
          currentPrimText = primCue.text;
          overlayPrimary.innerHTML = currentPrimText;
          overlayPrimary.style.visibility = 'visible';
        } else {
          overlayPrimary.innerHTML = "&nbsp;"; // Maintain height
          overlayPrimary.style.visibility = 'hidden';
        }

        // Handle Secondary
        let currentSecText = "";
        const secCue = findCueWithPersistence(secondarySubs, effectiveTime);
        if (secCue) {
          currentSecText = secCue.text;
          overlaySecondary.innerHTML = currentSecText;
          overlaySecondary.style.visibility = 'visible';
        } else {
          overlaySecondary.innerHTML = "&nbsp;"; // Maintain height
          overlaySecondary.style.visibility = 'hidden';
        }

        if (currentPrimText !== lastPrimText || currentSecText !== lastSecText) {
          lastPrimText = currentPrimText;
          lastSecText = currentSecText;
        }
      }, 100); // end syncLoopId
      window.disneyDualIntervals.push(syncLoopId);
    }
  }, 1000); // end findVideoTimer
  window.disneyDualIntervals.push(findVideoTimer);
}

function cleanupSubtitles() {
  console.log("Cleaning up dual subtitles...");
  clearAllIntervals();
  processedSegments.clear();
  if (subtitleOverlay) {
    subtitleOverlay.remove();
    subtitleOverlay = null;
  }
  const hideStyles = document.getElementById('disney-dual-hide-native');
  if (hideStyles) hideStyles.remove();

  primarySubs = [];
  secondarySubs = [];
  videoElement = null;
}
