// YouTube Transcript Pro - Background Service Worker (Manifest V3)
// Fully authorized host permissions for *://*.youtube.com/* & https://translate.googleapis.com/*

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      defaultLanguage: 'hi',
      timestampFormat: 'standard',
      autoCopy: false
    });
    console.log('[YouTube Transcript Pro] Installed successfully!');
  }
});

// Format seconds to [MM:SS]
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `[${m}:${s}]`;
}

function formatDuration(secStr) {
  const sec = parseInt(secStr || '0', 10);
  if (!sec) return 'Live';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Universal XML Parser for YouTube Captions (Supports format 3, classic, word <s>, etc.)
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

// Robustly extract the "captionTracks": [...] JSON array from watch-page HTML.
// The old /"captionTracks":\s*(\[[^\]]+\])/ regex broke on nested brackets
// (e.g. "runs":[{"text":...}]) and killed this whole fallback tier.
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

// Background Multi-Tier Extractor (Local Server + Web Scrape + Authenticated InnerTube)
async function fetchInnerTubeBackground(videoId, targetLang = null) {
  // Tier 1: Check Local Server API (lightning fast if studio running)
  try {
    const sResp = await fetch(`http://localhost:3000/api/transcript?videoId=${encodeURIComponent(videoId)}${targetLang ? `&lang=${encodeURIComponent(targetLang)}` : ''}`);
    if (sResp.ok) {
      const sData = await sResp.json();
      if (sData && sData.hasCaptions && sData.segments?.length > 0) {
        return sData;
      }
    }
  } catch (e) {}

  // Tier 2: Authenticated Android InnerTube with correct User-Agent
  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
        videoId: videoId
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      const videoDetails = data?.videoDetails || {};
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

      if (Array.isArray(tracks) && tracks.length > 0) {
        let selectedTrack = tracks[0];
        if (targetLang && targetLang !== 'original') {
          const found = tracks.find(t => t.languageCode === targetLang);
          if (found) selectedTrack = found;
        }

        const xmlResp = await fetch(selectedTrack.baseUrl, {
          headers: { 'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' }
        });
        if (xmlResp.ok) {
          const xml = await xmlResp.text();
          let segments = parseTranscriptXml(xml);

          let bgTranslated = false;
          if (targetLang && targetLang !== 'original' && selectedTrack.languageCode !== targetLang && segments.length > 0) {
            const tr = await translateSegmentsBackground(segments, targetLang);
            segments = tr.segments;
            bgTranslated = tr.translated;
          }

          if (segments.length > 0) {
            return {
              videoId,
              title: videoDetails.title || `Video (${videoId})`,
              author: videoDetails.author || '',
              duration: formatDuration(videoDetails.lengthSeconds),
              thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              hasCaptions: true,
              tracks: tracks.map(t => ({
                lang: t.languageCode,
                name: t.name?.runs?.[0]?.text || t.languageCode,
                isAuto: !!t.kind && t.kind === 'asr'
              })),
              selectedTrack: bgTranslated ? targetLang : selectedTrack.languageCode,
              translated: bgTranslated,
              segments,
              totalLines: segments.length,
              totalWords: segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0),
              plainText: segments.map(s => s.text).join(' '),
              timestampedText: segments.map(s => `${s.timeStr} ${s.text}`).join('\n')
            };
          }
        }
      }
    }
  } catch (e) {}

  // Tier 3: Web Page Scraping Fallback
  try {
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }
    });
    if (pageResp.ok) {
      const html = await pageResp.text();
      const tracks = extractCaptionTracks(html);
      if (tracks) {
        if (Array.isArray(tracks) && tracks.length > 0) {
          let selectedTrack = tracks[0];
          if (targetLang && targetLang !== 'original') {
            const match = tracks.find(t => t.languageCode === targetLang);
            if (match) selectedTrack = match;
          }
          const trResp = await fetch(selectedTrack.baseUrl);
          if (trResp.ok) {
            const xml = await trResp.text();
            let segments = parseTranscriptXml(xml);
            if (segments.length > 0) {
              return {
                videoId,
                title: `YouTube Video (${videoId})`,
                author: '',
                duration: '',
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                hasCaptions: true,
                tracks: tracks.map(t => ({ lang: t.languageCode, name: t.name?.simpleText || t.languageCode })),
                selectedTrack: selectedTrack.languageCode,
                translated: false,
                segments,
                totalLines: segments.length,
                totalWords: segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0),
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
    videoId,
    title: `Video (${videoId})`,
    author: '',
    duration: '',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    hasCaptions: false,
    tracks: [],
    selectedTrack: null,
    translated: false,
    segments: [],
    totalLines: 0,
    totalWords: 0,
    plainText: '',
    timestampedText: ''
  };
}

// Background Translation Helper — never misaligns lines or fails silently
async function translateSegmentsBackground(segments, targetLang) {
  if (!segments || segments.length === 0 || !targetLang || targetLang === 'original') {
    return { segments, translated: false };
  }
  try {
    const texts = segments.map(s => s.text);
    const chunk = texts.join('\n');
    const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(chunk)}`;
    const transResp = await fetch(transUrl);
    const contentType = transResp.headers.get('content-type') || '';
    if (!transResp.ok || !contentType.includes('application/json')) {
      return { segments, translated: false };
    }
    const transData = await transResp.json();
    if (!Array.isArray(transData) || !Array.isArray(transData[0])) {
      return { segments, translated: false };
    }
    const translatedCombined = transData[0].map(item => item[0]).join('');
    const translatedLines = translatedCombined.split('\n');
    if (translatedLines.length !== segments.length) {
      return { segments, translated: false }; // keep originals, don't attach wrong translations to timestamps
    }
    return {
      segments: segments.map((s, idx) => ({
        ...s,
        text: (translatedLines[idx] && translatedLines[idx].trim()) ? translatedLines[idx].trim() : s.text
      })),
      translated: true
    };
  } catch (e) {}
  return { segments, translated: false };
}

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'FETCH_TRANSCRIPT') {
        const data = await fetchInnerTubeBackground(message.videoId, message.targetLang);
        sendResponse({ success: true, data });
      } else if (message.type === 'FETCH_BULK_TRANSCRIPTS') {
        const videoIds = message.videoIds || [];
        const results = [];
        for (const vid of videoIds) {
          try {
            const data = await fetchInnerTubeBackground(vid, message.targetLang);
            results.push(data);
          } catch (err) {
            results.push({
              videoId: vid,
              title: `Video (${vid})`,
              hasCaptions: false,
              segments: [],
              totalLines: 0
            });
          }
        }
        sendResponse({ success: true, results });
      } else if (message.type === 'GET_ACTIVE_YOUTUBE_TAB') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const isYouTube = tab?.url && (tab.url.includes('youtube.com/watch') || tab.url.includes('youtu.be/'));
        sendResponse({ tab, isYouTube });
      } else if (message.type === 'EXECUTE_ON_ACTIVE_TAB') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const res = await chrome.tabs.sendMessage(tab.id, message.payload);
          sendResponse({ success: true, result: res });
        } else {
          sendResponse({ success: false, error: 'No active tab found' });
        }
      }
    } catch (err) {
      console.warn('[YTP Background] Error handling message:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true; // Keep message channel open for async response
});
