# 🏷️ Version Log

This file tracks major project milestones and consolidated updates for each Git push.

## 📏 Naming Convention (SemVer)
We follow the **X.Y.Z** semantic versioning format:

- **X (Major/Phase):** Represents the project phase.
  - `0`: Development & Alpha testing (Current).
  - `1`: Public Release / Production ready.
- **Y (Minor/Architecture):** Major updates to core structure, architecture, or significant new features.
- **Z (Patch/Bugfix):** Small fixes, UI tweaks, or minor logic improvements.

---

| Version | Date | Summary | Key Impact |
| :--- | :--- | :--- | :--- |
| **v1.2.0** | 2026-08-01 | **Public Release, 3-Hour Long Call Optimization, Sentence AI Restructuring, & Desktop Control** | Streaming Whisper 15-min windowing (constant ~350MB RAM), Gemma sentence-level restructuring, Google Meet live captions fast-path, 1440x900 Tauri window, native icons, onboarding modal, Escape key process cancellation, cognito-assistant process name, and installer/uninstaller scripts |
| **v0.7.1** | 2026-08-01 | **WebM Duration & Cues Seeking Repair** | Pure JS EBML metadata remuxer in offscreen recorder to fix video/audio playability and enable seeking across all media players |
| **v0.7.0** | 2026-08-01 | **Recording Safety Limits & Mic Copy Update** | 3-hour cap, tab-close auto-stop, toolbar REC badge, desktop notifications, and Chrome UX copy updates |
| **v0.6.0** | 2026-06-13 | **Apple-Native MLX Migration** | Memory-efficient mlx-whisper backend + aggressive memory releases |
| **v0.5.1** | 2026-05-30 | **Diagnostic Logging & Light Mode Refactor** | Stable Python logger (psutil) + premium light mode dashboard & segment exporters |
| **v0.5.0** | 2026-05-19 | **Local AI Transcription Pipeline** | 100% offline WhisperX + Clustering pipeline |
| **v0.4.0** | 2026-05-18 | **Cognito Video Gallery (Tauri)** | Initialized Phase 2 desktop app |
| **v0.3.0** | 2026-05-09 | **Session Packager Architecture** | Triple file export & exact alignment |
| **v0.2.4** | 2026-03-23 | **Meticulous Design Parity** | 1:1 parity & Boss Design System |
| **v0.2.3** | 2026-03-23 | **Icon Reliability & Layout Fixes** | Pixel-perfect popup & CSP-safe icons |
| **v0.2.2** | 2026-03-19 | **Professional UI Implementation** | High-fidelity UI & Lucide Transition |
| **v0.2.1** | 2026-03-16 | **UI Redesign & Store Readiness** | Professional UI & Permission cleanup |
| **v0.2.0** | 2026-03-15 | **Architecture & Audio Overhaul** | Complete re-architecture & Mic mixing |

| **v0.1.0** | 2026-03-15 | **Initial Prototype** | Basic tab recording proof-of-concept |

---

## [v1.2.0] — 2026-08-01
**Git Push Action:** "feat: public release, 3-hour streaming audio windowing, sentence AI restructuring, Google Meet live captions, onboarding modal, and installer scripts"

