# 🚀 Cognito Call

**Local-first meeting recorder.** Record Chrome tabs (Meet/Zoom/Teams) → save `.webm` locally → AI summaries (coming soon).

No cloud. No bots joining calls. No data leaks.

<!-- [![Extension Status](https://img.shields.io/badge/Extension-🔄%20Dev-blue)](chrome://extensions/) -->

## 🎯 Current Status: Phase 1 - Tab Recorder

✅ Chrome extension records any meeting tab locally
✅ Captures tab audio + microphone (both sides of the call)
✅ Optimized file size: VP9 codec, ~8-10 MB per minute
✅ Human-readable filenames: `CognitoCall_2026-03-15_15-30-25.webm`
✅ Saves `.webm` to `~/Downloads/CognitoCall/`
✅ Works: Google Meet, Zoom Web, Teams Web, Webex

**Try it now:**
```bash
git clone https://github.com/helloprincepal/cognito-call.git
cd cognito-call
```
Then navigate to `chrome://extensions/` → **Load unpacked** → select `packages/extension/`

## 🛠 Tech Stack

- **Icons:** [Remix Icon](https://remixicon.com/) (Standard icon library for the project).
- **Core:** Manifest V3, Web Audio API, Offscreen Documents.
- **Design:** Inter Typography, Local-first UX.

## 🛤️ Roadmap


| Phase | Status | What |
| :--- | :--- | :--- |
| 🟢 1 | 🔄 Live | Chrome extension → local `.webm` |
| 🟡 2 | Next | Native Mac app + Chrome dashboard |
| 🔴 3 | Soon | Whisper + Ollama local AI |

## 🚀 Quick Start

### 1. Install
```bash
git clone https://github.com/helloprincepal/cognito-call.git
cd cognito-call
```

### 2. Load extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the `packages/extension/` directory.

### 3. Test
1. Open Google Meet, Zoom Web, or Teams Web.
2. Click the Cognito Call extension icon in your browser toolbar.
3. Click **Record**.
4. Click **Stop** when finished; your video will be saved to `~/Downloads/CognitoCall/`.

## 🤝 Contributing
1. Fork the repo.
2. Load `packages/extension/` in Chrome.
3. Test recording functionality.
4. Submit a PR.

## 📱 Install Guide
For complete installation instructions, check out our [Install Guide](docs/INSTALL-EXTENSION.md).

## 🛡️ Privacy First
- 🔒 **100% local processing**
- 🚫 **No analytics**
- 🚫 **No external APIs**
- 🚫 **No phoning home**

---

Built with ❤️ by Prince Pal  
📫 Contact: [HelloPrincePal@gmail.com](mailto:HelloPrincePal@gmail.com)