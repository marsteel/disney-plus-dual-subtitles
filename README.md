# Disney+ Dual Subtitles

A high-performance Chrome extension designed for a premium dual-subtitle experience on Disney+. It addresses the platform's unique synchronization, manifest, and layout challenges to provide seamless, jitter-free playback.

## ✨ Key Features

- **Infinite Subtitle Streams**: Automatically handles Disney's "Sliding Window" manifests. It accumulates subtitle cues into a persistent database to ensure you never lose subtitles during long movies.
- **Zero-Jitter Display**: Uses a stable, dual-slot layout that prevents subtitles from "jumping" or "shaking" when contents or line counts change.
- **High-Precision Sync**: Triple-tier synchronization engine (Shadow DOM + Sticky Offset + Visual Snap).
- **Dynamic Language Selection**: Automatically detects all available precise language variants (e.g., `zh-hk`, `zh-hans`, `en-us`) and displays human-readable names.
- **Native Fullscreen Support**: Automatically migrates the subtitle overlay to stay visible during native fullscreen transitions.
- **Hot Reloading**: Settings apply instantly upon clicking "Save" without needing a page refresh.
- **Global i18n Support**: Full localization for 7 languages including English, Chinese, Japanese, and more.
- **Individual Track Toggle**: Easily turn off either primary or secondary track independently using the "Off" option.
- **Navigation Safety**: Automatically clears state when navigating between different videos to prevent subtitle mixing.

## 🛠 Advanced Architectures

### 1. Infinite Streaming & Absolute Anchoring
Disney+ uses short-lived M3U8 manifestations. The extension solves this by:
- **Absolute VTT Anchoring**: Parsing `X-TIMESTAMP-MAP` to align subtitles with the movie's global timeline, ignoring relative offsets.
- **Cumulative Storage**: Merging all intercepted segments into a unified primary/secondary database.
- **Base URL Tracking**: Correcting identifying segments even when direct language codes are missing from the URL.

### 2. Display Stability (Zero Reflow)
To solve the "Jumping Subtitles" problem common in other extensions:
- **Fixed Vertical Slots**: Each subtitle track occupies a fixed `2.5em` vertical space (enough for 2 lines).
- **Visibility vs. Display**: Uses `visibility: hidden` to keep the layout structure stable even when one language is silent.
- **Subtitle Persistence**: Implements a **300ms grace period** to bridge micro-gaps between primary and secondary track timings.

### 3. Synchronization & Global Offset
- **Shadow DOM "Golden Source"**: Extracts precise movie time from `disney-web-player-ui` internal shadow roots.
- **Sticky Offset Logic**: Only calibrates the global offset during seeks or initialization. This prevents the "Forward-Backward Flickering" caused by the UI clock's 1-second discretization.
- **Visual Snap (Self-Healing)**: Continuously compares native Disney+ subtitle text with our database to automatically "snap" back into sync if any drift occurs.

## ⌨️ Hotkeys

- **`[`**: Advance subtitles by 0.5s (Sync earlier).
- **`]`**: Delay subtitles by 0.5s (Sync later).

## 🚀 Installation

1. Clone or download the repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the extension folder.
5. Open Disney+, choose your languages in the popup, and click **Save**. Changes will apply instantly!