### 🚀 Implementation
- **Streaming Whisper & Diarization Windowing (3-Hour / 2 GB Call Support):** Sliced Whisper audio transcription and simple-diarizer spectral clustering into 15-minute streaming windows. Reduced peak RAM usage on 3-hour calls from ~4.5 GB to ~350 MB ($O(1)$ constant memory overhead) with 80x matrix complexity reduction.
- **Context-Aware Sentence Restructuring:** Replaced word-level alignment arrays with Gemma-powered sentence restructuring and contextual speaker attribution (direct address, self-identification), reducing `transcript.json` file size by over 100x.
- **Google Meet Live Captions Fast-Path:** Added `meet-captions.js` content script using `MutationObserver` to capture participant names and text, bypassing heavy Whisper tab processing when captions are enabled.
- **Tauri 1440x900 Responsive Sizing & Branding:** Updated window sizing to strictly enforce 1440:900 aspect ratio and generated native macOS `.icns` and multi-res PNG application icons from `Logo_icon.svg`.
- **First-Time User Onboarding:** Added `OnboardingModal.tsx` prompting users for their display name (e.g. *"Ram"*), attributing microphone segments to the user and passing identity context to Gemma.
- **Non-Blocking PID Process Cancellation & Shutdown Cleanup:** Added global `Escape` key handler and Tauri `on_window_event` window destroy listener using non-blocking PID tracking to immediately terminate background Python sidecars without UI freeze.
- **Process Naming:** Renamed sidecar executable alias to `cognito-assistant` so Activity Monitor / Task Manager clearly identifies the process.
- **Shell Installers & Documentation:** Created `install.sh`, `build-local.sh`, and `uninstall.sh` (--app-only, --models-only, --all) and updated `README.md`.

---

## [v0.7.1] — 2026-08-01
**Git Push Action:** "feat: fix WebM seeking and playability by injecting Cues index and Duration metadata"

### 🚀 Implementation
- **Pure JS WebM/EBML Remuxer:** Created `webm-fixer.js` to parse raw MediaRecorder WebM streams, calculate frame timecodes, and build a Matroska `Cues` index table.
- **Duration Metadata Header Injection:** Calculated exact recording duration and injected updated `Duration` float into the `Info` segment payload.
- **Seekable Output across Media Players:** Fixed video/audio scrubbing in VLC, QuickTime, Chrome, and Windows Media Player for `video.webm`, `tab.opus`, and `mic.opus`.
- **Fail-Safe Fallback:** Wrapped remuxing in try-catch logic to preserve raw recordings in case of corrupt frames.

---

## [v0.7.0] — 2026-08-01
**Git Push Action:** "feat: extension recording safety limits, tab-close auto-stop, toolbar REC badge, and permission copy parity"

### 🚀 Implementation
- **3-Hour Hard Cap:** Enforced max recording duration via `chrome.alarms` in service worker + fallback `setTimeout` in offscreen recorder.
- **Stop-on-Tab-Close:** Automatically flushes and saves recordings when the recorded tab is closed (via track `ended` + `tabs.onRemoved`).
- **Canonical Idempotent Stop Path:** All stop triggers funnel through a single stop-and-save execution path with single-fire notification guards.
- **Visual & Desktop Feedback:** Added a active red "REC" toolbar badge during recording and desktop notifications on auto-stops.
- **Permission UX Parity:** Updated `mic.html` and `mic.js` to match Chrome's "Allow while visiting the site" permission wording.

---

## [v0.6.0] — 2026-06-13
**Git Push Action:** "feat: migrate local AI pipeline to Apple-native MLX, implement aggressive cache releasing, and integrate Gemma 2 2b summarization"

### 🚀 Implementation
- **mlx-whisper Migration:** Replaced the heavy PyTorch-based WhisperX with Apple-native `mlx-whisper` using a 4-bit quantized base model (`mlx-community/whisper-base-mlx-q4`) for fast CPU/GPU utilization on macOS.
- **Local Gemma 2 2b Summarization:** Integrated `mlx-lm` using the 4-bit quantized `mlx-community/gemma-2-2b-it-4bit` model to automatically summarize meetings and extract key tasks/action items into `summary.json` immediately after transcription.
- **Aggressive Memory Releases:** Resolved the unified memory leak by introducing cache flushes (`mlx.core.clear_cache()` and `torch.mps.empty_cache()`), garbage collection (`gc.collect()`), and diarizer/LLM object deletions inside guarantee-executing `finally` blocks at each logical phase boundary.
- **Rust Backend Data Hydration:** Updated Tauri Rust commands (`get_session_details`, `save_session_notes`, `save_session_action_items`) to read and write directly to `summary.json` to persist checkbox status and note modifications while maintaining backward compatibility with older text files.
- **React UI Auto-Refresh:** Configured the frontend (`Player.tsx`) to trigger a data refresh when transcription/summarization completes, instantly loading notes and checkboxes without requiring a session switch.
- **Tuned Diarizer Thresholds:** Switched clustering to dynamically detect the speaker count (`num_speakers=None`) and raised clustering thresholds to `0.20` to eliminate false voice identification on silent or static audio segments.
- **Cleaned Empty Segments:** Filtered out empty text blocks during transcript merging to ensure the final JSON matches high quality standards.

