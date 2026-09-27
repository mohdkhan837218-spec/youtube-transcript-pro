// YouTube Transcript Pro - Ultra-Fast Bulletproof Content Script
(() => {
  let isPanelOpen = false;
  let currentVideoId = null;
  let rawSegments = [];
  let activeSegments = [];
  let availableTracks = [];
  let currentLangCode = 'default';
  let searchQuery = '';
  let activeSegmentIndex = -1;
  let isPreloading = false;

  // Major languages for translation
  const POPULAR_LANGUAGES = [
    { code: 'hi', name: 'Hindi (हिन्दी)' },
    { code: 'en', name: 'English' },
    { code: 'ur', name: 'Urdu (اردو)' },
    { code: 'es', name: 'Spanish (Español)' },
    { code: 'ar', name: 'Arabic (العربية)' },
    { code: 'bn', name: 'Bengali (বাংলা)' },
    { code: 'fr', name: 'French (Français)' },
    { code: 'de', name: 'German (Deutsch)' },
    { code: 'ru', name: 'Russian (Русский)' },
    { code: 'pt', name: 'Portuguese (Português)' },
    { code: 'ja', name: 'Japanese (日本語)' }
  ];

  // Format seconds to [MM:SS] or [HH:MM:SS]
  function formatTimestamp(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hours > 0) {
      return `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
    }
    return `[${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
  }

  // Parse time string "0:15" or "1:02:15" to seconds
  function parseTimeToSeconds(timeStr) {
    const clean = (timeStr || '').replace(/[[\]]/g, '').trim();
    const parts = clean.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }

  // Decode common HTML entities
  function decodeEntities(text) {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  }

  // Toast notification
  function showToast(message) {
    let toast = document.getElementById('ytp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ytp-toast';
      toast.className = 'ytp-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>✨</span> <span>${message}</span>`;
    toast.classList.add('ytp-toast-show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('ytp-toast-show');
    }, 3000);
  }

  // Copy to clipboard
  async function copyToClipboard(text, successMessage = 'Copied to clipboard! 📋') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(successMessage);
    }
  }

  // 1-Click Copy with Exact Timestamps
  function copyWithTimestamps() {
    if (!activeSegments || activeSegments.length === 0) {
      showToast('No transcript lines to copy!');
      return;
    }
    const lines = activeSegments.map(s => `${s.timeStr} ${s.text}`);
    copyToClipboard(lines.join('\n'), `Copied ${activeSegments.length} lines with exact timestamps! ⏱️`);
  }

  // 1-Click Copy Plain Text
  function copyPlainText() {
    if (!activeSegments || activeSegments.length === 0) {
      showToast('No transcript lines to copy!');
      return;
    }
    const text = activeSegments.map(s => s.text).join(' ');
    copyToClipboard(text, `Copied plain text (${text.split(/\s+/).length} words) for AI! 📄`);
  }

  // Seek video playback
  function seekToVideoSecond(seconds) {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = seconds;
      video.play().catch(() => {});
    }
    window.postMessage({
      source: 'YTP_CONTENT',
      type: 'SEEK_VIDEO',
      seconds
    }, '*');
    showToast(`Jumped to ${formatTimestamp(seconds)} ⏩`);
  }

  // ==========================================
  // ULTRA-FAST ANDROID INNERTUBE ENGINE (Bypasses POT & Web Security)
  // ==========================================

  // Parse InnerTube XML format (srv3 and classic format)
  function parseTranscriptXml(xml) {
    const results = [];
    if (!xml) return results;

    // 1. Try srv3 format: <p t="ms" d="ms"><s>word</s>...</p>
    const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    let match;
    while ((match = pRegex.exec(xml)) !== null) {
      const startMs = parseInt(match[1], 10);
      const durMs = parseInt(match[2], 10);
      const inner = match[3];
      let text = '';
      const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      let sMatch;
      while ((sMatch = sRegex.exec(inner)) !== null) {
        text += sMatch[1];
      }
      if (!text) {
        text = inner.replace(/<[^>]+>/g, '');
      }
      text = decodeEntities(text).trim();
      if (text) {
        const startSec = startMs / 1000;
        const durSec = durMs / 1000;
        results.push({
          start: startSec,
          duration: durSec,
          end: startSec + durSec,
          timeStr: formatTimestamp(startSec),
          text
        });
      }
    }

    if (results.length > 0) return results;

    // 2. Fall back to classic format: <text start="s" dur="s">content</text>
    const textRegex = /<text\s+start="([^"]*)"\s+dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
    while ((match = textRegex.exec(xml)) !== null) {
      const startSec = parseFloat(match[1]);
      const durSec = parseFloat(match[2]);
      const rawText = match[3].replace(/<[^>]+>/g, '');
      const text = decodeEntities(rawText).trim();
      if (text) {
        results.push({
          start: startSec,
          duration: durSec,
          end: startSec + durSec,
          timeStr: formatTimestamp(startSec),
          text
        });
      }
    }

    return results;
  }

  // Ask the MAIN-world injector (page-world.js) for data — it runs inside
  // YouTube's own page context with the user's session cookies.
  function requestPageWorld(type, payload = {}) {
    return new Promise((resolve) => {
      const requestId = 'ytp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      const expected = type === 'GET_PLAYER_DATA' ? 'PLAYER_DATA_RESPONSE' : 'FETCH_TIMEDTEXT_RESPONSE';
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 8000);
      function handler(event) {
        if (event.source !== window || !event.data || event.data.requestId !== requestId) return;
        if (event.data.source === 'YTP_PAGE' && event.data.type === expected) {
          window.removeEventListener('message', handler);
          clearTimeout(timer);
          resolve(event.data);
        }
      }
      window.addEventListener('message', handler);
      window.postMessage({ source: 'YTP_CONTENT', type, requestId, ...payload }, '*');
    });
  }

  // Fetch captions through the page's own session (often works when the
  // no-cookie InnerTube tiers are blocked)
  async function fetchViaPageWorld(videoId, selectedTrackIndex = 0) {
    try {
      const playerMsg = await requestPageWorld('GET_PLAYER_DATA');
      const tracks = playerMsg && playerMsg.data && playerMsg.data.captionTracks;
      if (!Array.isArray(tracks) || tracks.length === 0) return null;
      availableTracks = tracks;
      const track = tracks[selectedTrackIndex] || tracks[0];
      if (!track || !track.baseUrl) return null;
      const timedMsg = await requestPageWorld('FETCH_TIMEDTEXT', { url: track.baseUrl });
      const result = timedMsg && timedMsg.result;
      if (!result || !result.ok || !result.text) return null;
      const segments = parseTranscriptXml(result.text);
      return segments.length > 0 ? segments : null;
    } catch (e) {
      return null;
    }
  }

  // Fetch Multi-Tier Transcript (Local Server + Background Worker + Page-World Session + Authenticated InnerTube)
  async function fetchAndroidInnerTubeTranscript(videoId, selectedTrackIndex = 0) {
    // 1. Try Local Server (http://localhost:3000)
    try {
      const sResp = await fetch(`http://localhost:3000/api/transcript?videoId=${encodeURIComponent(videoId)}`);
      if (sResp.ok) {
        const sData = await sResp.json();
        if (sData && sData.hasCaptions && sData.segments?.length > 0) {
          return sData.segments;
        }
      }
    } catch (e) {}

    // 2. Try Extension Background Service Worker
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const bgData = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'FETCH_TRANSCRIPT', videoId }, (res) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(res?.data?.segments || null);
          });
        });
        if (bgData && bgData.length > 0) return bgData;
      }
    } catch (e) {}

    // 2b. Try Page-World injector (uses the YouTube page's own authenticated session & cookies)
    try {
      const pwSegs = await fetchViaPageWorld(videoId, selectedTrackIndex);
      if (pwSegs && pwSegs.length > 0) return pwSegs;
    } catch (e) {}

    // 3. Try Authenticated InnerTube API
    try {
      const playerResp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '20.10.38'
            }
          },
          videoId: videoId
        })
      });

      if (playerResp.ok) {
        const data = await playerResp.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(tracks) && tracks.length > 0) {
          availableTracks = tracks;
          const track = tracks[selectedTrackIndex] || tracks[0];
          if (track?.baseUrl) {
            const xmlResp = await fetch(track.baseUrl, {
              headers: { 'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' }
            });
            if (xmlResp.ok) {
              const xml = await xmlResp.text();
              const segments = parseTranscriptXml(xml);
              if (segments.length > 0) return segments;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[YTP] InnerTube extraction failed:', err);
    }

    return null;
  }

  // ==========================================
  // DOM EXTRACTION FALLBACK
  // ==========================================

  function getSegmentsFromDom() {
    let nodes = document.querySelectorAll(
      'ytd-transcript-segment-renderer, ' +
      'transcript-segment-view-model, ' +
      'ytd-transcript-search-panel-renderer [class*="segment"]'
    );

    if (!nodes || nodes.length === 0) {
      const textElements = document.querySelectorAll('.segment-text, [class*="segment-text"], [class*="segment-timestamp"]');
      if (textElements.length > 0) {
        const set = new Set();
        textElements.forEach(t => {
          const parent = t.closest('ytd-transcript-segment-renderer, [class*="segment"]') || t.parentElement;
          if (parent) set.add(parent);
        });
        nodes = Array.from(set);
      }
    }

    if (!nodes || nodes.length === 0) return null;

    const segments = [];
    nodes.forEach(node => {
      const timeEl = node.querySelector('.segment-timestamp, [class*="timestamp"], div[id*="timestamp"], span[class*="time"]');
      const textEl = node.querySelector('.segment-text, [class*="text"], yt-formatted-string, span[class*="text"]');

      if (timeEl && textEl) {
        const rawTime = timeEl.textContent.trim();
        const text = textEl.textContent.trim();
        if (text && rawTime) {
          const seconds = parseTimeToSeconds(rawTime);
          segments.push({
            start: seconds,
            duration: 3,
            end: seconds + 3,
            timeStr: `[${rawTime}]`,
            text
          });
        }
      }
    });

    return segments.length > 0 ? segments : null;
  }

  // Translation via Google Translate
  async function translateSegments(segments, targetLang) {
    if (!segments || segments.length === 0 || targetLang === 'original') return segments;

    try {
      const BATCH_SIZE = 15;
      const translated = [];

      for (let i = 0; i < segments.length; i += BATCH_SIZE) {
        const batch = segments.slice(i, i + BATCH_SIZE);
        const combinedText = batch.map(s => s.text).join(' \n\n ');
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(combinedText)}`;

        const res = await fetch(url);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            batch.forEach(seg => translated.push(seg));
            continue;
          }
          const data = await res.json();
          if (!Array.isArray(data) || !Array.isArray(data[0])) {
            batch.forEach(seg => translated.push(seg));
            continue;
          }
          const fullTranslation = data[0].map(item => item[0] || '').join('');
          const translatedChunks = fullTranslation.split(/\n\n|\n/).map(s => s.trim()).filter(Boolean);

          // Guard: never attach a translation to the wrong timestamp
          if (translatedChunks.length !== batch.length) {
            batch.forEach(seg => translated.push(seg));
            continue;
          }

          batch.forEach((seg, idx) => {
            translated.push({
              ...seg,
              text: translatedChunks[idx] || seg.text
            });
          });
        } else {
          batch.forEach(seg => translated.push(seg));
        }
      }

      return translated;
    } catch (err) {
      console.warn('[YTP] Translation error:', err);
      return segments;
    }
  }

  // ==========================================
  // MASTER TRANSCRIPT LOADER
  // ==========================================

  async function loadTranscript(targetLang = 'default') {
    const listEl = document.getElementById('ytp-transcript-list');
    if (listEl) {
      listEl.innerHTML = `
        <div class="ytp-state-container">
          <div class="ytp-spinner"></div>
          <div style="font-weight:600; color:#fff; margin-bottom:4px;">Extracting YouTube transcript...</div>
          <div style="font-size:12px; color:#888;">Ultra-fast 1-click engine running</div>
        </div>
      `;
    }

    const vid = currentVideoId || new URLSearchParams(window.location.search).get('v');
    if (!vid) {
      if (listEl) {
        listEl.innerHTML = `
          <div class="ytp-state-container">
            <div style="font-size:26px; margin-bottom:8px;">⚠️</div>
            <div>No active video detected. Open a YouTube video to extract!</div>
          </div>
        `;
      }
      return null;
    }

    // Step 1: If already in memory and lang is default, return immediately
    if (rawSegments && rawSegments.length > 0 && targetLang === 'default') {
      activeSegments = rawSegments;
      renderSegmentsList();
      updateStats();
      return activeSegments;
    }

    // Step 2: Try Android InnerTube API (Sub-second, bypasses all security)
    let segments = await fetchAndroidInnerTubeTranscript(vid);

    // Step 3: If InnerTube failed, try DOM extraction
    if (!segments || segments.length === 0) {
      segments = getSegmentsFromDom();
    }

    if (!segments || segments.length === 0) {
      if (listEl) {
        listEl.innerHTML = `
          <div class="ytp-state-container" style="padding: 24px 16px;">
            <div style="font-size: 34px; margin-bottom: 12px;">⚡</div>
            <div style="font-weight: 700; color: #fff; margin-bottom: 6px; font-size: 15px;">No Captions Found</div>
            <div style="font-size: 12.5px; color: #aaa; margin-bottom: 18px; line-height: 1.5; max-width: 310px;">
              Is video par subtitles/transcript available nahi hai ya abhi YouTube ne process nahi ki hai.
            </div>
            <button id="ytp-retry-btn" style="background:linear-gradient(135deg, #eb2026, #b81418); color:#fff; border:none; padding:12px 22px; border-radius:12px; font-weight:700; cursor:pointer; font-size:13.5px; box-shadow:0 6px 18px rgba(235,32,38,0.45); width:100%; max-width:280px;">
              🔄 Retry Extraction
            </button>
          </div>
        `;
        const retryBtn = document.getElementById('ytp-retry-btn');
        if (retryBtn) {
          retryBtn.onclick = () => loadTranscript(targetLang);
        }
      }
      return null;
    }

    rawSegments = segments;
    populateLanguageDropdown();

    if (targetLang && targetLang !== 'default' && targetLang !== 'original') {
      if (listEl) {
        listEl.innerHTML = `
          <div class="ytp-state-container">
            <div class="ytp-spinner"></div>
            <div>Translating into ${targetLang}...</div>
          </div>
        `;
      }
      activeSegments = await translateSegments(rawSegments, targetLang);
    } else {
      activeSegments = rawSegments;
    }

    renderSegmentsList();
    updateStats();
    showToast(`Loaded ${activeSegments.length} lines with exact timestamps! ⏱️`);
    return activeSegments;
  }

  // Pre-load transcript in background when video starts playing
  async function preloadTranscript() {
    const vid = new URLSearchParams(window.location.search).get('v');
    if (!vid || isPreloading) return;
    if (rawSegments && rawSegments.length > 0 && currentVideoId === vid) return;

    isPreloading = true;
    currentVideoId = vid;
    try {
      const segs = await fetchAndroidInnerTubeTranscript(vid);
      if (segs && segs.length > 0) {
        rawSegments = segs;
        activeSegments = segs;
        populateLanguageDropdown();
        updateStats();
      }
    } catch (e) {
    } finally {
      isPreloading = false;
    }
  }

  // ==========================================
  // 1-CLICK INSTANT COPY HANDLER
  // ==========================================

  async function handleFastOneClickCopy(btn) {
    if (!btn) return;
    const textSpan = btn.querySelector('.ytp-btn-text');
    const origText = textSpan ? textSpan.textContent : '1-Click Copy';
    btn.classList.add('ytp-copying');
    if (textSpan) textSpan.textContent = 'Copying...';

    try {
      let segments = activeSegments;
      if (!segments || segments.length === 0) {
        segments = await loadTranscript('default');
      }

      if (segments && segments.length > 0) {
        const lines = segments.map(s => `${s.timeStr} ${s.text}`);
        await copyToClipboard(lines.join('\n'), `Copied ${segments.length} lines with exact timestamps! ⏱️`);

        btn.classList.remove('ytp-copying');
        btn.classList.add('ytp-copied');
        if (textSpan) textSpan.textContent = `Copied (${segments.length})!`;
        setTimeout(() => {
          btn.classList.remove('ytp-copied');
          if (textSpan) textSpan.textContent = origText;
        }, 2500);
      } else {
        showToast('Subtitles not found for this video');
        btn.classList.remove('ytp-copying');
        if (textSpan) textSpan.textContent = origText;
      }
    } catch (err) {
      console.error('[YTP] 1-Click copy error:', err);
      showToast('Copy failed, please retry');
      btn.classList.remove('ytp-copying');
      if (textSpan) textSpan.textContent = origText;
    }
  }

  // Populate Language Dropdown
  function populateLanguageDropdown() {
    const select = document.getElementById('ytp-select-lang');
    if (!select) return;

    select.innerHTML = '';

    // Original / Available video tracks
    if (availableTracks && availableTracks.length > 0) {
      const trackGroup = document.createElement('optgroup');
      trackGroup.label = '— Video Audio Tracks —';
      availableTracks.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = `track_${i}`;
        const trackName = t.name?.runs?.[0]?.text || t.name?.simpleText || t.languageCode;
        opt.textContent = `${trackName} (${t.languageCode})`;
        if (i === 0) opt.selected = true;
        trackGroup.appendChild(opt);
      });
      select.appendChild(trackGroup);
    } else {
      const optOrig = document.createElement('option');
      optOrig.value = 'default';
      optOrig.textContent = 'Original Video Language';
      select.appendChild(optOrig);
    }

    // Auto-Translate options
    const trGroup = document.createElement('optgroup');
    trGroup.label = '— 1-Click Auto-Translate —';
    POPULAR_LANGUAGES.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = `Translate to: ${l.name}`;
      trGroup.appendChild(opt);
    });
    select.appendChild(trGroup);
  }

  // Render list of segments
  function renderSegmentsList() {
    const listEl = document.getElementById('ytp-transcript-list');
    if (!listEl || !activeSegments) return;

    const filtered = activeSegments.filter(s => {
      if (!searchQuery) return true;
      return s.text.toLowerCase().includes(searchQuery) || s.timeStr.includes(searchQuery);
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="ytp-state-container">
          <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
          <div>No lines matching "${searchQuery}"</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map((s, idx) => {
      let displayText = s.text;
      if (searchQuery) {
        const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        displayText = displayText.replace(regex, '<mark>$1</mark>');
      }

      return `
        <div class="ytp-segment" data-seconds="${s.start}" data-index="${idx}">
          <button class="ytp-timestamp-pill" data-seek="${s.start}" title="Click to jump video to ${s.timeStr}">
            ${s.timeStr}
          </button>
          <div class="ytp-segment-text">${displayText}</div>
        </div>
      `;
    }).join('');

    // Attach click handlers to timestamp pills
    listEl.querySelectorAll('.ytp-timestamp-pill').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const sec = parseFloat(btn.getAttribute('data-seek') || '0');
        seekToVideoSecond(sec);
      };
    });

    // Segment row click also seeks
    listEl.querySelectorAll('.ytp-segment').forEach(row => {
      row.onclick = (e) => {
        e.stopPropagation();
        const sec = parseFloat(row.getAttribute('data-seconds') || '0');
        seekToVideoSecond(sec);
      };
    });
  }

  // Update line and word stats
  function updateStats() {
    const statsEl = document.getElementById('ytp-stats');
    if (!statsEl || !activeSegments) return;
    const totalLines = activeSegments.length;
    const totalWords = activeSegments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
    statsEl.innerHTML = `<span>${totalLines.toLocaleString()} lines</span> • <span>${totalWords.toLocaleString()} words</span>`;
  }

  // Synchronize active segment with video playback time
  function initVideoSync() {
    setInterval(() => {
      const video = document.querySelector('video');
      if (!video) return;

      // When video plays, ensure we pre-loaded transcript
      if (!video.paused && (!rawSegments || rawSegments.length === 0)) {
        preloadTranscript();
      }

      if (!isPanelOpen || !activeSegments || activeSegments.length === 0) return;

      const currentTime = video.currentTime;
      const index = activeSegments.findIndex((s, i) => {
        const next = activeSegments[i + 1];
        if (next) {
          return currentTime >= s.start && currentTime < next.start;
        }
        return currentTime >= s.start;
      });

      if (index !== -1 && index !== activeSegmentIndex) {
        activeSegmentIndex = index;
        const allRows = document.querySelectorAll('.ytp-segment');
        allRows.forEach((r, idx) => {
          if (idx === index) {
            r.classList.add('ytp-active-line');
          } else {
            r.classList.remove('ytp-active-line');
          }
        });
      }
    }, 500);
  }

  // Build or toggle the UI panel
  function toggleTranscriptPanel() {
    if (isPanelOpen) {
      closeTranscriptPanel();
    } else {
      openTranscriptPanel();
    }
  }

  function closeTranscriptPanel() {
    const panel = document.getElementById('ytp-panel');
    if (panel) {
      panel.style.display = 'none';
      isPanelOpen = false;
    }
  }

  async function openTranscriptPanel() {
    let panel = document.getElementById('ytp-panel');
    if (!panel) {
      panel = createPanelDom();
      document.body.appendChild(panel);
    }
    panel.style.display = 'flex';
    isPanelOpen = true;

    populateLanguageDropdown();
    await loadTranscript(currentLangCode);
  }

  // Create panel DOM structure
  function createPanelDom() {
    const panel = document.createElement('div');
    panel.id = 'ytp-panel';
    panel.className = 'ytp-panel-overlay';

    panel.innerHTML = `
      <div class="ytp-panel-header">
        <div class="ytp-panel-title-area">
          <div class="ytp-panel-logo">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          </div>
          <span class="ytp-panel-title">YouTube Transcript Pro</span>
          <span class="ytp-panel-badge">1-Click</span>
        </div>
        <button class="ytp-close-btn" id="ytp-btn-close" title="Close">✕</button>
      </div>

      <div class="ytp-panel-controls">
        <div class="ytp-lang-row">
          <span class="ytp-lang-label">🌐 Language:</span>
          <select class="ytp-lang-select" id="ytp-select-lang">
            <option value="default">Original Video Language</option>
          </select>
        </div>

        <div class="ytp-action-buttons">
          <button class="ytp-btn-copy-primary" id="ytp-btn-copy-timestamps" title="1-Click Copy with Timestamps">
            ⚡ Copy Timestamps
          </button>
          <button class="ytp-btn-secondary" id="ytp-btn-copy-plain" title="Copy clean text without timestamps for AI">
            📄 Plain Text
          </button>
          <button class="ytp-btn-icon" id="ytp-btn-refresh-data" title="Reload / Refresh Transcript">
            🔄
          </button>
        </div>

        <div class="ytp-search-wrapper">
          <svg class="ytp-search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" class="ytp-search-input" id="ytp-input-search" placeholder="Search keywords in transcript..." />
        </div>
      </div>

      <div class="ytp-transcript-body" id="ytp-transcript-list">
        <div class="ytp-state-container">
          <div class="ytp-spinner"></div>
          <div>Connecting to YouTube transcript...</div>
        </div>
      </div>

      <div class="ytp-panel-footer">
        <div class="ytp-stats" id="ytp-stats">
          <span>0 lines</span> • <span>0 words</span>
        </div>
        <div style="display:flex; gap:10px;">
          <button id="ytp-btn-copy-quick" style="background:none; border:none; color:#eb2026; cursor:pointer; font-size:11.5px; font-weight:700;">Copy All</button>
        </div>
      </div>
    `;

    // Event bindings
    panel.querySelector('#ytp-btn-close').onclick = (e) => {
      e.stopPropagation();
      closeTranscriptPanel();
    };

    panel.querySelector('#ytp-btn-copy-timestamps').onclick = (e) => {
      e.stopPropagation();
      copyWithTimestamps();
    };

    panel.querySelector('#ytp-btn-copy-plain').onclick = (e) => {
      e.stopPropagation();
      copyPlainText();
    };

    panel.querySelector('#ytp-btn-copy-quick').onclick = (e) => {
      e.stopPropagation();
      copyWithTimestamps();
    };

    panel.querySelector('#ytp-btn-refresh-data').onclick = (e) => {
      e.stopPropagation();
      loadTranscript(currentLangCode);
    };

    const langSelect = panel.querySelector('#ytp-select-lang');
    langSelect.onchange = async (e) => {
      currentLangCode = e.target.value;
      const listEl = document.getElementById('ytp-transcript-list');

      if (currentLangCode.startsWith('track_')) {
        const trackIdx = parseInt(currentLangCode.replace('track_', ''), 10);
        listEl.innerHTML = `
          <div class="ytp-state-container">
            <div class="ytp-spinner"></div>
            <div>Switching audio track...</div>
          </div>
        `;
        const segs = await fetchAndroidInnerTubeTranscript(currentVideoId, trackIdx);
        if (segs && segs.length > 0) {
          rawSegments = segs;
          activeSegments = segs;
          renderSegmentsList();
          updateStats();
          showToast('Switched audio track! 🌐');
        }
      } else if (currentLangCode === 'default' || currentLangCode === 'original') {
        activeSegments = rawSegments;
        renderSegmentsList();
        updateStats();
      } else {
        listEl.innerHTML = `
          <div class="ytp-state-container">
            <div class="ytp-spinner"></div>
            <div>Translating into ${langSelect.options[langSelect.selectedIndex].text}...</div>
          </div>
        `;
        activeSegments = await translateSegments(rawSegments, currentLangCode);
        renderSegmentsList();
        updateStats();
        showToast('Translated transcript! 🌐');
      }
    };

    const searchInput = panel.querySelector('#ytp-input-search');
    searchInput.oninput = (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderSegmentsList();
    };

    panel.onclick = (e) => {
      e.stopPropagation();
    };

    return panel;
  }

  // Inject 1-Click Copy and Action Buttons into YouTube's buttons bar
  function injectActionButtons() {
    const targets = [
      document.querySelector('#actions #actions-inner #top-level-buttons-computed'),
      document.querySelector('#actions #top-level-buttons-computed'),
      document.querySelector('ytd-watch-metadata #actions #top-level-buttons-computed'),
      document.querySelector('#top-row #actions'),
      document.querySelector('#owner')
    ];

    const container = targets.find(t => t !== null && t !== undefined);
    if (!container) return;

    if (document.getElementById('ytp-button-container')) return;

    const group = document.createElement('div');
    group.id = 'ytp-button-container';
    group.className = 'ytp-button-container';

    // 1. Injected 1-Click Fast Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.id = 'ytp-copy-now-btn';
    copyBtn.className = 'ytp-copy-now-btn';
    copyBtn.title = '1-Click Copy Entire Transcript with Exact Timestamps!';
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
      <span class="ytp-btn-text">1-Click Copy</span>
    `;
    copyBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFastOneClickCopy(copyBtn);
    };

    // 2. Injected Transcript Pro Panel Button
    const actionBtn = document.createElement('button');
    actionBtn.id = 'ytp-action-btn';
    actionBtn.className = 'ytp-transcript-btn';
    actionBtn.title = 'Open Full Interactive Transcript (Search, Translate, Jump)';
    actionBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
      <span class="ytp-btn-text">Transcript</span>
    `;
    actionBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTranscriptPanel();
    };

    group.appendChild(copyBtn);
    group.appendChild(actionBtn);

    container.insertBefore(group, container.firstChild);
  }

  // Inject Floating Trigger Button (Always visible on bottom right)
  function injectFloatingTrigger() {
    const existing = document.getElementById('ytp-floating-btn');
    if (existing) {
      existing.style.display = ''; // restore after navigating back from Home/Search (was hidden there)
      return;
    }

    const btn = document.createElement('div');
    btn.id = 'ytp-floating-btn';
    btn.className = 'ytp-floating-trigger';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
      <span>Transcript</span>
    `;

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTranscriptPanel();
    };

    document.body.appendChild(btn);
  }

  // Watch for page navigation
  function checkUrlChange() {
    const vid = new URLSearchParams(window.location.search).get('v');
    if (window.location.pathname === '/watch' && vid) {
      if (vid !== currentVideoId) {
        currentVideoId = vid;
        rawSegments = [];
        activeSegments = [];
        availableTracks = [];
        activeSegmentIndex = -1;
        // Pre-load in background immediately
        preloadTranscript();
        if (isPanelOpen) loadTranscript();
      }
      injectActionButtons();
      injectFloatingTrigger();
    } else {
      const fl = document.getElementById('ytp-floating-btn');
      if (fl) fl.style.display = 'none';
      const grp = document.getElementById('ytp-button-container');
      if (grp) grp.remove();
    }
  }

  // Listen to messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_TRANSCRIPT_PANEL') {
      openTranscriptPanel();
      sendResponse({ status: 'opened' });
    } else if (message.type === 'QUICK_COPY_TIMESTAMPS') {
      (async () => {
        let segs = activeSegments;
        if (!segs || segs.length === 0) {
          segs = await loadTranscript('default');
        }
        if (segs && segs.length > 0) {
          copyWithTimestamps();
          sendResponse({ status: 'copied', count: segs.length });
        } else {
          sendResponse({ status: 'error', message: 'No subtitles available' });
        }
      })();
      return true;
    } else if (message.type === 'QUICK_COPY_PLAIN') {
      (async () => {
        let segs = activeSegments;
        if (!segs || segs.length === 0) {
          segs = await loadTranscript('default');
        }
        if (segs && segs.length > 0) {
          copyPlainText();
          sendResponse({ status: 'copied', count: segs.length });
        } else {
          sendResponse({ status: 'error', message: 'No subtitles available' });
        }
      })();
      return true;
    }
  });

  // ==========================================
  // HOME / SEARCH / FEED CARD 1-CLICK COPY
  // ==========================================

  // Extract video ID from any YouTube card element
  function extractVideoIdFromCard(card) {
    if (!card) return null;
    // Check all anchor tags inside card (thumbnail link, title link, etc.)
    const anchors = card.querySelectorAll('a#thumbnail, a#video-title-link, a#video-title, a[href*="watch?v="], a[href*="/shorts/"]');
    for (const a of anchors) {
      const href = a.getAttribute('href') || a.href || '';
      const mWatch = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (mWatch) return mWatch[1];
      const mShorts = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (mShorts) return mShorts[1];
    }
    // Also check self
    const selfHref = card.getAttribute('href') || card.href || '';
    if (selfHref) {
      const mWatch = selfHref.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (mWatch) return mWatch[1];
      const mShorts = selfHref.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (mShorts) return mShorts[1];
    }
    return null;
  }

  // Handle 1-Click copy directly from video cards / thumbnails on Home or Search
  async function handleHoverCardCopy(btn, videoId, mode = 'timestamps') {
    if (!btn || !videoId) return;
    const textSpan = btn.querySelector('.ytp-hover-text');
    btn.classList.add('ytp-card-copying');
    if (textSpan) textSpan.textContent = 'Copying...';

    try {
      const segments = await fetchAndroidInnerTubeTranscript(videoId);
      if (segments && segments.length > 0) {
        if (mode === 'plain') {
          const plain = segments.map(s => s.text).join(' ');
          await copyToClipboard(plain, `Copied plain text (${segments.length} lines) for AI! 📄`);
        } else {
          const lines = segments.map(s => `${s.timeStr} ${s.text}`);
          await copyToClipboard(lines.join('\n'), `Copied ${segments.length} lines with exact timestamps! ⏱️`);
        }

        btn.classList.remove('ytp-card-copying');
        btn.classList.add('ytp-card-copied');
        if (textSpan) textSpan.textContent = '✓ Copied!';

        setTimeout(() => {
          btn.classList.remove('ytp-card-copied');
          btn.classList.remove('ytp-card-show');
          if (textSpan) textSpan.textContent = 'CC Transcript';
        }, 2200);
      } else {
        showToast('Is video par subtitles available nahi hain ⚠️');
        btn.classList.remove('ytp-card-copying');
        btn.classList.add('ytp-card-error');
        if (textSpan) textSpan.textContent = 'No CC';

        setTimeout(() => {
          btn.classList.remove('ytp-card-error');
          btn.classList.remove('ytp-card-show');
          if (textSpan) textSpan.textContent = 'CC Transcript';
        }, 2200);
      }
    } catch (err) {
      console.error('[YTP] Hover card copy error:', err);
      showToast('Copy failed, please retry');
      btn.classList.remove('ytp-card-copying');
      if (textSpan) textSpan.textContent = 'CC Transcript';
    }
  }

  // Inject 1-Click Copy button to all video thumbnails (Home, Search, Channel, Sidebar, Shorts)
  function injectHoverButtonsToThumbnails() {
    // Find all thumbnail links on the page (supports both regular watch videos and shorts)
    const anchors = document.querySelectorAll('a#thumbnail, a[href*="watch?v="], a[href*="/shorts/"]');

    anchors.forEach(a => {
      // Must have an image inside or be an explicit thumbnail
      const hasImg = a.id === 'thumbnail' || a.querySelector('img, yt-image, #img, [class*="thumb"]') !== null;
      if (!hasImg) return;

      // Skip if button already injected
      if (a.querySelector('.ytp-card-hover-btn') || a.parentElement?.querySelector('.ytp-card-hover-btn')) return;

      // Skip tiny avatars or miniplayers
      if (a.closest('ytd-miniplayer, #channel-header, #avatar, ytd-channel-renderer')) return;

      // Extract video ID from href
      const href = a.getAttribute('href') || a.href || '';
      let vid = null;
      const mWatch = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (mWatch) vid = mWatch[1];
      const mShorts = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (mShorts) vid = mShorts[1];

      if (!vid) return;

      // Ensure anchor has relative positioning
      const computedPos = window.getComputedStyle(a).position;
      if (computedPos === 'static') {
        a.style.position = 'relative';
      }

      // Create compact pill badge (<div role="button"> is valid inside <a>)
      const btn = document.createElement('div');
      btn.className = 'ytp-card-hover-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.title = '1-Click Copy Transcript (Click: Timestamps | Shift+Click: Plain Text)';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" class="ytp-cc-icon"><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7.25h-1.5v-.5h-2v2.5h2v-.5H11v1a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v1.25zm7 0h-1.5v-.5h-2v2.5h2v-.5H18v1a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v1.25z"/></svg>
        <span class="ytp-hover-text">CC Transcript</span>
      `;

      // Intercept click on CAPTURE phase so the <a> link NEVER navigates away!
      const triggerCopy = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const mode = e.shiftKey ? 'plain' : 'timestamps';
        await handleHoverCardCopy(btn, vid, mode);
      };

      btn.addEventListener('click', triggerCopy, true);
      btn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);
      btn.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);

      // Attach mouseenter/mouseleave to parent card to show button ONLY on hover
      const cardContainer = a.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytd-thumbnail') || a;
      
      cardContainer.addEventListener('mouseenter', () => {
        btn.classList.add('ytp-card-show');
      });
      cardContainer.addEventListener('mouseleave', () => {
        if (!btn.classList.contains('ytp-card-copying')) {
          btn.classList.remove('ytp-card-show');
        }
      });

      a.appendChild(btn);
    });
  }

  // Initialization
  function init() {
    injectActionButtons();
    injectFloatingTrigger();
    injectHoverButtonsToThumbnails();
    initVideoSync();

    // Fast regular scan every 800ms for dynamic infinite-scroll feed
    setInterval(injectHoverButtonsToThumbnails, 800);

    // Also scan on mousemove
    let mouseTimer = null;
    document.addEventListener('mousemove', () => {
      if (!mouseTimer) {
        mouseTimer = setTimeout(() => {
          mouseTimer = null;
          injectHoverButtonsToThumbnails();
        }, 400);
      }
    }, { passive: true });

    // Listen to video play event to start pre-fetching instantly
    document.addEventListener('play', (e) => {
      if (e.target && e.target.tagName === 'VIDEO') {
        preloadTranscript();
      }
    }, true);

    window.addEventListener('yt-navigate-finish', () => {
      checkUrlChange();
      injectHoverButtonsToThumbnails();
    });
    window.addEventListener('spfdone', () => {
      checkUrlChange();
      injectHoverButtonsToThumbnails();
    });
    window.addEventListener('popstate', () => {
      checkUrlChange();
      injectHoverButtonsToThumbnails();
    });

    let debounceTimer = null;
    const navObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        checkUrlChange();
        injectHoverButtonsToThumbnails();
      }, 150);
    });

    navObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
