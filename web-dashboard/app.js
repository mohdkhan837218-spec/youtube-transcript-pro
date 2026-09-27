// YouTube Transcript Pro - Web Studio & Bulk Extractor Logic

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Mode Switching
  const tabSingle = document.getElementById('tab-single-mode');
  const tabBulk = document.getElementById('tab-bulk-mode');
  const sectionSingle = document.getElementById('section-single');
  const sectionBulk = document.getElementById('section-bulk');

  // DOM Elements - Single Studio
  const urlInput = document.getElementById('yt-url-input');
  const btnFetch = document.getElementById('btn-fetch');
  const sampleBtns = document.querySelectorAll('.sample-btn');

  const workspaceGrid = document.getElementById('workspace-grid');
  const welcomePlaceholder = document.getElementById('welcome-placeholder');
  const videoFrame = document.getElementById('video-frame');

  const metaTitle = document.getElementById('meta-video-title');
  const metaVideoId = document.getElementById('meta-video-id');
  const metaDuration = document.getElementById('meta-duration');
  const metaAuthor = document.getElementById('meta-author');
  const metaLangDetected = document.getElementById('meta-lang-detected');

  const selectTransLang = document.getElementById('select-trans-lang');
  const btnToggleTimestamps = document.getElementById('btn-toggle-timestamps');
  const btnCopyTimestamps = document.getElementById('btn-copy-timestamps');
  const btnCopyPlain = document.getElementById('btn-copy-plain');

  const btnExportDropdown = document.getElementById('btn-export-dropdown');
  const exportMenu = document.getElementById('export-menu');
  const btnDownloadTxt = document.getElementById('btn-download-txt');
  const btnDownloadSrt = document.getElementById('btn-download-srt');
  const btnDownloadMd = document.getElementById('btn-download-md');
  const btnDownloadJson = document.getElementById('btn-download-json');

  const searchInput = document.getElementById('transcript-search');
  const searchCount = document.getElementById('search-count');
  const container = document.getElementById('transcript-container');

  const statLines = document.getElementById('stat-lines');
  const statWords = document.getElementById('stat-words');
  const statTime = document.getElementById('stat-time');
  const toastEl = document.getElementById('toast');

  // DOM Elements - Bulk Extractor
  const bulkInput = document.getElementById('bulk-urls-input');
  const bulkCounterBadge = document.getElementById('bulk-counter-badge');
  const btnSampleBulk = document.getElementById('btn-sample-bulk');
  const bulkLangSelect = document.getElementById('bulk-lang-select');
  const bulkFormatSelect = document.getElementById('bulk-format-select');
  const btnBulkExtract = document.getElementById('btn-bulk-extract');

  const bulkProgressWrap = document.getElementById('bulk-progress-wrap');
  const bulkProgressText = document.getElementById('bulk-progress-text');
  const bulkProgressPct = document.getElementById('bulk-progress-pct');
  const bulkProgressBar = document.getElementById('bulk-progress-bar');

  const bulkResultsSection = document.getElementById('bulk-results-section');
  const bulkStatsSummary = document.getElementById('bulk-stats-summary');
  const bulkCardsList = document.getElementById('bulk-cards-list');

  const btnBulkCopyTimestamps = document.getElementById('btn-bulk-copy-timestamps');
  const btnBulkCopyPlain = document.getElementById('btn-bulk-copy-plain');
  const btnBulkDownloadTxt = document.getElementById('btn-bulk-download-txt');
  const btnBulkDownloadJson = document.getElementById('btn-bulk-download-json');
  const btnBulkClear = document.getElementById('btn-bulk-clear');

  // State Variables
  let currentVideoId = null;
  let currentVideoData = null;
  let currentSegments = [];
  let showTimestamps = true;
  let activeSearch = '';
  let bulkExtractedData = [];

  // ==========================================
  // TAB SWITCHING (Single vs Bulk)
  // ==========================================
  tabSingle.addEventListener('click', () => {
    tabSingle.classList.add('active');
    tabBulk.classList.remove('active');
    sectionSingle.style.display = 'block';
    sectionBulk.style.display = 'none';
  });

  tabBulk.addEventListener('click', () => {
    tabBulk.classList.add('active');
    tabSingle.classList.remove('active');
    sectionBulk.style.display = 'block';
    sectionSingle.style.display = 'none';
  });

  // ==========================================
  // HELPERS: Toast & Clipboard
  // ==========================================
  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2800);
  }

  // Escape creator-controlled data (video titles, caption text) before innerHTML injection
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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

  function downloadFile(content, fileName, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Extract 11-character Video ID from any URL string
  function extractVideoId(text) {
    if (!text) return null;
    const clean = text.trim();

    // If it's a full URL, ensure it is a YouTube domain (ignore vidiq, google, twitter, etc.)
    if (/^https?:\/\//i.test(clean)) {
      if (!clean.includes('youtube.com') && !clean.includes('youtu.be')) {
        return null;
      }
    }

    // Direct 11-char video ID (e.g. KLo6jeXrTdw, V5N-GhXtbU8)
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;

    const mWatch = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (mWatch) return mWatch[1];
    const mShorts = clean.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (mShorts) return mShorts[1];
    const mShortUrl = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (mShortUrl) return mShortUrl[1];
    const mEmbed = clean.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (mEmbed) return mEmbed[1];
    const mLive = clean.match(/\/live\/([a-zA-Z0-9_-]{11})/);
    if (mLive) return mLive[1];
    return null;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `[${m}:${s}]`;
  }

  // ==========================================
  // UNIVERSAL XML PARSER (Format 3 & Classic)
  // ==========================================
  function parseTranscriptXml(rawXml) {
    const results = [];
    if (!rawXml) return results;

    // 1. Try format 3 / srv3: <p t="ms" ...><s>word</s>...</p>
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
      if (!text) {
        text = body.replace(/<[^>]+>/g, '');
      }
      text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (text) {
        results.push({
          start: startMs / 1000,
          end: (startMs + durMs) / 1000,
          duration: durMs / 1000,
          timeStr: formatTime(startMs / 1000),
          text
        });
      }
    }

    if (results.length > 0) return results;

    // 2. Fallback to classic: <text start="s" dur="s">text</text>
    const textRegex = /<text\b[^>]*\bstart="([^"]*)"[^>]*>([\s\S]*?)<\/text>/gi;
    while ((match = textRegex.exec(rawXml)) !== null) {
      const startSec = parseFloat(match[1]) || 0;
      const durMatch = match[0].match(/\bdur="([^"]*)"/i);
      const durSec = durMatch ? (parseFloat(durMatch[1]) || 3) : 3;
      let text = match[2].replace(/<[^>]+>/g, '');
      text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (text) {
        results.push({
          start: startSec,
          end: startSec + durSec,
          duration: durSec,
          timeStr: formatTime(startSec),
          text
        });
      }
    }

    return results;
  }

  // ==========================================
  // MULTI-TIER LIVE EXTRACTION ENGINE
  // ==========================================
  async function fetchVideoData(vid, targetLang = null) {
    // TIER 1: Chrome Extension Background Service Worker (Primary & 100% Reliable inside Chrome!)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const bgResponse = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'FETCH_TRANSCRIPT',
            videoId: vid,
            targetLang: targetLang
          }, (res) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(res);
            }
          });
        });

        if (bgResponse && bgResponse.success && bgResponse.data) {
          return bgResponse.data;
        }
      } catch (err) {
        console.warn('Background worker fetch error:', err);
      }
    }

    // TIER 2: Local Server API (http://localhost:3000)
    try {
      const serverUrl = `http://localhost:3000/api/transcript?videoId=${encodeURIComponent(vid)}${targetLang ? `&lang=${encodeURIComponent(targetLang)}` : ''}`;
      const serverResp = await fetch(serverUrl);
      if (serverResp.ok) {
        const data = await serverResp.json();
        if (data && !data.error) {
          return data;
        }
      }
    } catch (e) {}

    // TIER 3: Relative API endpoint (if running from same origin)
    try {
      const relUrl = `/api/transcript?videoId=${encodeURIComponent(vid)}${targetLang ? `&lang=${encodeURIComponent(targetLang)}` : ''}`;
      const relResp = await fetch(relUrl);
      if (relResp.ok) {
        const data = await relResp.json();
        if (data && !data.error) {
          return data;
        }
      }
    } catch (e) {}

    // TIER 4: Direct Android InnerTube API (If browser allows CORS)
    try {
      const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
          videoId: vid
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const videoDetails = data?.videoDetails || {};
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

        if (Array.isArray(tracks) && tracks.length > 0) {
          let selectedTrack = tracks[0];
          if (targetLang && targetLang !== 'original') {
            const match = tracks.find(t => t.languageCode === targetLang);
            if (match) selectedTrack = match;
          }

          const xmlResp = await fetch(selectedTrack.baseUrl);
          if (xmlResp.ok) {
            const rawXml = await xmlResp.text();
            let segments = parseTranscriptXml(rawXml);

            if (targetLang && targetLang !== 'original' && selectedTrack.languageCode !== targetLang && segments.length > 0) {
              segments = await clientTranslateSegments(segments, targetLang);
            }

            return {
              videoId: vid,
              title: videoDetails.title || `Video (${vid})`,
              author: videoDetails.author || '',
              duration: formatDuration(videoDetails.lengthSeconds),
              thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
              hasCaptions: segments.length > 0,
              tracks: tracks.map(t => ({
                lang: t.languageCode,
                name: t.name?.runs?.[0]?.text || t.languageCode
              })),
              selectedTrack: selectedTrack.languageCode,
              segments,
              totalLines: segments.length,
              totalWords: segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0)
            };
          }
        }
      }
    } catch (e) {}

    return {
      videoId: vid,
      title: `YouTube Video (${vid})`,
      author: '',
      duration: '',
      thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      hasCaptions: false,
      tracks: [],
      segments: [],
      totalLines: 0,
      totalWords: 0
    };
  }

  function formatDuration(secStr) {
    const sec = parseInt(secStr || '0', 10);
    if (!sec) return 'Live';
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  async function clientTranslateSegments(segments, targetLang) {
    if (!segments || segments.length === 0 || !targetLang || targetLang === 'original') return segments;
    try {
      const texts = segments.map(s => s.text);
      const chunk = texts.join('\n');
      const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(chunk)}`;
      const resp = await fetch(transUrl);
      if (resp.ok) {
        const data = await resp.json();
        const translatedCombined = (data[0] || []).map(item => item[0]).join('');
        const translatedLines = translatedCombined.split('\n');
        return segments.map((s, idx) => ({
          ...s,
          text: (translatedLines[idx] && translatedLines[idx].trim()) ? translatedLines[idx].trim() : s.text
        }));
      }
    } catch (err) {
      console.warn('Translation failed, retaining original text:', err);
    }
    return segments;
  }

  // ==========================================
  // SECTION 1: SINGLE VIDEO STUDIO LOGIC
  // ==========================================
  async function loadSingleVideo(vid) {
    if (!vid) {
      showToast('Please enter a valid YouTube video link or ID');
      return;
    }

    btnFetch.disabled = true;
    btnFetch.querySelector('span').textContent = 'Extracting...';

    try {
      const data = await fetchVideoData(vid, selectTransLang.value);
      currentVideoId = vid;
      currentVideoData = data;
      currentSegments = data.segments || [];

      // Update UI
      welcomePlaceholder.style.display = 'none';
      workspaceGrid.style.display = 'grid';

      // Embed YouTube Player
      videoFrame.src = `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&enablejsapi=1`;

      // Update Metadata Card
      metaTitle.textContent = data.title;
      metaVideoId.textContent = `ID: ${vid}`;
      metaDuration.textContent = `Duration: ${data.duration || '0:00'}`;
      if (metaAuthor) metaAuthor.textContent = data.author ? `Channel: ${data.author}` : '';
      metaLangDetected.textContent = data.hasCaptions 
        ? `Captions: ${data.selectedTrack || 'Available'} (${data.totalLines} lines)` 
        : '⚠️ No Captions Available';

      renderSingleTranscript();

      if (data.hasCaptions) {
        showToast(`Extracted ${data.totalLines} lines in 1-Click! ✨`);
        if (data.translationFailed) {
          setTimeout(() => showToast('⚠️ Translation service unavailable — original language dikhayi ja rahi hai'), 2900);
        }
      } else {
        showToast('Is video par subtitles available nahi hain ⚠️');
      }
    } catch (err) {
      console.error(err);
      showToast('Extraction failed, please check connection.');
    } finally {
      btnFetch.disabled = false;
      btnFetch.querySelector('span').textContent = 'Extract Transcript';
    }
  }

  function renderSingleTranscript() {
    container.innerHTML = '';
    const filtered = currentSegments.filter(s => {
      if (!activeSearch) return true;
      return s.text.toLowerCase().includes(activeSearch) || s.timeStr.includes(activeSearch);
    });

    if (activeSearch) {
      searchCount.textContent = `${filtered.length} found`;
    } else {
      searchCount.textContent = '';
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #888;">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <div>${activeSearch ? `No lines matching "${escapeHtml(activeSearch)}"` : 'No captions available for this video.'}</div>
        </div>
      `;
      updateStats(0, 0);
      return;
    }

    filtered.forEach(s => {
      const row = document.createElement('div');
      row.className = 'seg-row';

      let textHtml = escapeHtml(s.text);
      if (activeSearch) {
        const regex = new RegExp(`(${activeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        textHtml = textHtml.replace(regex, '<mark>$1</mark>');
      }

      const pillHtml = showTimestamps 
        ? `<button class="timestamp-pill" data-time="${s.start}" title="Click to jump video to ${escapeHtml(s.timeStr)}">${escapeHtml(s.timeStr)}</button>`
        : '';

      row.innerHTML = `
        ${pillHtml}
        <div class="seg-text">${textHtml}</div>
      `;

      // Jump video when timestamp clicked
      const pill = row.querySelector('.timestamp-pill');
      if (pill) {
        pill.onclick = () => {
          jumpVideoTo(s.start);
        };
      }

      container.appendChild(row);
    });

    const totalWords = currentSegments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
    updateStats(currentSegments.length, totalWords);
  }

  function updateStats(lines, words) {
    statLines.textContent = `${lines} lines`;
    statWords.textContent = `${words.toLocaleString()} words`;
    if (currentSegments.length > 0) {
      statTime.textContent = currentSegments[currentSegments.length - 1].timeStr.replace(/[[\]]/g, '');
    } else {
      statTime.textContent = '00:00';
    }
  }

  function jumpVideoTo(seconds) {
    if (videoFrame && videoFrame.contentWindow) {
      videoFrame.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [seconds, true]
      }), '*');
      showToast(`Jumped to ${formatTime(seconds)} ⏩`);
    }
  }

  // Single mode buttons
  btnFetch.addEventListener('click', () => {
    const raw = urlInput.value;
    const vid = extractVideoId(raw);
    loadSingleVideo(vid);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnFetch.click();
    }
  });

  sampleBtns.forEach(b => {
    b.addEventListener('click', () => {
      const url = b.getAttribute('data-url');
      if (url) {
        urlInput.value = url;
        btnFetch.click();
      }
    });
  });

  // Toggle Timestamps
  btnToggleTimestamps.addEventListener('click', () => {
    showTimestamps = !showTimestamps;
    btnToggleTimestamps.classList.toggle('active', showTimestamps);
    renderSingleTranscript();
  });

  // 1-Click Copy with Timestamps
  btnCopyTimestamps.addEventListener('click', async () => {
    if (currentSegments.length === 0) {
      showToast('No transcript available to copy!');
      return;
    }
    const text = currentSegments.map(s => `${s.timeStr} ${s.text}`).join('\n');
    await safeCopyToClipboard(text);
    showToast(`Copied ${currentSegments.length} lines with exact timestamps! ⏱️`);
  });

  // 1-Click Copy Plain Text
  btnCopyPlain.addEventListener('click', async () => {
    if (currentSegments.length === 0) {
      showToast('No transcript available to copy!');
      return;
    }
    const text = currentSegments.map(s => s.text).join(' ');
    await safeCopyToClipboard(text);
    showToast(`Copied plain text (${currentSegments.length} lines) for AI! 📋`);
  });

  // Export Dropdown
  btnExportDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    if (exportMenu) exportMenu.classList.remove('show');
  });

  btnDownloadTxt.addEventListener('click', () => {
    if (currentSegments.length === 0) return;
    const title = currentVideoData?.title || currentVideoId;
    const content = currentSegments.map(s => `${s.timeStr} ${s.text}`).join('\n');
    downloadFile(content, `${title}-transcript.txt`);
    showToast('Downloaded .txt transcript! 💾');
  });

  btnDownloadSrt.addEventListener('click', () => {
    if (currentSegments.length === 0) return;
    const title = currentVideoData?.title || currentVideoId;
    let srt = '';
    currentSegments.forEach((s, idx) => {
      const startSrt = formatSrtTime(s.start);
      const endSrt = formatSrtTime(s.end);
      srt += `${idx + 1}\n${startSrt} --> ${endSrt}\n${s.text}\n\n`;
    });
    downloadFile(srt, `${title}-subtitles.srt`);
    showToast('Downloaded .srt subtitles! 💾');
  });

  function formatSrtTime(sec) {
    const hrs = Math.floor(sec / 3600).toString().padStart(2, '0');
    const mins = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(sec % 60).toString().padStart(2, '0');
    const ms = Math.floor((sec % 1) * 1000).toString().padStart(3, '0');
    return `${hrs}:${mins}:${secs},${ms}`;
  }

  btnDownloadMd.addEventListener('click', () => {
    if (currentSegments.length === 0) return;
    const title = currentVideoData?.title || currentVideoId;
    let md = `# ${title}\n\n`;
    md += `**Video URL**: https://www.youtube.com/watch?v=${currentVideoId}\n`;
    md += `**Extracted**: ${currentSegments.length} lines\n\n---\n\n`;
    currentSegments.forEach(s => {
      md += `- **${s.timeStr}** ${s.text}\n`;
    });
    downloadFile(md, `${title}-transcript.md`);
    showToast('Downloaded .md Markdown! 💾');
  });

  btnDownloadJson.addEventListener('click', () => {
    if (currentSegments.length === 0) return;
    const title = currentVideoData?.title || currentVideoId;
    const obj = {
      videoId: currentVideoId,
      title: title,
      totalLines: currentSegments.length,
      segments: currentSegments
    };
    downloadFile(JSON.stringify(obj, null, 2), `${title}-transcript.json`, 'application/json');
    showToast('Downloaded .json structure! 💾');
  });

  // Keyword Search Filter
  searchInput.addEventListener('input', (e) => {
    activeSearch = e.target.value.toLowerCase().trim();
    renderSingleTranscript();
  });

  // Language Change in Studio
  selectTransLang.addEventListener('change', async () => {
    if (!currentVideoId) return;
    showToast('Translating transcript... 🌐');
    await loadSingleVideo(currentVideoId);
  });

  // ==========================================
  // SECTION 2: BULK EXTRACTOR LOGIC
  // ==========================================
  function parseBulkUrls(text) {
    if (!text) return [];
    const tokens = text.split(/[\r\n,;\s]+/);
    const videoIds = [];
    tokens.forEach(t => {
      const vid = extractVideoId(t);
      if (vid && !videoIds.includes(vid)) {
        videoIds.push(vid);
      }
    });
    return videoIds;
  }

  // Update URL count badge as user types
  bulkInput.addEventListener('input', () => {
    const ids = parseBulkUrls(bulkInput.value);
    bulkCounterBadge.textContent = `${ids.length} URL${ids.length === 1 ? '' : 's'} Detected`;
  });

  // Sample Bulk URLs button
  btnSampleBulk.addEventListener('click', () => {
    bulkInput.value = `https://www.youtube.com/watch?v=KLo6jeXrTdw\nhttps://youtu.be/-_gdh8aTtBA\nhttps://www.youtube.com/watch?v=kqtD5dpn9C8`;
    const ids = parseBulkUrls(bulkInput.value);
    bulkCounterBadge.textContent = `${ids.length} URLs Detected`;
  });

  // Try the server's parallel /api/bulk-transcript endpoint (same-origin, then localhost:3000).
  // Falls back to null so the caller can use the slower sequential per-video path.
  async function tryBulkApiEndpoint(vids, targetLang) {
    const endpoints = ['/api/bulk-transcript', 'http://localhost:3000/api/bulk-transcript'];
    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: vids.map(v => `https://www.youtube.com/watch?v=${v}`),
            lang: targetLang
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.results) && data.results.length > 0) {
            return data.results;
          }
        }
      } catch (e) {}
    }
    return null;
  }

  function updateBulkSummary(total) {
    const successCount = bulkExtractedData.filter(d => d.hasCaptions).length;
    const totalLinesCount = bulkExtractedData.reduce((acc, d) => acc + (d.totalLines || 0), 0);
    bulkStatsSummary.textContent = `Total: ${bulkExtractedData.length}/${total} • ✅ ${successCount} with captions • ⏱️ ${totalLinesCount.toLocaleString()} total lines`;
  }

  // Run Bulk Extraction
  btnBulkExtract.addEventListener('click', async () => {
    const vids = parseBulkUrls(bulkInput.value);
    if (vids.length === 0) {
      showToast('Please enter at least 1 valid YouTube link!');
      return;
    }

    btnBulkExtract.disabled = true;
    btnBulkExtract.querySelector('span').textContent = '⏳ Processing Queue...';
    bulkProgressWrap.style.display = 'block';
    bulkResultsSection.style.display = 'block';
    bulkCardsList.innerHTML = '';
    bulkExtractedData = [];

    const targetLang = bulkLangSelect.value;
    const total = vids.length;

    // FAST PATH: parallel server-side bulk extraction (much quicker for 10-50 videos)
    let usedFastPath = false;
    if (total > 1) {
      bulkProgressText.textContent = `⚡ Fast bulk mode: sending ${total} videos to server in parallel...`;
      bulkProgressPct.textContent = '…';
      const fastResults = await tryBulkApiEndpoint(vids, targetLang);
      if (fastResults) {
        fastResults.forEach((item, i) => {
          bulkExtractedData.push(item);
          renderBulkCardItem(item, i);
        });
        updateBulkSummary(total);
        usedFastPath = true;
      }
    }

    if (!usedFastPath) {
    for (let i = 0; i < total; i++) {
      const vid = vids[i];
      const pct = Math.round(((i) / total) * 100);
      bulkProgressPct.textContent = `${pct}%`;
      bulkProgressBar.style.width = `${pct}%`;
      bulkProgressText.textContent = `Extracting video ${i + 1} of ${total} (ID: ${vid})...`;

      try {
        const item = await fetchVideoData(vid, targetLang);
        bulkExtractedData.push(item);
        renderBulkCardItem(item, i);
      } catch (err) {
        console.error('Bulk item failed:', vid, err);
        const errorItem = {
          videoId: vid,
          title: `YouTube Video (${vid})`,
          hasCaptions: false,
          error: true,
          segments: [],
          totalLines: 0
        };
        bulkExtractedData.push(errorItem);
        renderBulkCardItem(errorItem, i);
      }

      // Update summary counter
      updateBulkSummary(total);
    }
    } // end sequential fallback

    // Finished
    bulkProgressPct.textContent = `100%`;
    bulkProgressBar.style.width = `100%`;
    bulkProgressText.textContent = `✅ Finished! Processed all ${total} videos.`;
    btnBulkExtract.disabled = false;
    btnBulkExtract.querySelector('span').textContent = '🚀 Extract All Transcripts';
    showToast(`Bulk extraction finished for ${total} videos! 🎉`);
  });

  // Render individual card in Bulk Results
  function renderBulkCardItem(item, index) {
    const card = document.createElement('div');
    card.className = `bulk-card-item ${item.hasCaptions ? '' : 'status-error'}`;

    const statusBadge = item.hasCaptions
      ? `<span class="bulk-status-badge success">✅ ${item.totalLines} lines • ${escapeHtml(item.selectedTrack || 'Captions')}</span>`
      : `<span class="bulk-status-badge no-captions">⚠️ No Subtitles</span>`;

    const safeTitle = escapeHtml(item.title);
    const safeThumb = escapeHtml(item.thumbnail || '');
    card.innerHTML = `
      <div class="bulk-card-main">
        <img class="bulk-card-thumb" src="${safeThumb}" alt="${safeTitle}" onerror="this.src='https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg'" />
        
        <div class="bulk-card-info">
          <div class="bulk-card-title">${safeTitle}</div>
          <div class="bulk-card-meta">
            ${statusBadge}
            <span>Duration: ${escapeHtml(item.duration || 'N/A')}</span>
            <span>ID: ${item.videoId}</span>
          </div>
        </div>

        <div class="bulk-card-actions">
          <button class="btn-card-action primary btn-card-copy-ts" ${!item.hasCaptions ? 'disabled' : ''} title="Copy with timestamps">
            ⚡ Copy Timestamps
          </button>
          <button class="btn-card-action btn-card-copy-plain" ${!item.hasCaptions ? 'disabled' : ''} title="Copy plain text for AI">
            📋 Plain Text
          </button>
          <button class="btn-card-action btn-card-toggle-view" ${!item.hasCaptions ? 'disabled' : ''}>
            👁️ View
          </button>
          <button class="btn-card-action btn-card-open-studio" title="Open in Studio with interactive video player">
            ↗️ Open in Studio
          </button>
        </div>
      </div>

      <!-- Expandable Accordion Drawer -->
      <div class="bulk-accordion-drawer">
        ${item.segments && item.segments.length > 0 
          ? item.segments.map(s => `
              <div class="bulk-drawer-line">
                <span class="bulk-drawer-time">${escapeHtml(s.timeStr)}</span>
                <span class="bulk-drawer-text">${escapeHtml(s.text)}</span>
              </div>
            `).join('')
          : '<div style="color:#888;">No captions available to display.</div>'
        }
      </div>
    `;

    // Copy Timestamps button
    const btnCopyTs = card.querySelector('.btn-card-copy-ts');
    if (btnCopyTs) {
      btnCopyTs.onclick = async () => {
        if (!item.segments || item.segments.length === 0) return;
        const text = item.segments.map(s => `${s.timeStr} ${s.text}`).join('\n');
        const ok = await safeCopyToClipboard(text);
        if (ok) {
          const orig = btnCopyTs.innerHTML;
          btnCopyTs.innerHTML = '✅ Copied!';
          showToast(`Copied ${item.segments.length} lines with timestamps! ⏱️`);
          setTimeout(() => { btnCopyTs.innerHTML = orig; }, 2000);
        } else {
          showToast('Failed to copy to clipboard');
        }
      };
    }

    // Copy Plain button
    const btnCopyPl = card.querySelector('.btn-card-copy-plain');
    if (btnCopyPl) {
      btnCopyPl.onclick = async () => {
        if (!item.segments || item.segments.length === 0) return;
        const text = item.segments.map(s => s.text).join(' ');
        const ok = await safeCopyToClipboard(text);
        if (ok) {
          const orig = btnCopyPl.innerHTML;
          btnCopyPl.innerHTML = '✅ Copied!';
          showToast(`Copied plain text for "${item.title}"! 📋`);
          setTimeout(() => { btnCopyPl.innerHTML = orig; }, 2000);
        } else {
          showToast('Failed to copy to clipboard');
        }
      };
    }

    // Toggle Drawer View
    const btnToggle = card.querySelector('.btn-card-toggle-view');
    const drawer = card.querySelector('.bulk-accordion-drawer');
    if (btnToggle && drawer) {
      btnToggle.onclick = () => {
        const isOpen = drawer.classList.toggle('open');
        btnToggle.textContent = isOpen ? '✕ Close' : '👁️ View';
      };
    }

    // Open in Studio
    const btnStudio = card.querySelector('.btn-card-open-studio');
    if (btnStudio) {
      btnStudio.onclick = () => {
        tabSingle.click();
        urlInput.value = `https://www.youtube.com/watch?v=${item.videoId}`;
        loadSingleVideo(item.videoId);
      };
    }

    bulkCardsList.appendChild(card);
  }

  // Bulk Global Action: Copy All Combined (Timestamps)
  btnBulkCopyTimestamps.addEventListener('click', async () => {
    const valid = bulkExtractedData.filter(d => d.hasCaptions && d.segments && d.segments.length > 0);
    if (valid.length === 0) {
      showToast('No extracted transcripts available to copy!');
      return;
    }

    let combined = '';
    valid.forEach((d, idx) => {
      combined += `==================================================\n`;
      combined += `VIDEO ${idx + 1}: ${d.title}\n`;
      combined += `URL: https://www.youtube.com/watch?v=${d.videoId}\n`;
      combined += `Duration: ${d.duration} | Lines: ${d.totalLines}\n`;
      combined += `==================================================\n\n`;
      combined += d.segments.map(s => `${s.timeStr} ${s.text}`).join('\n');
      combined += `\n\n\n`;
    });

    const ok = await safeCopyToClipboard(combined);
    if (ok) {
      const orig = btnBulkCopyTimestamps.innerHTML;
      btnBulkCopyTimestamps.innerHTML = '✅ All Copied!';
      showToast(`Copied all ${valid.length} video transcripts with timestamps! ⏱️`);
      setTimeout(() => { btnBulkCopyTimestamps.innerHTML = orig; }, 2500);
    }
  });

  // Bulk Global Action: Copy All Combined (Plain Text)
  btnBulkCopyPlain.addEventListener('click', async () => {
    const valid = bulkExtractedData.filter(d => d.hasCaptions && d.segments && d.segments.length > 0);
    if (valid.length === 0) {
      showToast('No extracted transcripts available to copy!');
      return;
    }

    let combined = '';
    valid.forEach((d, idx) => {
      combined += `### Video ${idx + 1}: ${d.title} (https://www.youtube.com/watch?v=${d.videoId})\n\n`;
      combined += d.segments.map(s => s.text).join(' ');
      combined += `\n\n---\n\n`;
    });

    const ok = await safeCopyToClipboard(combined);
    if (ok) {
      const orig = btnBulkCopyPlain.innerHTML;
      btnBulkCopyPlain.innerHTML = '✅ All Copied!';
      showToast(`Copied plain text of all ${valid.length} videos! 📄`);
      setTimeout(() => { btnBulkCopyPlain.innerHTML = orig; }, 2500);
    }
  });

  // Bulk Global Action: Download Combined .TXT (respects the Format dropdown)
  btnBulkDownloadTxt.addEventListener('click', () => {
    const valid = bulkExtractedData.filter(d => d.hasCaptions && d.segments.length > 0);
    if (valid.length === 0) return;

    const fmt = (bulkFormatSelect && bulkFormatSelect.value) || 'timestamps';
    const fmtSeg = (s) => fmt === 'plain' ? s.text : `${s.timeStr} ${s.text}`;
    const joiner = fmt === 'plain' ? ' ' : '\n';

    let combined = '';
    valid.forEach((d, idx) => {
      combined += `==================================================\n`;
      combined += `VIDEO ${idx + 1}: ${d.title}\n`;
      combined += `URL: https://www.youtube.com/watch?v=${d.videoId}\n`;
      combined += `==================================================\n\n`;
      combined += d.segments.map(fmtSeg).join(joiner);
      combined += `\n\n\n`;
    });

    downloadFile(combined, `bulk-transcripts-${valid.length}-videos${fmt === 'plain' ? '-plain' : ''}.txt`);
    showToast(`Downloaded combined TXT for ${valid.length} videos! 💾`);
  });

  // Bulk Global Action: Download JSON
  btnBulkDownloadJson.addEventListener('click', () => {
    if (bulkExtractedData.length === 0) return;
    downloadFile(JSON.stringify(bulkExtractedData, null, 2), `bulk-transcripts.json`, 'application/json');
    showToast('Exported JSON data for all videos! 💾');
  });

  // Bulk Clear
  btnBulkClear.addEventListener('click', () => {
    bulkExtractedData = [];
    bulkCardsList.innerHTML = '';
    bulkResultsSection.style.display = 'none';
    bulkProgressWrap.style.display = 'none';
    bulkInput.value = '';
    bulkCounterBadge.textContent = '0 URLs Detected';
    showToast('Cleared bulk queue!');
  });

  // Auto-load video when opened via extension popup "Open in Studio" (?url=...)
  try {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url');
    if (sharedUrl) {
      const vid = extractVideoId(sharedUrl);
      if (vid) {
        urlInput.value = sharedUrl;
        loadSingleVideo(vid);
      }
    }
  } catch (e) {}
});
