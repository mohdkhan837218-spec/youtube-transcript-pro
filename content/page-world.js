// YouTube Transcript Pro - Page World Injector (Runs in YouTube MAIN World)
(() => {
  if (window.__ytTranscriptProInjected) return;
  window.__ytTranscriptProInjected = true;

  // Extract caption tracks and player data
  function getCaptionsData() {
    let playerResponse = null;
    const moviePlayer = document.getElementById('movie_player');

    try {
      if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
        playerResponse = moviePlayer.getPlayerResponse();
      }
    } catch (e) {}

    if (!playerResponse && window.ytInitialPlayerResponse) {
      playerResponse = window.ytInitialPlayerResponse;
    }

    const videoDetails = playerResponse?.videoDetails || {};
    const captionsRenderer = playerResponse?.captions?.playerCaptionsTracklistRenderer || {};
    let captionTracks = captionsRenderer?.captionTracks || [];
    const translationLanguages = captionsRenderer?.translationLanguages || [];

    // Also check moviePlayer option tracklist as fallback
    if ((!captionTracks || captionTracks.length === 0) && moviePlayer && typeof moviePlayer.getOption === 'function') {
      try {
        const optionTracks = moviePlayer.getOption('captions', 'tracklist');
        if (Array.isArray(optionTracks) && optionTracks.length > 0) {
          captionTracks = optionTracks.map(t => ({
            baseUrl: t.baseUrl || t.url,
            name: { simpleText: t.name || t.displayName },
            languageCode: t.languageCode || t.lang,
            isTranslatable: t.isTranslatable ?? true
          }));
        }
      } catch (e) {}
    }

    const vid = videoDetails.videoId || new URLSearchParams(window.location.search).get('v');

    return {
      videoId: vid,
      title: videoDetails.title || document.title,
      author: videoDetails.author || '',
      lengthSeconds: videoDetails.lengthSeconds || 0,
      audioTracks: captionsRenderer?.audioTracks || [],
      defaultAudioTrackIndex: captionsRenderer?.defaultAudioTrackIndex ?? 0,
      captionTracks: captionTracks.map((t, idx) => ({
        index: idx,
        baseUrl: t.baseUrl,
        name: t.name?.simpleText || (t.name?.runs && t.name.runs[0]?.text) || t.languageCode || 'Track',
        languageCode: t.languageCode,
        vssId: t.vssId || '',
        kind: t.kind || '',
        isAuto: t.kind === 'asr' || (typeof t.vssId === 'string' && t.vssId.startsWith('a.')),
        isTranslatable: t.isTranslatable ?? true
      })),
      translationLanguages: translationLanguages.map(l => ({
        languageCode: l.languageCode,
        languageName: l.languageName?.simpleText || (l.languageName?.runs && l.languageName.runs[0]?.text) || l.languageCode
      }))
    };
  }

  // Fetch timedtext inside YouTube origin (has all active session cookies and tokens)
  async function fetchTimedTextDirectly(url) {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          'Accept': '*/*'
        }
      });
      if (!res.ok) return { ok: false, status: res.status, text: '' };
      const text = await res.text();
      return { ok: true, status: res.status, text };
    } catch (e) {
      return { ok: false, error: e.message, text: '' };
    }
  }

  // Seek video playback to specific seconds
  function seekTo(seconds) {
    try {
      const moviePlayer = document.getElementById('movie_player');
      if (moviePlayer && typeof moviePlayer.seekTo === 'function') {
        moviePlayer.seekTo(seconds, true);
        moviePlayer.playVideo();
        return;
      }
    } catch (e) {}

    const video = document.querySelector('video');
    if (video) {
      video.currentTime = seconds;
      video.play();
    }
  }

  // Handle messages from content script
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'YTP_CONTENT') return;

    if (event.data.type === 'GET_PLAYER_DATA') {
      const data = getCaptionsData();
      window.postMessage({
        source: 'YTP_PAGE',
        type: 'PLAYER_DATA_RESPONSE',
        requestId: event.data.requestId,
        data
      }, '*');
    } else if (event.data.type === 'FETCH_TIMEDTEXT') {
      const result = await fetchTimedTextDirectly(event.data.url);
      window.postMessage({
        source: 'YTP_PAGE',
        type: 'FETCH_TIMEDTEXT_RESPONSE',
        requestId: event.data.requestId,
        result
      }, '*');
    } else if (event.data.type === 'SEEK_VIDEO') {
      seekTo(event.data.seconds);
    }
  });

  // Notify content script that page-world is ready
  window.postMessage({
    source: 'YTP_PAGE',
    type: 'PAGE_WORLD_READY'
  }, '*');
})();