---

## [v0.5.1] — 2026-05-30
**Git Push Action:** "feat: add black-box diagnostic logging, light mode dashboard UI, and transcript exports"

### 🚀 Implementation
- **Diagnostic Logging System:** Configured `transcriber.py` to write/append to a structured `diagnostic.log` file in the active workspace directory, recording file size metrics, step-by-step execution times (`time.perf_counter()`), and CPU/RAM hardware footprints (`psutil`).
- **Resilient Fallback Parsing:** Wrapped critical pipeline boundaries in try-except constructs. If a diarizer asserts or fails (such as on silent or single-speaker audio), the traceback is logged to `diagnostic.log` while successfully committing the partial segments array to a valid `transcript.json` output.
- **Light Mode UI & Sidebar:** Refactored the Tauri desktop client layout (`App.tsx`) to match a clean light-mode dashboard style, replacing statistics headers and search boxes with a welcoming greeting, responsive grid layout, and simplified navigation.
- **Vertical Stack Detail View:** Positioned the video element at the top of the workspace detail panel while shifting the navigation tabs (`Transcript`, `Notes`, `Action Items`) to the bottom of the dashboard.
- **Dual Exporters:** Implemented frontend segment-level JSON export and formatted plain text (.txt) script export with standard dialog downloads.

---

## [v0.5.0] — 2026-05-19
**Git Push Action:** "feat: integrate 100% local AI transcription and diarization pipeline"

### 🚀 Implementation
- **Local AI Pipeline:** Built a robust Python sidecar orchestrating WhisperX for word-level transcription and `simple-diarizer` (Spectral Clustering) for token-free speaker identification.
- **Tauri Orchestration:** Configured the Rust backend to dynamically resolve absolute paths to the isolated Python `venv` and stream subprocess `stderr` back to the UI.
- **Custom Stitching Logic:** Designed an algorithm that merges the isolated `mic.webm` and `tab.webm` streams, synchronizing exact timestamped words to their respective diarized speakers.
- **Karaoke Player UI:** Upgraded `Player.tsx` in the React frontend to natively parse the resulting `transcript.json` and sync the highlighted words with the HTML5 video playback.
- **Dependency Hardening:** Integrated a monkeypatch to bypass PyTorch 2.6+ `weights_only` security serialization errors when loading legacy pyannote models.

---

## [v0.4.0] — 2026-05-18
**Git Push Action:** "feat: initialize cognito video gallery tauri application"

### 🚀 Implementation
- **Tauri App:** Initialized the `cognito-desktop` directory with a Vite + React + Tauri setup.
- **Phase 2 Kickoff:** Began development on the local-first dashboard to browse, play, and manage offline `.webm` files recorded by the extension.
- **Documentation:** Updated the README to include development start commands for the new desktop app.

---

## [v0.3.0] — 2026-05-09
**Git Push Action:** "feat: session packager architecture and isolated audio streams"

### 🚀 Implementation
- **Session Workspace:** Replaced single file saving with a session-based directory generator (`CognitoCall/YYYY-MM-DD_HH-MM-SS/`).
- **Triple File Export:** Upgraded `recorder.js` to create up to three distinct `MediaRecorder` instances running synchronously (`video.webm`, `tab.opus`, `mic.opus`).
- **Exact Alignment:** Implemented synchronous `.start()` initialization logic across all active recorders to prevent timeline drift for AI transcription.
- **Local Audio Routing:** Routed the tab's audio stream back to the system speakers via an invisible `Audio` element in the offscreen document, allowing the user to hear the tab while recording.

---

## [v0.2.4] — 2026-03-23
**Git Push Action:** "style: meticulous design parity with flat sibling layout architecture"

