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
6. **In-Browser WebM EBML Remuxing (`webm-fixer.js`):** Chrome's `MediaRecorder` outputs live EBML streams lacking `Duration` headers and Matroska `Cues` keyframe index tables. Prior to dispatching downloads, `recorder.js` passes recorded blobs through `webm-fixer.js`, which parses EBML elements in memory, indexes keyframe byte offsets, and injects `Duration` and `Cues` metadata so that exported `.webm` and `.opus` files are seekable in all standard video players.

---

## 2. The Cognito Gallery (Desktop App)
 
 A native macOS application used to browse recordings and trigger the heavy AI processing.
 
 ### Key Tools:
 - **Tauri v2** (Application Framework)
 - **Rust** (Backend logic and file system access)
 - **React + Vite + Tailwind CSS** (Frontend UI)
 - **Lucide React** (UI Iconography)
 
 ### How it works:
 1. **Local Access:** The Rust backend scans the `~/Downloads/CognitoCall/` directory and exposes the sessions to the React frontend.
 2. **Video Streaming:** Tauri's `convertFileSrc` securely streams the local `.webm` files directly into the HTML5 `<video>` player.
 3. **Process Orchestration:** When the user clicks "Generate AI Transcript", the Rust backend spawns a child process (`std::process::Command`), directly invoking the isolated Python virtual environment (`venv`) to execute the transcription sidecar.
 4. **The Vertical Stack Layout & Karaoke UI:** Once the Python script completes, React parses the outputted `transcript.json`. The player is pinned at the top while the tabs (`Transcript`, `Notes`, `Action Items`) sit at the bottom. It maps the word-level timestamps to the video player's `currentTime`, highlighting the exact spoken word in real-time with a custom purple theme.
 5. **Dual Exporters:** Users can export the transcript line-by-sentence via the UI. Standard HTML5 Blobs are created on-the-fly, allowing downloads of a clean, segment-level JSON file or a fully formatted `.txt` script.
 
 ---
 
 ## 3. The Local AI Pipeline (Python Sidecar)
 
 The "Brain" of the application. A completely offline, token-free Python pipeline that processes the isolated audio streams.
 
 ### Key Tools:
 - **mlx-whisper** (Apple-native transcription & word-level alignment using MLX)
 - **simple-diarizer** (Spectral Clustering for Speaker Identification)
 - **FFmpeg / Torchaudio** (Audio Extraction)
 - **psutil** (Hardware Telemetry Monitoring)
 
 ### How it works:
 1. **Transcription:** mlx-whisper transcribes both `mic.webm` and `tab.webm` separately, generating exact millisecond timestamps for every spoken word.
 2. **Token-Free Diarization:** Instead of relying on gated models like Pyannote (which require HuggingFace API tokens and Accept-Terms agreements), the pipeline uses `simple-diarizer`. It runs a Spectral Clustering mathematical algorithm exclusively on `tab.webm` to separate the remote voices into "Speaker 1", "Speaker 2", etc.
 3. **Custom Stitcher:** The script merges the locally transcribed microphone array ("Me") with the diarized remote array ("Speaker X"), sorts all the words chronologically, and compiles them into a unified `transcript.json`.
 4. **Security & Backward Compatibility Patches:** The script contains compatibility monkeypatches for SpeechBrain/HuggingFace libraries to bypass legacy argument conflicts and ensure flawless loading on modern systems.
 5. **Black-Box Diagnostic Logger:** An integrated diagnostics module creates/appends to a `diagnostic.log` file inside the processed folder. It captures initial file metrics, execution timing metrics per phase (`time.perf_counter()`), and system-wide + process-specific hardware resources (CPU, RAM used/total) at baseline, peak, and post-cleanup.
 6. **Resilient Failure Boundaries:** Essential stages are surrounded by exceptions blocks. In case of non-fatal failures (such as silence causing `simple-diarizer` to crash), the error traceback is logged in `diagnostic.log` while ensuring any successfully processed segment array is written to `transcript.json` as a fallback.
 7. **Aggressive Memory Management:** To prevent memory pressure issues on Apple Silicon, the pipeline clears the GPU caches via `mlx.core.clear_cache()` and PyTorch's cache via `torch.mps.empty_cache()`, explicitly deleting intermediate objects and running garbage collection at each major phase boundary.
 
 ---

## 4. Automated CI/CD Release Pipeline (GitHub Actions)

Extension ZIP distribution is managed 100% on GitHub through automated CI/CD workflows. No `.zip` archives are stored in git repository history.

### Key Tools:
- **GitHub Actions** (`.github/workflows/release.yml`)
- `softprops/action-gh-release@v2`

### How it works:
1. **Trigger:** Whenever `packages/extension/manifest.json` is modified on the `main` branch (or a release tag `v*` is pushed), GitHub Actions executes automatically.
2. **Dynamic Packaging:** The workflow reads the version number dynamically from `manifest.json` via `jq`.
3. **Artifact Generation:** It packages `packages/extension/` into `cognito-call-v${VERSION}.zip` and `cognito-call-extension.zip`.
4. **GitHub Release Publication:** It calls `action-gh-release` to create or update the GitHub Release, attaching the zip assets directly to the GitHub Release page.
5. **Direct User Download:** `README.md` links directly to the latest hosted GitHub Release URL (`https://github.com/HelloPrincePal/cognito-call/releases/latest/download/cognito-call-extension.zip`).

---

## The Workflow summary:
`Chrome Extension (webm)` ➡️ `In-Browser Remuxing (Duration & Cues)` ➡️ `Downloads Folder` ➡️ `Tauri (Rust) triggers Python` ➡️ `mlx-whisper + Clustering (transcript.json & diagnostic.log)` ➡️ `React (Vertical UI + Exporters)`
