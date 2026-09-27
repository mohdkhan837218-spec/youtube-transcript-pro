// YouTube Transcript Pro - Built-in Local Server & API Proxy
// High-Reliability YouTube Transcript Extraction Engine

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { YoutubeTranscript } = require('youtube-transcript');

const PORT = process.env.PORT || 3000;
const WEB_DIR = path.join(__dirname, 'web-dashboard');

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
      const sec = Math.floor(startMs / 1000);
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      results.push({
        start: startMs / 1000,
        end: (startMs + durMs) / 1000,
        duration: durMs / 1000,
        timeStr: `[${m}:${s}]`,
        text
      });
    }
  }

  if (results.length > 0) return results;

  // 2. Fallback to classic format: <text start="s" dur="s">text</text>
  const textRegex = /<text\b[^>]*\bstart="([^"]*)"[^>]*>([\s\S]*?)<\/text>/gi;
  while ((match = textRegex.exec(rawXml)) !== null) {
    const startSec = parseFloat(match[1]) || 0;
    const durMatch = match[0].match(/\bdur="([^"]*)"/i);
    const durSec = durMatch ? (parseFloat(durMatch[1]) || 3) : 3;
    let text = match[2].replace(/<[^>]+>/g, '');
    text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    if (text) {
      const sec = Math.floor(startSec);
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      results.push({
        start: startSec,
        end: startSec + durSec,
        duration: durSec,
        timeStr: `[${m}:${s}]`,
        text
      });
    }
  }

  return results;
}