### 🚀 Implementation
- **Layout Overhaul:** Implemented a pure **Flat Sibling layout** for both the permissions card and extension popup. Spacing is maintained purely via root-level `gap` properties (24px for Card, 20px for Popup), eliminating dual-margin bugs and enforcing pixel-perfect vertical symmetry.
- **Node Parity:** Finalized exact values for the Recording Pulse (20px dot), Stop Icon (14px), and Badge Colors (#7c3aed), achieving 1:1 parity with Pencil node data (eUJ9c, SXtc2).
- **Design System Asset:** Completely overhauled `design/design.md` into the project's **Boss Design File**, featuring tabular tokens, component tree diagrams, and direct Pencil-to-Code node mappings.

---

## [v0.2.3] — 2026-03-23
**Git Push Action:** "style: pixel-perfect popup UI and CSP-safe inline icons"

### 🚀 Implementation
- **CSP Compliance:** Switched to **Inline SVGs** for all popup icons, solving CSP blocking issues common in Chrome extensions.
- **Pixel-Perfect Alignment:** Corrected badge spacing (20px gap from button), component grouping, and header-body hierarchy to match the Pencil design system.
- **Branding:** Integrated the PNG logo assets and added a 16px corner radius for a native app feel.

---

## [v0.2.2] — 2026-03-19
**Git Push Action:** "feat: professional UI redesign with Lucide icons"

### 🚀 Implementation
- **Full UI Implementation:** Translated high-fidelity Pencil designs into production code for `mic.html` and the extension popup.
- **Lucide Transition:** Switched all UI assets to **Lucide Icons** from emojis and Remix Icons for a consistent and professional visual experience.
- **Polished States:** Added pulse animations for recording and a clear distinction between 'Idle' and 'In Progress' views.

---

## [v0.2.1] — 2026-03-16
**Git Push Action:** "style: professional extension UI redesign and permission cleanup"

### 🚀 Design & UX
- **Design System Established:** Created high-fidelity mockups for Idle and Recording states in `design/extension-ui.pen`.
- **Branding Alignment:** Unified the extension visual identity with the main app (Typography, Colors, Logo).
- **Trust Signaling:** Added security badges ("100% Local") to the UI to communicate privacy features.

### 🔧 Stability & Compliance
- **Permission Cleanup:** Removed `<all_urls>` from `manifest.json` to comply with Chrome Web Store minimized permission policy.
- **Documentation:** Updated `file-structure.md` to track design assets.

---

## [v0.2.0] — 2026-03-15

**Git Push Action:** "feat: architecture overhaul and microphone audio mixing"

### 🚀 Major Features
- **Dual Audio Mixing:** Added Web Audio API implementation to mix Tab audio and Microphone audio.
- **Microphone Permissions Flow:** Established a dedicated high-integrity permissions page (`permissions/mic.html`) to handle persistent mic grants in Chrome.
- **VP9 Optimization:** Implemented VP9 codec with 1Mbps bitrate caps, reducing output file size by ~50% (approx. 8-10MB/min).

### 🏗️ Architecture Improvements
- **Service Worker Hub:** Centralized all extension logic (tabCapture, storage, and downloads) into the Service Worker for Manifest V3 compliance.
- **Targeted Messaging:** Implemented a unique message routing system to prevent communication conflicts between popup, offscreen, and worker.
- **Persistence:** Shifted state management to `chrome.storage.local` to ensure recording continuity if the popup is closed.

### 🔧 Fixes
- Fixed "Permission dismissed" errors when requesting mic in hidden contexts.
- Fixed `chrome.downloads` accessibility bugs in the offscreen document.
- Fixed human-readable timestamps for generated files.

---

## [v0.1.0] — 2026-03-15
**Git Push Action:** "initial commit: basic tab recording"

### 🚀 Initial Release
- Basic tab capture using `chrome.tabCapture`.
- Offscreen document integration for MediaRecorder API.
- Basic popup UI with Start/Stop buttons and timer.
