# Chrome Web Store Listing: YouTube Transcript Pro

## Store Listing Metadata

- **Name**: YouTube Transcript Pro — 1-Click Multi-Language & Timestamps
- **Short Description** (max 132 characters): Extract YouTube video transcripts in Hindi, English, and 100+ languages in 1-click with exact timestamps and fast copy.
- **Category**: Productivity / Tools
- **Version**: 1.0.0
- **Primary Language**: English

## Detailed Description

YouTube Transcript Pro makes extracting and translating transcripts from any YouTube video effortless and instantaneous. 

Whether you are studying tutorials, creating content, synthesizing podcast notes, or feeding context to AI tools (ChatGPT, Claude, Gemini), YouTube Transcript Pro gives you the entire transcript in 1 click right beneath the video player.

### Key Features:
- ⚡ **1-Click Timestamp Copy**: Copy the entire transcript formatted with exact timestamps (`[00:15] Hello world...`) directly to your clipboard.
- 📄 **1-Click Plain Text Copy**: Get clean, continuous text without timestamps, perfectly formatted for AI prompts and note-taking.
- 🌐 **Multi-Language & Auto-Translate**: Extract native captions or auto-translate any video into Hindi (हिन्दी), English, Urdu, Spanish, French, German, Arabic, and 100+ languages.
- ⏱️ **Interactive Playback Sync**: Click any timestamp in the transcript to jump the YouTube video directly to that exact second.
- 🔍 **Real-Time Keyword Search**: Search for specific topics or phrases within the transcript with live highlighting.
- 💾 **Universal Export Options**: Download transcripts instantly in SubRip Subtitle (.SRT), Plain Text (.TXT), Markdown (.MD), or JSON format.
- 🎨 **Native Aesthetics**: Elegant dark/light glassmorphic interface that blends seamlessly with YouTube's interface.

---

## Permissions Justification

| Permission | Justification |
|---|---|
| `storage` | Used to save user preferences, such as default language (Hindi, English) and preferred timestamp display format. |
| `tabs` | Used to detect the active YouTube video URL and title when using the toolbar popup. |
| `scripting` | Required to communicate and synchronize transcript playback events with the active YouTube video tab. |
| `*://*.youtube.com/*` (Host Permission) | Needed to inject the 1-Click Transcript button and read video caption tracks on YouTube video pages. |

---

## Privacy & Data Use Disclosure

- **Single Purpose**: Extracting video transcripts and captions for the user.
- **Data Collection**: No personal data or browsing history is collected, stored on external servers, or sold. All transcript parsing and translation requests are handled directly inside the user's browser session with YouTube.
