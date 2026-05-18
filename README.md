# 🚀 Cognito Call
![Version 0.4.0](https://img.shields.io/badge/version-0.4.0-blue)

**Local-first meeting recorder.** Record Chrome tabs (Meet/Zoom/Teams) → save `.webm` locally → AI summaries (coming soon).

No cloud. No bots joining calls. No data leaks.

## 📦 Cognito Call Extension
The core recorder is a lightweight Chrome extension that works 100% offline.

### 📥 Download Latest (v0.4.0)
You can download the extension as a ZIP file directly from our GitHub Releases:
*   **Download:** [cognito-call-v0.4.0.zip](https://github.com/HelloPrincePal/cognito-call/releases/latest)
*   **Next Step:** Follow the [Installation Guide](#-installation-guide) below.

### ✨ Core Extension Features
*   ✅ **Tab + Mic Capture:** Records any meeting tab locally (Google Meet, Zoom, Teams, Webex).
*   ✅ **Both Sides of the Call:** Captures both your microphone and the meeting audio.
*   ✅ **Session Packager:** Creates a dedicated timestamped workspace folder per recording (e.g., `2026-05-09_14-30-00/`).
*   ✅ **Triple File Export:** Simultaneously saves a mixed `video.webm`, an isolated `tab.opus`, and an isolated `mic.opus` for AI transcription.
*   ✅ **Optimized File Size:** Uses VP9 and Opus codecs to maintain high quality at just ~8-10 MB per minute.
*   ✅ **Local Unmuting:** You can still hear the tab audio from your speakers while it records securely in the background.

---

## 🛠 Tech Stack
- **Icons:** [Lucide Icons](https://lucide.dev/)
- **Core:** Manifest V3, Web Audio API, Offscreen Documents.
- **Design:** Inter Typography, Local-first UX.

## 🛤️ Roadmap
| Phase | Status | What |
| :--- | :--- | :--- |
| 🟢 1 | 🔄 Live | Chrome extension → local `.webm` |
| 🟢 2 | 🔄 Dev | Chrome Dashboard / Tauri Desktop (Browse & Play recordings) |
| 🔴 3 | Soon | Local AI (Whisper + Ollama) for summaries |

---

## 📖 Installation Guide

### For Users (Download ZIP)
1.  **Download** the [latest ZIP file](https://github.com/HelloPrincePal/cognito-call/releases/latest).
2.  **Extract** the ZIP folder to a safe place on your computer.
3.  Open Chrome and navigate to `chrome://extensions/`.
4.  Enable **Developer mode** (toggle in the top right corner).
5.  Click **Load unpacked** and select the folder you just extracted.

### For Developers (Git Clone)
1.  Clone the repo:
    ```bash
    git clone https://github.com/HelloPrincePal/cognito-call.git
    cd cognito-call
    ```
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode**.
4.  Click **Load unpacked** and select the `packages/extension/` directory.

### For Developers (Desktop App)
To run the Phase 2 Tauri Desktop App (Video Gallery):
1. Ensure you have Rust and Node.js installed.
2. Navigate to the desktop app folder:
    ```bash
    cd cognito-desktop
    ```
3. Install dependencies:
    ```bash
    npm install
    ```
4. Start the Tauri development server:
    ```bash
    npm run tauri dev
    ```

---

## 🛡️ Privacy First
- 🔒 **100% local processing**
- 🚫 **No analytics or tracking**
- 🚫 **No external APIs or data transmission**

See our complete [Privacy Policy](PRIVACY_POLICY.md) for more details.

---

Built with ❤️ by Prince Pal  
📫 Contact: [HelloPrincePal@gmail.com](mailto:HelloPrincePal@gmail.com)
