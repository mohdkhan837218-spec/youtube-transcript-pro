// YouTube Transcript Pro - Popup Controller (Manifest V3)

document.addEventListener('DOMContentLoaded', async () => {
  const detectedCard = document.getElementById('yt-detected-card');
  const notYtSection = document.getElementById('not-yt-section');
  const actionsSection = document.getElementById('actions-section');
  const videoTitleEl = document.getElementById('video-title');
  const videoMetaEl = document.getElementById('video-meta');

  const btnOpenPanel = document.getElementById('btn-open-panel');
  const btnTimestamps = document.getElementById('btn-quick-timestamps');
  const btnPlain = document.getElementById('btn-quick-plain');
  const btnOpenYt = document.getElementById('btn-open-youtube');
  const prefLangSelect = document.getElementById('pref-lang');
  const versionBadge = document.getElementById('popup-version-badge');

  // Quick Paste Elements
  const inputCustomUrl = document.getElementById('input-custom-url');
  const btnClearInput = document.getElementById('btn-clear-input');
  const btnPasteClipboard = document.getElementById('btn-paste-clipboard');
  const btnCustomCopyTs = document.getElementById('btn-custom-copy-ts');
  const btnCustomCopyPlain = document.getElementById('btn-custom-copy-plain');
  const pasteResultCard = document.getElementById('paste-result-card');
  const pasteResultThumb = document.getElementById('paste-result-thumb');
  const pasteResultTitle = document.getElementById('paste-result-title');
  const pasteResultBadge = document.getElementById('paste-result-badge');
  const pasteResultDur = document.getElementById('paste-result-dur');
  const btnOpenInStudio = document.getElementById('btn-open-in-studio');

  // Set version dynamically
  if (versionBadge && chrome.runtime?.getManifest) {
    versionBadge.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  function showToast(msg) {
    const toast = document.getElementById('popup-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // Load user settings
  const prefs = await chrome.storage.local.get(['defaultLanguage']);
  if (prefs.defaultLanguage && prefLangSelect) {
    prefLangSelect.value = prefs.defaultLanguage;
  }

  if (prefLangSelect) {
    prefLangSelect.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ defaultLanguage: e.target.value });
      showToast('Saved language preference! ✅');
    });
  }

  // Helper to extract video ID from any YouTube URL or string
  function extractVideoId(text) {
    if (!text) return null;
    const clean = text.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    const mWatch = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (mWatch) return mWatch[1];
    const mShorts = clean.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (mShorts) return mShorts[1];
    const mShortUrl = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (mShortUrl) return mShortUrl[1];
    const mEmbed = clean.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (mEmbed) return mEmbed[1];
    return null;
  }

  // Parse XML captions into segment objects
  function parsePopupSegments(rawXml) {
    const results = [];
    if (!rawXml) return results;

    const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(rawXml)) !== null) {
      const attrs = match[1];
      const body = match[2];
      const tMatch = attrs.match(/\bt="(\d+)"/i);
      if (!tMatch) continue;
      const startMs = parseInt(tMatch[1], 10);
      const dMatch = attrs.match(/\bd="(\d+)"/i);
      const durMs = dMatch ? parseInt(dMatch[1], 10) : 3000;

      let text = '';
      const sRegex = /<s[^>]*>([^<]*)<\/s>/gi;
      let sMatch;
      while ((sMatch = sRegex.exec(body)) !== null) {
        text += sMatch[1];
      }
      if (!text) text = body.replace(/<[^>]+>/g, '');
      text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (text) {
        const sec = Math.floor(startMs / 1000);
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        results.push({
          timeStr: `[${m}:${s}]`,
          text
        });
      }
    }

    if (results.length > 0) return results;

    const textRegex = /<text\b[^>]*\bstart="([^"]*)"[^>]*>([\s\S]*?)<\/text>/gi;
    while ((match = textRegex.exec(rawXml)) !== null) {
      const startSec = Math.floor(parseFloat(match[1]) || 0);
      let text = match[2].replace(/<[^>]+>/g, '');
      text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (text) {
        const m = Math.floor(startSec / 60).toString().padStart(2, '0');
        const s = (startSec % 60).toString().padStart(2, '0');
        results.push({
          timeStr: `[${m}:${s}]`,
          text
        });
      }
    }
    return results;
  }

  // Robustly extract "captionTracks": [...] from watch-page HTML (handles nested brackets)
  function extractCaptionTracks(html) {
    if (!html) return null;
    const key = '"captionTracks"';
    const keyIdx = html.indexOf(key);
    if (keyIdx === -1) return null;
    const arrStart = html.indexOf('[', keyIdx + key.length);
    if (arrStart === -1) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = arrStart; i < html.length; i++) {
      const ch = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(html.slice(arrStart, i + 1)); }
            catch (e) { return null; }
          }
        }
      }
    }
    return null;
  }

  // Safe clipboard writer with legacy fallback
  async function safeCopyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e2) {
        return false;
      }
    }
  }

  // Multi-tier transcript fetcher for Popup
  async function fetchPopupTranscriptData(vid, targetLang = null) {
    const lang = targetLang || (await chrome.storage.local.get(['defaultLanguage'])).defaultLanguage || 'hi';

    // 1. Try local server first (http://localhost:3000)
    try {
      const sResp = await fetch(`http://localhost:3000/api/transcript?videoId=${encodeURIComponent(vid)}&lang=${encodeURIComponent(lang)}`);
      if (sResp.ok) {
        const sData = await sResp.json();
        if (sData && sData.hasCaptions && sData.segments && sData.segments.length > 0) {
          return sData;
        }
      }
    } catch (e) {}

    // 2. Try background service worker
    try {
      const bgResp = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'FETCH_TRANSCRIPT', videoId: vid, targetLang: lang }, res => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(res?.data || null);
        });
      });
      if (bgResp && bgResp.hasCaptions && bgResp.segments && bgResp.segments.length > 0) {
        return bgResp;
      }
    } catch (e) {}

    // 3. Direct Android InnerTube with correct User-Agent
    try {
      const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
        },
        body: JSON.stringify({
          context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
          videoId: vid
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const vDetails = data?.videoDetails || {};
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        if (tracks.length > 0) {
          let selTrack = tracks.find(t => t.languageCode === lang) || tracks[0];
          const xmlResp = await fetch(selTrack.baseUrl, {
            headers: { 'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' }
          });
          if (xmlResp.ok) {
            const rawXml = await xmlResp.text();
            const segments = parsePopupSegments(rawXml);
            if (segments.length > 0) {
              return {
                videoId: vid,
                title: vDetails.title || `Video (${vid})`,
                thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                hasCaptions: true,
                totalLines: segments.length,
                duration: segments[segments.length - 1].timeStr.replace(/[[\]]/g, ''),
                segments,
                plainText: segments.map(s => s.text).join(' '),
                timestampedText: segments.map(s => `${s.timeStr} ${s.text}`).join('\n')
              };
            }
          }
        }
      }
    } catch (e) {}

    // 4. Try Web Page scraping
    try {
      const pageResp = await fetch(`https://www.youtube.com/watch?v=${vid}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }
      });
      if (pageResp.ok) {
        const html = await pageResp.text();
        const tracks = extractCaptionTracks(html);
        if (tracks) {
          if (tracks.length > 0) {
            let selTrack = tracks.find(t => t.languageCode === lang) || tracks[0];
            const xmlResp = await fetch(selTrack.baseUrl);
            if (xmlResp.ok) {
              const rawXml = await xmlResp.text();
              const segments = parsePopupSegments(rawXml);
              if (segments.length > 0) {
                return {
                  videoId: vid,
                  title: `YouTube Video (${vid})`,
                  thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                  hasCaptions: true,
                  totalLines: segments.length,
                  duration: segments[segments.length - 1].timeStr.replace(/[[\]]/g, ''),
                  segments,
                  plainText: segments.map(s => s.text).join(' '),
                  timestampedText: segments.map(s => `${s.timeStr} ${s.text}`).join('\n')
                };
              }
            }
          }
        }
      }
    } catch (e) {}

    return {
      videoId: vid,
      title: `YouTube Video (${vid})`,
      thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      hasCaptions: false,
      totalLines: 0,
      duration: 'N/A',
      segments: [],
      plainText: '',
      timestampedText: '',
      reason: 'No subtitles available'
    };
  }

  // Handle Quick Paste & Extract action (mode = 'timestamps' | 'plain')
  async function handleQuickExtract(mode = 'timestamps') {
    const raw = inputCustomUrl ? inputCustomUrl.value : '';
    const vid = extractVideoId(raw);
    if (!vid) {
      showToast('Please enter a valid YouTube link or ID! ⚠️');
      if (inputCustomUrl) inputCustomUrl.focus();
      return;
    }

    const activeBtn = mode === 'timestamps' ? btnCustomCopyTs : btnCustomCopyPlain;
    if (!activeBtn) return;
    const originalText = activeBtn.innerHTML;

    if (btnCustomCopyTs) btnCustomCopyTs.disabled = true;
    if (btnCustomCopyPlain) btnCustomCopyPlain.disabled = true;
    activeBtn.innerHTML = '<span>⏳ Extracting...</span>';

    try {
      const lang = prefLangSelect ? prefLangSelect.value : 'hi';
      const data = await fetchPopupTranscriptData(vid, lang);

      if (data && data.hasCaptions && data.segments && data.segments.length > 0) {
        let textToCopy = '';
        if (mode === 'timestamps') {
          textToCopy = data.timestampedText || data.segments.map(s => `${s.timeStr} ${s.text}`).join('\n');
          showToast(`Copied ${data.segments.length} lines with timestamps! ⏱️`);
        } else {
          textToCopy = data.plainText || data.segments.map(s => s.text).join(' ');
          showToast(`Copied plain text (${data.segments.length} lines) for AI! 📄`);
        }

        await safeCopyToClipboard(textToCopy);

        // Update live preview card
        if (pasteResultCard) {
          pasteResultCard.style.display = 'flex';
          if (pasteResultThumb) pasteResultThumb.src = data.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          if (pasteResultTitle) pasteResultTitle.textContent = data.title || `Video (${vid})`;
          if (pasteResultBadge) {
            pasteResultBadge.className = 'result-badge';
            pasteResultBadge.textContent = `✅ ${data.totalLines || data.segments.length} lines`;
          }
          if (pasteResultDur) pasteResultDur.textContent = data.duration ? `⏱️ ${data.duration}` : '';
          if (btnOpenInStudio) {
            btnOpenInStudio.onclick = () => {
              chrome.tabs.create({ url: `http://localhost:3000/?url=https://www.youtube.com/watch?v=${vid}` });
            };
          }
        }

        activeBtn.innerHTML = '<span>✅ Copied!</span>';
        setTimeout(() => {
          if (btnCustomCopyTs) btnCustomCopyTs.disabled = false;
          if (btnCustomCopyPlain) btnCustomCopyPlain.disabled = false;
          activeBtn.innerHTML = originalText;
        }, 2200);
      } else {
        showToast('Is video par subtitles available nahi hain ⚠️');
        if (pasteResultCard) {
          pasteResultCard.style.display = 'flex';
          if (pasteResultThumb) pasteResultThumb.src = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          if (pasteResultTitle) pasteResultTitle.textContent = `Video (${vid})`;
          if (pasteResultBadge) {
            pasteResultBadge.className = 'result-badge error';
            pasteResultBadge.textContent = `⚠️ No Captions`;
          }
          if (pasteResultDur) pasteResultDur.textContent = 'Disabled on YouTube';
        }
        if (btnCustomCopyTs) btnCustomCopyTs.disabled = false;
        if (btnCustomCopyPlain) btnCustomCopyPlain.disabled = false;
        activeBtn.innerHTML = originalText;
      }
    } catch (err) {
      console.error('Quick extract error:', err);
      showToast('Extraction failed, please retry');
      if (btnCustomCopyTs) btnCustomCopyTs.disabled = false;
      if (btnCustomCopyPlain) btnCustomCopyPlain.disabled = false;
      activeBtn.innerHTML = originalText;
    }
  }

  // Button Listeners for Quick Paste
  if (btnCustomCopyTs) {
    btnCustomCopyTs.addEventListener('click', () => handleQuickExtract('timestamps'));
  }
  if (btnCustomCopyPlain) {
    btnCustomCopyPlain.addEventListener('click', () => handleQuickExtract('plain'));
  }

  // Paste from Clipboard Button
  if (btnPasteClipboard) {
    btnPasteClipboard.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          inputCustomUrl.value = text.trim();
          if (btnClearInput) btnClearInput.style.display = 'block';
          showToast('Pasted from clipboard! 📋');
          handleQuickExtract('timestamps');
        } else {
          showToast('Clipboard is empty');
        }
      } catch (e) {
        if (inputCustomUrl) inputCustomUrl.focus();
        showToast('Please press Ctrl+V to paste');
      }
    });
  }

  // Clear Input Button
  if (btnClearInput && inputCustomUrl) {
    btnClearInput.addEventListener('click', () => {
      inputCustomUrl.value = '';
      btnClearInput.style.display = 'none';
      if (pasteResultCard) pasteResultCard.style.display = 'none';
      inputCustomUrl.focus();
    });

    inputCustomUrl.addEventListener('input', () => {
      btnClearInput.style.display = inputCustomUrl.value.trim() ? 'block' : 'none';
    });

    inputCustomUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleQuickExtract('timestamps');
      }
    });
  }

  // Check active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isYouTube = tab?.url && (tab.url.includes('youtube.com') || tab.url.includes('youtu.be'));
  const isWatchPage = isYouTube && (tab.url.includes('/watch') || tab.url.includes('/shorts/'));

  if (isWatchPage) {
    // On a specific video watch page
    detectedCard.style.display = 'flex';
    actionsSection.style.display = 'flex';
    notYtSection.style.display = 'none';

    const cleanTitle = (tab.title || 'YouTube Video').replace(/ - YouTube$/, '').trim();
    videoTitleEl.textContent = cleanTitle;
    videoMetaEl.textContent = 'Ready for 1-Click Extraction';

    btnOpenPanel.addEventListener('click', async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_TRANSCRIPT_PANEL' });
        window.close();
      } catch (err) {
        showToast('Refresh the YouTube page first!');
      }
    });

    btnTimestamps.addEventListener('click', async () => {
      btnTimestamps.disabled = true;
      btnTimestamps.innerHTML = '<span>⌛ Extracting...</span>';
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'QUICK_COPY_TIMESTAMPS' });
        if (res?.status === 'copied') {
          showToast(`Copied ${res.count || ''} lines! ✨`);
        } else {
          showToast('Copied to clipboard! ✨');
        }
      } catch (err) {
        showToast('Refresh the YouTube page first!');
      } finally {
        btnTimestamps.disabled = false;
        btnTimestamps.innerHTML = `
          <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
          <span>1-Click Copy Timestamps</span>
        `;
      }
    });

    btnPlain.addEventListener('click', async () => {
      btnPlain.disabled = true;
      btnPlain.innerHTML = '<span>⌛ Extracting...</span>';
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'QUICK_COPY_PLAIN' });
        showToast('Copied clean text for AI! 📄');
      } catch (err) {
        showToast('Refresh the YouTube page first!');
      } finally {
        btnPlain.disabled = false;
        btnPlain.innerHTML = `
          <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          <span>1-Click Plain Text (for AI)</span>
        `;
      }
    });

  } else if (isYouTube) {
    // On YouTube Home / Search / Channel / Feed
    detectedCard.style.display = 'flex';
    actionsSection.style.display = 'none';
    notYtSection.style.display = 'none';

    videoTitleEl.textContent = 'YouTube Connected (Feed Active)';
    videoMetaEl.textContent = '🟢 1-Click Copy badges enabled on video cards';

  } else {
    // Completely non-YouTube tab
    detectedCard.style.display = 'none';
    actionsSection.style.display = 'none';
    notYtSection.style.display = 'block';

    if (btnOpenYt) {
      btnOpenYt.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.youtube.com' });
        window.close();
      });
    }
  }
});
