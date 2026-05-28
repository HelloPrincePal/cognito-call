# 🏗️ Cognito Call Architecture

> **🚀 Quick Start (How to open the app):**  
> To launch the desktop application, open your terminal, navigate to the project folder, and run:  
> ```bash
> cd cognito-desktop
> npm run tauri dev
> ```

This document outlines the technical architecture of the entire Cognito Call stack, which consists of three distinct subsystems working together to achieve a 100% local, offline-first meeting transcription pipeline.

---

## 1. The Chrome Extension (Session Packager)

The Chrome extension acts as the primary recording mechanism. It is built using Manifest V3 and heavily relies on Offscreen Documents to bypass strict browser background-throttling rules.

### Key Tools:
- `chrome.tabCapture` API
- `chrome.offscreen` API
- `MediaRecorder` API

### How it works:
1. **Dual Capture:** When the user clicks record, the extension captures two separate audio streams: the remote participants' audio (`tabCapture`) and the user's local microphone (`getUserMedia`).
2. **Audio Isolation (The Genius Move):** Instead of mixing these streams, the extension creates **three** distinct MediaRecorders running in parallel:
   - `video.webm` (Video + Mixed Audio)
   - `tab.webm` (Remote Audio only)
   - `mic.webm` (Local Microphone only)
3. **Session Packaging:** It automatically generates a timestamped directory (e.g., `~/Downloads/CognitoCall/2026-05-19_10-30-00/`) and saves the files into it.
4. **Large File Handling (64MB Bypass):** Manifest V3 imposes a ~64MB limit on IPC messages (`chrome.runtime.sendMessage`). Instead of Base64 encoding massive video files (which causes silent failures on 30+ minute recordings), the offscreen document generates a localized `blob:chrome-extension://` URL. It passes this tiny URL string to the service worker, which then leverages `chrome.downloads.download` to pull the gigabytes of data directly from memory.
5. **Local Unmuting:** Chrome inherently mutes the tab when `tabCapture` is active. The extension circumvents this by piping the `tabAudioStream` into a hidden `<audio>` element within the offscreen document, allowing the user to hear the meeting normally.

---

## 2. The Cognito Gallery (Desktop App)

A native macOS application used to browse recordings and trigger the heavy AI processing.

### Key Tools:
- **Tauri v2** (Application Framework)
- **Rust** (Backend logic and file system access)
- **React + Vite + Tailwind CSS** (Frontend UI)

### How it works:
1. **Local Access:** The Rust backend scans the `~/Downloads/CognitoCall/` directory and exposes the sessions to the React frontend.
2. **Video Streaming:** Tauri's `convertFileSrc` securely streams the local `.webm` files directly into the HTML5 `<video>` player.
3. **Process Orchestration:** When the user clicks "Generate AI Transcript", the Rust backend spawns a child process (`std::process::Command`), directly invoking the isolated Python virtual environment (`venv`) to execute the transcription sidecar.
4. **The Karaoke UI:** Once the Python script completes, React parses the outputted `transcript.json`. It maps the word-level timestamps to the video player's `currentTime`, highlighting the exact spoken word in real-time.

---

## 3. The Local AI Pipeline (Python Sidecar)

The "Brain" of the application. A completely offline, token-free Python pipeline that processes the isolated audio streams.

### Key Tools:
- **WhisperX** (Transcription & Word-level Alignment)
- **simple-diarizer** (Spectral Clustering for Speaker Identification)
- **FFmpeg / Torchaudio** (Audio Extraction)

### How it works:
1. **Transcription:** WhisperX transcribes both `mic.webm` and `tab.webm` separately, generating exact millisecond timestamps for every spoken word.
2. **Token-Free Diarization:** Instead of relying on gated models like Pyannote (which require HuggingFace API tokens and Accept-Terms agreements), the pipeline uses `simple-diarizer`. It runs a Spectral Clustering mathematical algorithm exclusively on `tab.webm` to separate the remote voices into "Speaker 1", "Speaker 2", etc.
3. **Custom Stitcher:** The script merges the locally transcribed microphone array ("Me") with the diarized remote array ("Speaker X"), sorts all the words chronologically, and compiles them into a unified `transcript.json`.
4. **Security Patches:** The script contains monkeypatches for PyTorch 2.6+ `weights_only` serialization blocks to ensure older model checkpoints load flawlessly on modern systems without security exceptions.

---

## The Workflow summary:
`Chrome Extension (webm)` ➡️ `Downloads Folder` ➡️ `Tauri (Rust) triggers Python` ➡️ `WhisperX + Clustering (transcript.json)` ➡️ `React (Karaoke UI)`
