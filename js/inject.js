// This script is injected into the main page to hook into the page's original XMLHttpRequest and fetch methods.
// Content scripts run in an isolated world and cannot intercept the page's network requests directly.

(function hookNetworkRequests() {
  console.log("Disney+ Dual Subtitles: Injector loaded, hooking network requests.");

  // Intercept XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.addEventListener('load', function() {
      const responseUrl = this.responseURL || url;
      // Depending on responseType, try to capture text
      let text = "";
      if (!this.responseType || this.responseType === "text" || this.responseType === "") {
        try { text = this.responseText; } catch(e) {}
      }
      checkTargetUrl(responseUrl, text);
    });
    return origOpen.apply(this, [method, url, ...rest]);
  };

  // Intercept Fetch
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const request = args[0];
    let url = "";

    if (typeof request === 'string') {
      url = request;
    } else if (request instanceof Request) {
      url = request.url;
    }

    const response = await origFetch.apply(this, args);
    let text = "";
    
    // Only clone and read text if it's a manifest to avoid performance impact
    if (url && (url.includes('.m3u8') || url.includes('/v1/hls/') || url.includes('/v1/dash/'))) {
       try {
         const clone = response.clone();
         text = await clone.text();
       } catch(e) {}
    }
    
    checkTargetUrl(response.url || url, text);
    
    return response;
  };

  function checkTargetUrl(url, responseText = "") {
    if (!url) return;

    if (url.includes('.vtt') || url.includes('.m3u8') || url.includes('/v1/hls/') || url.includes('/v1/dash/')) {
       let subtitlesMap = null;
       
       // If it's a master playlist, parse the text for subtitle mappings
       if (responseText && responseText.includes('#EXT-X-MEDIA:TYPE=SUBTITLES')) {
          subtitlesMap = parseMasterM3u8Subtitles(url, responseText);
       }
       
       const lang = extractLanguageFromUrl(url);
       const isMaster = url.includes('master') || url.includes('stream.m3u8') || subtitlesMap !== null;
       
       window.postMessage({
         type: 'DISNEY_SUB_INTERCEPT',
         url: url,
         lang: lang || 'unknown',
         isMaster: isMaster,
         subtitlesMap: subtitlesMap
       }, '*');
    }
  }

  function parseMasterM3u8Subtitles(baseUrl, text) {
     const map = {};
     // Example: #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub-main",NAME="Chinese (Simplified)",LANGUAGE="zh-Hans",AUTOSELECT=YES,FORCED=NO,CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog",URI="r/composite_zh-Hans_NORMAL_426fea06-308d-4bc1-aec4-8675f73f0cb6_84e1771a-3d45-4b7e-a735-02fbbd246b7e.m3u8"
     const lines = text.split('\n');
     const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
     
     for (const line of lines) {
         if (line.includes('TYPE=SUBTITLES') && line.includes('URI=')) {
             // Extract language: LANGUAGE="zh-Hans"
             const langMatch = line.match(/LANGUAGE="([^"]+)"/);
             // Extract URI: URI="r/..."
             const uriMatch = line.match(/URI="([^"]+)"/);
             
             if (langMatch && uriMatch) {
                 const lang = langMatch[1].toLowerCase();
                 // Resolve the full URI
                 const fullUri = uriMatch[1].startsWith('http') ? uriMatch[1] : basePath + uriMatch[1];
                 map[lang] = fullUri;
             }
         }
     }
     
     return Object.keys(map).length > 0 ? map : null;
  }

  function extractLanguageFromUrl(url) {
    // Attempt to extract the language code from the URL.
    // Disney+ URLs might have things like .../de/... or .../en/...
    // But in the user's example: .../subtitles_1/seg_00001.vtt
    // It doesn't have an obvious language code in the path provided.
    // Sometimes it's in the m3u8 playlist name.
    const match = url.match(/\/([a-z]{2}(?:-[A-Za-z]{2,4})?)(?:\/|_|-|\.)/i);
    // Blacklist common path fragments that are not language codes
    const blacklist = ['sub', 'seg', 'vtt', 'hls', 'dash', 'master', 'stream'];
    if (match && match[1] && match[1].length <= 5 && !blacklist.includes(match[1].toLowerCase())) {
      return match[1].toLowerCase();
    }
    
    // Check if there is a language param in search string if any
    try {
        const urlObj = new URL(url.startsWith('http') ? url : 'http://dummy.com' + url);
        if (urlObj.searchParams.has('lang')) {
            return urlObj.searchParams.get('lang');
        }
    } catch(e) {}

    return null;
  }
})();
