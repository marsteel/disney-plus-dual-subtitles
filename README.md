# 📺 Disney+ Dual Subtitles

[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Browser](https://img.shields.io/badge/Chromium-Supported-success.svg)](https://www.google.com/chrome/)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/nkidlbnenlhfjbgpinebodghbocmdpdh?label=chrome%20web%20store)]((https://chromewebstore.google.com/detail/disney+-dual-subtitles/nkidlbnenlhfjbgpinebodghbocmdpdh))

A high-performance Chrome & Edge extension designed for a premium **dual-subtitle experience** on Disney+. It addresses unique platform challenges like sliding-window manifests, synchronization drift, and layout jitter to provide a seamless, Hollywood-standard viewing experience.

---

## 🚀 Getting Started

New to the extension? Check out our **[Interactive Getting Started Guide](https://disney-plus-dual-subtitles.magang.net/getting-started.html)** for a visual walkthrough on installation and setup.

---

## ✨ Key Features

- **🛡️ Anti-Drift Technology (New)**: Automatically detects Absolute vs. Relative VTT timestamps to fix common 7.5-minute subtitle offsets.
- **♾️ Infinite Streams**: Accumulates cues from Disney's "Sliding Window" manifests into a persistent local database—no more disappearing subtitles.
- **🎭 Zero-Jitter Display**: Stable, dual-slot layout prevents subtitles from "jumping" or "shaking" when line counts fluctuate.
- **⚡ High-Precision Sync**: Triple-tier synchronization using Shadow DOM extraction, Sticky Offsets, and Visual Snap (self-healing).
- **🌍 Dynamic Localization**: 
  - Automagically detects precise track variants (e.g., `zh-hk`, `en-us`).
  - Full UI support for **7 languages**: English, Chinese (Simplified/Traditional), Japanese, Korean, Dutch, and French.
- **🖥️ Native Fullscreen**: Subtitles intelligently migrate to stay visible during native browser fullscreen transitions.
- **⚙️ Hot Reloading**: Adjust colors, sizes, and transparency in the popup and see them apply **instantly** without reloading.

---

## 🛠 Advanced Architecture

### 1. Absolute Anchoring
Disney+ uses 6-second VTT segments. We align these using `X-TIMESTAMP-MAP` data to map them onto the movie's global timeline, ensuring frame-perfect placement regardless of network jitter.

### 2. Zero Reflow Layout
To prevent the annoying "jumping" effect found in other extensions:
- **Fixed Vertical Slots**: Each track occupies a reserved vertical space of `2.5em`.
- **Visibility Control**: Uses `visibility: hidden` instead of `display: none` to keep the layout structure rigid even when one language is silent.

### 3. Shadow DOM Synchronization
We bypass the unstable UI clock and extract the "Golden Source" of time directly from the `disney-web-player-ui` internal shadow roots, ensuring our subtitles stay in lock-step with the native Disney+ engine.

---

## ⌨️ Hotkeys

| Key | Action |
|-----|--------|
| `[` | Advance subtitles by 0.5s (Sync earlier) |
| `]` | Delay subtitles by 0.5s (Sync later) |

---

## 🛠 Installation

1. Clone/Download this repository.
2. Go to `chrome://extensions/` in your browser.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the extension folder.
5. Open [Disney+](https://www.disneyplus.com), select your languages in the popup, and enjoy!

---

## ❓ Troubleshooting & Support

- **Subtitles out of sync?** Use the `[` and `]` keys to adjust manually.
- **Subtitles not appearing?** Try **reloading the webpage**. If that fails, **restart the browser**.
- **Found a bug?** Please report it on our **[GitHub Issues](https://github.com/marsteel/disney-plus-dual-subtitles/issues)** page.

---

## ❤️ Acknowledgements

This project was inspired by and built upon the foundational research of:
- [Movie-Subtitles](https://github.com/gignupg/Movie-Subtitles) by **gignupg** — Original Disney+ subtitle interception logic.
- [dosentmatter](https://github.com/dosentmatter) — Significant architecture contributions ([PR #28](https://github.com/gignupg/Movie-Subtitles/pull/28)).
- [someone-aka-sum1](https://github.com/someone-aka-sum1) — Enhancements and fixes ([PR #29](https://github.com/gignupg/Movie-Subtitles/pull/29)).

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