// Translate segments batch — returns { segments, translated }.
// NEVER silently misalign: if the provider merges/splits lines or is
// unreachable, original text is kept and translated=false is reported.
async function translateSegments(segments, targetLang) {
  if (!segments || segments.length === 0 || !targetLang || targetLang === 'original') {
    return { segments, translated: false };
  }
  try {
    const texts = segments.map(s => s.text);
    const chunk = texts.join('\n');
    const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(chunk)}`;
    const resp = await fetch(transUrl);
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok || !contentType.includes('application/json')) {
      console.warn(`Translation warning: provider unavailable (HTTP ${resp.status}), keeping original text`);
      return { segments, translated: false };
    }
    const data = await resp.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      console.warn('Translation warning: unexpected provider response shape, keeping original text');
      return { segments, translated: false };
    }
    const translatedCombined = data[0].map(item => item[0]).join('');
    const translatedLines = translatedCombined.split('\n');
    if (translatedLines.length !== segments.length) {
      console.warn(`Translation warning: line count mismatch (${translatedLines.length} vs ${segments.length}), keeping original text to avoid wrong timestamps`);
      return { segments, translated: false };
    }
    const out = segments.map((s, idx) => ({
      ...s,
      text: (translatedLines[idx] && translatedLines[idx].trim()) ? translatedLines[idx].trim() : s.text
    }));
    return { segments: out, translated: true };
  } catch (err) {
    console.warn('Translation warning:', err.message);
    return { segments, translated: false };
  }
}

// Multi-Tier Transcript and Metadata Extractor
async function fetchVideoTranscriptAndMeta(videoId, targetLang = null) {
  // 1. Fetch Video Metadata via oEmbed
  let title = `YouTube Video (${videoId})`;
  let author = '';
  try {
    const oembedResp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembedResp.ok) {
      const oe = await oembedResp.json();
      if (oe.title) title = oe.title;
      if (oe.author_name) author = oe.author_name;
    }
  } catch (e) {}

  let rawSegments = null;
  let detectedLang = 'hi';

  // Tier 1: Try YoutubeTranscript with targetLang (if requested)
  if (targetLang && targetLang !== 'original') {
    try {
      rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang: targetLang });
      detectedLang = targetLang;
    } catch (e) {
      // If requested language not directly found on video, fallback to default
    }
  }

  // Tier 2: Try YoutubeTranscript default (native / auto-generated captions)
  if (!rawSegments || rawSegments.length === 0) {
    try {
      rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
      if (rawSegments && rawSegments.length > 0 && rawSegments[0].lang) {
        detectedLang = rawSegments[0].lang;
      }
    } catch (e) {}
  }

  // Tier 3: InnerTube API with authentic Android User-Agent fallback
  if (!rawSegments || rawSegments.length === 0) {
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
        const vDetails = data?.videoDetails || {};
        if (vDetails.title) title = vDetails.title;
        if (vDetails.author) author = vDetails.author;
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

        if (tracks.length > 0) {
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
            let tierTranslated = false;
            let tierTranslationFailed = false;

            if (targetLang && targetLang !== 'original' && selectedTrack.languageCode !== targetLang && segments.length > 0) {
              const tr = await translateSegments(segments, targetLang);
              segments = tr.segments;
              tierTranslated = tr.translated;
              tierTranslationFailed = !tr.translated;
            }

            if (segments.length > 0) {
              const lastSec = segments[segments.length - 1].end;
              const durMin = Math.floor(lastSec / 60);
              const durSec = (Math.floor(lastSec) % 60).toString().padStart(2, '0');

              return {
                videoId,
                title,
                author,
                duration: `${durMin}:${durSec}`,
                durationSeconds: Math.floor(lastSec),
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                hasCaptions: true,
                tracks: tracks.map(t => ({
                  lang: t.languageCode,
                  name: t.name?.runs?.[0]?.text || t.languageCode,
                  isAuto: !!t.kind && t.kind === 'asr'
                })),
                selectedTrack: selectedTrack.languageCode,
                translated: tierTranslated,
                translationFailed: tierTranslationFailed,
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
  }

  // If no transcripts found (creator disabled CC on YouTube)
  if (!rawSegments || rawSegments.length === 0) {
    return {
      videoId,
      title,
      author,
      duration: 'N/A',
      durationSeconds: 0,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      hasCaptions: false,
      tracks: [],
      translated: false,
      translationFailed: false,
      segments: [],
      totalLines: 0,
      totalWords: 0,
      plainText: '',
      timestampedText: '',
      reason: 'No captions/subtitles enabled by creator on YouTube'
    };
  }

  // Format segments
  let segments = rawSegments.map(s => {
    const startSec = Math.round((s.offset / 1000) * 100) / 100;
    const durSec = Math.round((s.duration / 1000) * 100) / 100;
    const sec = Math.floor(startSec);
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const sRem = (sec % 60).toString().padStart(2, '0');
    const cleanText = s.text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    return {
      start: startSec,
      duration: durSec,
      end: Math.round((startSec + durSec) * 100) / 100,
      timeStr: `[${m}:${sRem}]`,
      text: cleanText
    };
  });

  // Translate if requested and language differs
  let translated = false;
  let translationFailed = false;
  if (targetLang && targetLang !== 'original' && targetLang !== detectedLang && segments.length > 0) {
    try {
      const tr = await translateSegments(segments, targetLang);
      segments = tr.segments;
      translated = tr.translated;
      translationFailed = !tr.translated;
    } catch (e) {}
  }

  const lastSec = segments.length > 0 ? segments[segments.length - 1].end : 0;
  const durMin = Math.floor(lastSec / 60);
  const durSec = (Math.floor(lastSec) % 60).toString().padStart(2, '0');

  return {
    videoId,
    title,
    author,
    duration: `${durMin}:${durSec}`,
    durationSeconds: Math.floor(lastSec),
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    hasCaptions: true,
    tracks: [{ lang: detectedLang, name: detectedLang, isAuto: true }],
    selectedTrack: (targetLang && (translated || targetLang === detectedLang)) ? targetLang : detectedLang,
    translated,
    translationFailed,
    segments,
    totalLines: segments.length,
    totalWords: segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0),
    plainText: segments.map(s => s.text).join(' '),
    timestampedText: segments.map(s => `${s.timeStr} ${s.text}`).join('\n')
  };
}

// Extract Video ID
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

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// Create Server
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API 1: Single Video Transcript
  if (pathname === '/api/transcript' && req.method === 'GET') {
    const rawVid = parsedUrl.query.videoId || parsedUrl.query.url;
    const vid = extractVideoId(rawVid);
    const lang = parsedUrl.query.lang || null;

    if (!vid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing YouTube videoId / URL' }));
      return;
    }

    try {
      const result = await fetchVideoTranscriptAndMeta(vid, lang);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('API Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API 2: Bulk Transcript Extraction
  if (pathname === '/api/bulk-transcript' && req.method === 'POST') {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyStr || '{}');
        const urls = Array.isArray(body.urls) ? body.urls : (body.text || '').split(/[\r\n,]+/);
        const lang = body.lang || null;

        const videoIds = [];
        for (const u of urls) {
          const id = extractVideoId(u);
          if (id && !videoIds.includes(id)) {
            videoIds.push(id);
          }
        }

        if (videoIds.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No valid YouTube URLs provided' }));
          return;
        }

        // Limit to 50 videos max per bulk request
        const sliceIds = videoIds.slice(0, 50);
        const results = [];

        // Concurrency = 3
        for (let i = 0; i < sliceIds.length; i += 3) {
          const chunk = sliceIds.slice(i, i + 3);
          const chunkResults = await Promise.all(chunk.map(async (vid) => {
            try {
              const data = await fetchVideoTranscriptAndMeta(vid, lang);
              return data;
            } catch (err) {
              return {
                videoId: vid,
                title: `Video (${vid})`,
                hasCaptions: false,
                error: err.message,
                segments: [],
                plainText: '',
                timestampedText: ''
              };
            }
          }));
          results.push(...chunkResults);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          totalRequested: sliceIds.length,
          successfulCount: results.filter(r => r.hasCaptions).length,
          results
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static File Serving (hardened: path traversal blocked, repo root restricted to public assets)
  const ROOT_ASSET_PREFIXES = ['/icons/', '/assets/'];

  function safeResolve(baseDir, requestPath) {
    try {
      let p = String(requestPath || '').split('?')[0].split('#')[0];
      try { p = decodeURIComponent(p); } catch (e) { return null; }
      if (p === '/') p = '/index.html';
      const resolved = path.normalize(path.join(baseDir, p));
      const baseNorm = path.normalize(baseDir);
      if (resolved !== baseNorm && !resolved.startsWith(baseNorm + path.sep)) return null;
      return resolved;
    } catch (e) { return null; }
  }

  function send404() {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }

  let filePath = safeResolve(WEB_DIR, pathname);

  // Also support serving extension assets (icons/, assets/) from repo root — nothing else.
  // server.js, package.json, .git, etc. are NEVER served.
  if (!filePath || !fs.existsSync(filePath)) {
    const isPublicAsset = ROOT_ASSET_PREFIXES.some(pre => pathname === pre.slice(0, -1) || pathname.startsWith(pre));
    if (isPublicAsset) {
      const rootResolved = safeResolve(__dirname, pathname);
      if (rootResolved && fs.existsSync(rootResolved)) filePath = rootResolved;
    }
  }

  if (!filePath) {
    send404();
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      send404();
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

const HOST = process.env.HOST || '127.0.0.1'; // localhost-only by default; set HOST=0.0.0.0 to expose on LAN
server.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`⚡ YouTube Transcript Pro Web Studio is running!`);
  console.log(`🌐 URL: http://${HOST}:${PORT}`);
  console.log(`API: http://${HOST}:${PORT}/api/transcript?videoId=WMmE14yOLZk`);
  console.log(`======================================================\n`);
});
