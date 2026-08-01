# Changelog

---

## [2026-08-01 21:30 IST] - v1.2.0

### 💡 Summary
Consolidated major milestone release for public deployment: **Streaming 15-Minute Whisper & Diarization Audio Windowing for 3-Hour (2 GB) Recordings**, **Sentence-Level Context-Aware AI Restructuring**, **Google Meet Live Captions Capture**, **Tauri 1440x900 Responsive Aspect Ratio & Native Branding**, **First-Time User Onboarding & Personalization**, **Non-Blocking PID Process Cancellation (`Escape` Key)**, **Sidecar Process Renaming (`cognito-assistant`)**, **CI/CD Workflow Serialization & Icon Tracking**, and **Granular Installer/Uninstaller Shell Tools**.

### 🚀 Detailed Enhancements & Fixes
- **Streaming 15-Minute Whisper Audio Windowing (`transcriber.py`):** Sliced Whisper audio transcription into 15-minute streaming windows for recordings longer than 30 minutes. Slashes memory overhead on 3-hour calls from ~4.5 GB down to ~350 MB ($O(1)$ RAM profile) with GPU Metal memory cache flushes (`mx.metal.clear_cache()`) after each window.
- **Windowed Diarization (`simple-diarizer`):** Sliced tab audio before spectral clustering, scaling matrix elements down from 207,360,000 floats to 2,560,000 floats (80x reduction in matrix complexity).
- **Sentence-Level Context-Aware AI Restructuring:** Restructured fragmented speech into complete, well-punctuated sentences and deduced true participant names from conversational context, reducing `transcript.json` size by over 100x (~50 KB).
- **Google Meet Live Captions Capture (`meet-captions.js`):** Added MutationObserver content script on `meet.google.com` to capture live captions and output `captions.json`, bypassing heavy Whisper tab processing when captions are enabled.
- **Tauri 1440x900 Responsive Aspect Ratio & Icons:** Updated `lib.rs` monitor scaling to maintain 1440:900 (16:10) aspect ratio across screen resolutions, and generated native `.icns` and multi-res PNG icons from `Logo_icon.svg`. Added all 52 generated icon files to Git tracking in `cognito-desktop/src-tauri/icons/` so headless CI runners compile without icon macro panics.
- **CI/CD GitHub Actions Workflow Serialization (`release.yml`):**
  - Chained `build-desktop-mac` to `build-and-release` (`needs: build-and-release`) so extension zip packaging and macOS app tarball building upload cleanly to the exact same release tag.
  - Fixed dependency installation path by executing `npm install` directly inside `cognito-desktop/`.
  - Removed unsupported legacy action inputs (`includeAppImage`, `includeDmg`).
- **One-Line Installer Fallback (`install.sh`):** Added automatic fallback logic in `install.sh` to compile locally via `./build-local.sh` if a pre-built GitHub release binary has not yet been published.
- **Granular Uninstaller (`uninstall.sh`):** Created cleanup tool with `--app-only`, `--models-only`, and `--all` nuclear options.
- **First-Time User Onboarding (`OnboardingModal.tsx`):** Added modal prompting users for their display name (e.g. *"Ram"*), attributing local microphone segments to the user's name and passing identity context to Gemma.
- **Non-Blocking PID Process Cancellation & Shutdown Hook:** Implemented non-blocking PID tracking for `Escape` key cancellation and added an `on_window_event` destroy listener in `lib.rs` to terminate background sidecars without UI deadlocks.
- **In-App Real-Time Progress Bar (0% - 100%) & Stage Indicator (`App.tsx`):** Replaced generic pulse loading box with an animated gradient progress bar and stage status messaging (`25% - Mic`, `50% - Tab`, `70% - Diarization`, `88% - Gemma Restructuring`, `100% - Complete`), complete with a shortcut hint (*"Press Esc to cancel"*).
- **Developer Diagnostic Commands & Background Monitoring (`ARCHITECTURE.md`):** Added terminal commands section documenting real-time telemetry streaming (`tail -f ~/Downloads/CognitoCall/*/diagnostic.log`), process status inspection (`ps aux | grep cognito-assistant`), dev server log streaming, and model cache inspection.
- **Process Naming:** Renamed sidecar executable alias to `cognito-assistant` so Activity Monitor / Task Manager clearly identifies the process.
- **README Metrics & Safari UX:** Replaced broken Repo Views badge with reliable `dwyl/hits` Shields.io endpoint (`img.shields.io/endpoint?url=https://hits.dwyl.com/...`) and added a note clarifying macOS Safari's automatic `.zip` file expansion upon download.

### 📄 Changed Files
- `cognito-desktop/python/transcriber.py`
- `cognito-desktop/src-tauri/src/lib.rs`
- `cognito-desktop/src-tauri/tauri.conf.json`
- `cognito-desktop/src-tauri/icons/*` (52 Icon Files Added to Git Tracking)
- `cognito-desktop/src/App.tsx`
- `cognito-desktop/src/components/OnboardingModal.tsx` (New)
- `cognito-desktop/src/components/Player.tsx`
- `packages/extension/content/meet-captions.js` (New)
- `packages/extension/background/service-worker.js`
- `packages/extension/manifest.json`
- `.github/workflows/release.yml`
- `install.sh` (New)
- `build-local.sh` (New)
- `uninstall.sh` (New)
- `README.md`
- `ARCHITECTURE.md`
- `file-structure.md`
- `TESTING.md`
- `VERSION_LOG.md`
- `CHANGELOG.md`

---

## [2026-08-01 18:55 IST]

### 💡 Summary
Added an in-browser **WebM EBML metadata repair module** (`webm-fixer.js`) to the Chrome extension's offscreen recorder. Every recorded stream (`video.webm`, `tab.opus`, `mic.opus`) is now automatically remuxed upon completion to inject missing **`Duration` headers** and a Matroska **`Cues` keyframe byte-offset index table**, enabling smooth seeking and accurate playback across all standard video players (VLC, QuickTime, Chrome, Windows Media Player). Bumped the extension to **v0.7.1**.

### 🚀 Why
- **Broken Seeking in `MediaRecorder` Output:** Chrome's native `MediaRecorder` streams video/audio as a live EBML sequence. When recording ends, Chrome fails to write back total duration or build the keyframe index (`Cues` element). Media players interpret these raw files as infinite/unknown live streams, preventing fast-forwarding or scrubbing to specific timestamps.
- **In-Browser Client-Side Remuxing:** Implemented a zero-dependency, pure JavaScript WebM/EBML parser and remuxer (`webm-fixer.js`) directly in the offscreen document. It indexes keyframes (`SimpleBlock`), calculates exact stream timecodes, encodes an EBML `Cues` cluster, updates the `Info` duration header, and updates the segment sizes prior to triggering downloads.
- **Zero Heavy Native Dependencies:** Solved seeking entirely in client-side Web APIs without requiring users to install FFmpeg or run native backend binary processes.
- **Fail-Safe Fallback:** If metadata remuxing encounters unexpected corrupt frames, the offscreen script catches the exception and falls back to downloading the raw blob so zero recorded data is lost.

- **Automated GitHub Release Packaging (CI/CD):** Created `.github/workflows/release.yml` to automatically build, package, and upload versioned extension zip files (`cognito-call-v${VERSION}.zip` and `cognito-call-extension.zip`) directly to GitHub Releases whenever `manifest.json` changes on `main` or a `v*` tag is pushed.
- **Zero Local Zip Policy:** Purged all local `.zip` binaries from the workspace (`dist/*.zip`, `*.zip`) to ensure release archives are maintained exclusively on GitHub Releases.
- **Direct GitHub Release Links in README:** Updated `README.md` to link directly to the automated GitHub Release ZIP download (`https://github.com/HelloPrincePal/cognito-call/releases/latest/download/cognito-call-extension.zip`).

### 📄 Changed Files
- `.github/workflows/release.yml` (New)
- `packages/extension/manifest.json`
- `packages/extension/offscreen/webm-fixer.js` (New)
- `packages/extension/offscreen/recorder.html`
- `packages/extension/offscreen/recorder.js`
- `README.md`
- `ARCHITECTURE.md`
- `file-structure.md`
- `VERSION_LOG.md`
- `CHANGELOG.md`

---

## [2026-08-01 13:32 IST]

### 💡 Summary
Added recording **safety limits** to the Chrome extension: a hard **3-hour cap** and automatic **stop-and-save when the recorded tab is closed**. Every auto-stop flushes and saves the partial recording, resets state exactly like a manual stop, and surfaces a persistent **"REC" toolbar badge** plus a **desktop notification** on auto-stop. Bumped the extension to **v0.7.0**.

### 🚀 Why
- **Runaway Recordings:** In real-world use, recordings were routinely left running long after meetings ended — one ran for ~24 hours — because it is easy to forget to press Stop, and even closing the meeting tab left the recorder going. These limits make an abandoned recording self-terminating.
- **3-Hour Hard Cap:** No single recording can exceed 3 hours. Enforced by a `chrome.alarms` timer in the service worker (survives MV3 service-worker termination) with a secondary `setTimeout` inside the always-alive offscreen document as an independent safety net.
- **Stop-on-Tab-Close:** Closing the recorded tab now stops and saves. Detected primarily via the tab-capture `MediaStreamTrack` `ended` event in the offscreen document (also catches Chrome's "Stop sharing" bar), with `chrome.tabs.onRemoved` as a service-worker backup. The close is matched against the stored recorded tab id, so closing any *other* tab (e.g. the mic-permission tab) is a no-op.
- **Never Lose a Recording:** All stop triggers (manual, 3h cap, tab close) funnel through a single **idempotent stop-and-save path**, guaranteeing that overlapping events — a tab close fires both the track `ended` and `onRemoved` — still produce exactly one saved session (`video.webm` / `tab.opus` / `mic.opus`) and one notification.
- **Recording Awareness:** A red **"REC"** badge now sits on the toolbar icon for the entire recording, and an auto-stop raises a desktop notification confirming the save ("reached the 3-hour limit" / "the recorded tab was closed"). The popup timer also resets live if it happens to be open.
- **Start Hardening:** The service-worker → offscreen start hand-off now retries (up to 3 attempts), and a new recording refuses to begin while a previous one is still saving, preventing overlapping sessions.
- **Permissions:** Added the non-prompting `alarms` and `notifications` permissions required by the above.

### 📄 Changed Files
- `packages/extension/manifest.json`
- `packages/extension/background/service-worker.js`
- `packages/extension/offscreen/recorder.js`
- `packages/extension/popup/index.js`
- `CHANGELOG.md`

> 🤖 Designed, implemented, and verified with **Claude Code** (Anthropic's agentic CLI) — including a mock-`chrome` harness that loads the real service worker to assert the single-stop / single-notification invariants across every stop path.

---

## [2026-08-01 13:30 IST]

### 💡 Summary
Updated the microphone permission request page copy (`mic.html`) and error status handlers (`mic.js`) in the Chrome extension to match modern Chrome permission prompt options (**"Allow while visiting the site"** vs **"Allow this time"**).

### 🚀 Why
- **Chrome UX Parity:** Modern Chrome changed its native permission prompt labels to **"Allow while visiting the site"** and **"Allow this time"**.
- **Clear Guidance on Origin Permissions:** In Chrome Extensions, selecting *"Allow while visiting the site"* grants persistent permission to the extension origin (`chrome-extension://<EXTENSION_ID>`). This unlocks background microphone capture for Cognito Call across all meeting sites (Google Meet, Zoom, Teams, Webex).
- **Prevent User Confusion:** Replaced obsolete references to "Allow" and "Only this time" in both the permission card warning banner and runtime status messages so users know exactly which button to click.

### 📄 Changed Files
- `packages/extension/permissions/mic.html`
- `packages/extension/permissions/mic.js`

---

## [2026-06-13 19:15 IST]

### 💡 Summary
Migrated the local AI transcription pipeline from PyTorch + WhisperX to Apple-native, memory-efficient MLX (`mlx-whisper`) and tuned `simple-diarizer` to reduce speaker hallucinations. Integrated Google's **Gemma 2 2b** (`mlx-community/gemma-2-2b-it-4bit` via `mlx-lm`) to automatically generate meeting notes summaries and action checklists. Overhauled the Rust backend and React frontend to parse and persist the interactive task lists and notes directly into `summary.json`.

### 🚀 Why
- **Performance & Efficiency:** Dropped processing time and massive RAM overhead (avoiding the 4.34 GB unified memory allocation), preventing potential memory pressure crashes.
- **Unified Native Stack:** Eliminated heavy PyTorch framework dependencies in favor of Apple-native MLX.
- **Local Intelligence Layer:** Added completely local, token-free meeting summaries and task extraction directly after transcription completes.
- **Interactive Checklist & Auto-Refresh:** Enabled real-time checklist toggling that persists to the workspace folder and configured the UI to automatically reload new summaries/tasks immediately on transcription completion.

### 📄 Changed Files
- `cognito-desktop/python/transcriber.py`
- `cognito-desktop/python/requirements.txt`
- `cognito-desktop/src-tauri/src/lib.rs`
- `cognito-desktop/src/components/Player.tsx`
- `.gitignore`
- `ARCHITECTURE.md`
- `VERSION_LOG.md`
- `CHANGELOG.md`
- `README.md`

---

## [2026-05-30 02:00 IST]

### 💡 Summary
Refactored the Cognito Hub UI into a clean, light-mode dashboard with a vertical player-on-top layout, introduced dual JSON/TXT transcript exporters, and integrated a robust diagnostic black-box logging system to track performance and error states in the Python transcriber.

### 🚀 Why
- **Polished UX**: Simplified the UI to feature a professional dashboard (greeting + grid of clean white session cards on a `#F9FAFB` workspace) and vertical stacking for media detail views.
- **Data Portability**: Enabled users to export transcripts as segment-level JSON (ideal for custom APIs/spreadsheets) or plain text (`.txt`) directly from the Transcript tab.
- **Telemetry & Hardening**: The Python sidecar now tracks system resource footprints (CPU/RAM) via `psutil` and writes execution logs alongside stack trace fallbacks to a localized `diagnostic.log` file.

### 📄 Changed Files
- `cognito-desktop/src/App.tsx`
- `cognito-desktop/src/components/Player.tsx`
- `cognito-desktop/python/transcriber.py`
- `cognito-desktop/python/requirements.txt`
- `pyrightconfig.json` (New)
- `VERSION_LOG.md`
- `CHANGELOG.md`
- `ARCHITECTURE.md`

---

## [2026-05-19 10:45 IST]

### 💡 Summary
Achieved **Phase 3: 100% Local AI Transcription & Diarization** by building an offline Python pipeline that accurately processes the Chrome extension's isolated audio streams.

### 🚀 Why
- **Zero Cloud, Zero Tokens:** Eliminated dependency on gated HuggingFace models (like Pyannote's diarization pipeline) by switching to the open `simple-diarizer` (Spectral Clustering algorithm).
- **Subprocess Orchestration:** The Tauri (Rust) backend securely triggers an isolated Python virtual environment (`venv`) to prevent global dependency conflicts.
- **Karaoke Sync:** `Player.tsx` in the frontend now parses the generated `transcript.json` to highlight exact words during video playback and allows click-to-jump navigation.
- **Format Support:** Added dual-extension support (`.webm` and `.opus`) to the transcription sidecar to handle Chrome's native MediaRecorder containers.

### 📄 Changed Files
- `cognito-desktop/python/transcriber.py`
- `cognito-desktop/python/requirements.txt`
- `cognito-desktop/src-tauri/src/lib.rs`
- `cognito-desktop/src/components/Player.tsx`
- `cognito-desktop/src/App.tsx`
- `ARCHITECTURE.md` (New)

---

## [2026-05-18 19:30 IST]

### 💡 Summary
Initialized **Phase 2: Cognito Video Gallery**, a custom Tauri desktop application to browse and play local video recordings.

### 🚀 Why
- **Local Gallery:** A dedicated desktop interface to manage the sessions packaged by the Chrome extension.
- **Tauri Integration:** Set up a lightweight Rust/Tauri backend with a React+Vite frontend in the `cognito-desktop/` directory.

### 📄 Changed Files
- `cognito-desktop/` (New directory)
- `README.md`
- `VERSION_LOG.md`
- `CHANGELOG.md`

---

## [2026-05-09 01:25 IST]

### 💡 Summary
Upgraded extension to a "Session Packager" architecture with triple-file export and unmuted local tab playback.

### 🚀 Why
- **Workspace Generation:** Instead of a single file, the extension now bundles sessions into dedicated folders (`YYYY-MM-DD_HH-MM-SS/`).
- **Triple-File Audio Isolation:** To maximize AI transcription capabilities, we now extract and simultaneously save isolated audio files (`tab.opus` and `mic.opus`) alongside the main mixed `video.webm` file. 
- **Exact Alignment:** All three Recorders are instantiated and `start()` triggered within a single synchronous block, guaranteeing perfect timeline alignment to avoid drift.
- **Muted Tab Fix:** When capturing tab audio, Chrome inherently mutes local playback. Fixed by routing the `tabAudioStream` directly to the system speakers using an offscreen `<audio>` object so users can hear the meeting normally. Added `AUDIO_PLAYBACK` offscreen permission.

### 📄 Changed Files
- `packages/extension/offscreen/recorder.js`
- `packages/extension/background/service-worker.js`
- `packages/extension/manifest.json`

---

## [2026-03-23 01:15 IST]

### 💡 Summary
Achieved **1:1 Design Parity** for both Permissions and Popup surfaces with a total overhaul of the layout architecture.

### 🚀 Why
- **Meticulous Symmetry:** Switched to a **Flat Sibling Architecture** inside flex containers to eliminate margin-stacking bugs. Spacing is now controlled exclusively via the `gap: 24px` rule (LSQU5) for perfect vertical symmetry.
- **Node-Exact Values:** 
  - Adjusted the **Recording Pulse** dot to exactly 20px (eUJ9c).
  - Fixed the **Stop icon size** to exactly 14px (SXtc2).
  - Standardized the **Badge/Cloud color** to exact hex `#7c3aed`.
- **Systematic Documentation:** Overhauled `design/design.md` into a "Boss File" using the Google Stitch `design-md` format, mapping every UI token and component to its specific Pencil Node ID.
- **UX Polish:** 
  - Updated the permission alert text for better clarity on "Only this time" persistence.
  - Reduced CTA-to-Banner spacing to 24px for tighter visual grouping.

### 📄 Changed Files
- `packages/extension/permissions/mic.html`
- `packages/extension/popup/index.html`
- `design/design.md`

---

## [2026-03-23 00:20 IST]

### 💡 Summary
Fixed Extension Popup UI to exactly match the **Pencil** design system (`extension-ui.pen`).

### 🚀 Why
- **Pixel-Perfect Accuracy:** Fixed discrepancies in spacing, font weights, and icon sizes to match the high-fidelity `C0eoM` design exactly.
- **Reliable Iconography:** Switched from external Lucide CDN to **Inline SVGs** for all UI icons (Mic, Circle, Square, Lock, Cloud-Off) to ensure 100% reliability in the extension popup environment.
- **Branding:** Integrated the official **Cognito Call PNG logo** for professional branding.
- **Enhanced States:** 
  - Standardized the **Recording Pulse** animation with dual-ring scaling.
  - Adjusted the layout hierarchy by moving trust badges into the main content flow with correct 20px spacing.
  - Added a 16px corner radius to the popup body.

### 📄 Changed Files
- `packages/extension/popup/index.html`

---

## [2026-03-19 22:45 IST]

### 💡 Summary
Implemented Professional UI Redesign and switched to **Lucide Icons** across the entire extension.

### 🚀 Why
- **Unified Iconography:** Replaced all emojis and Remix Icons with **Lucide Icons** to solve the dual-library dependency and ensure 1:1 consistency between the Pencil design tool and the production code.
- **High-Fidelity Implementation:**
  - **Permissions Page (`mic.html`)**: Implemented the centered white card design with Cognito Call branding, checklist points, and warning banners. Added auto-initialization for Lucide icons.
  - **Extension Popup (`index.html`)**: Implemented the 360px professional layout with dedicated "Idle" and "Recording" states, including a pulse animation and timer.
- **UX Improvements:**
  - Added "100% Local" and "No Cloud" trust badges to the popup footer.
  - Improved error and success message styling to match the new professional theme.
  - Standardized on **Inter** typography across all extension surfaces.

### 📄 Changed Files
- `packages/extension/permissions/mic.html`
- `packages/extension/permissions/mic.js`
- `packages/extension/popup/index.html`
- `packages/extension/popup/index.js`
- `docs/PHASE1-EXTENSION.md`
- `README.md`

**Status:** ✅ Implemented

---

## [2026-03-16 23:25 IST]

### 💡 Summary
Redesigned Extension UI — Professionalized look using **Remix Icon** library.

### 🚀 Why
- The previous UI was a functional prototype. We established a **Professional Design System** in `design/extension-ui.pen` that aligns with the Cognito Call brand.
- **Key Design Upgrades:**
  - Integrated the official logo and brand colors (#335CFF).
  - Switched UI icons to **Remix Icon** library (`ri-` classes) for a consistent, professional look.
  - Added **Trust Badges** ("100% Local", "No Cloud") to reinforce the privacy-first value proposition.

  - Designed a dedicated **Recording State** with a red "● REC" badge, pulse indicators, and a high-contrast timer.
  - Standardized on **Inter** typography and 360px responsive layout.
- **Verification:** Generated screenshots for all states to ensure visual consistency before code implementation.

### 📄 Changed Files
- `design/extension-ui.pen`
- `file-structure.md`
- `packages/extension/manifest.json`

**Status:** ✅ Designed & Store Ready

---

## [2026-03-16 22:14 IST]


### 💡 Summary
Removed unnecessary `<all_urls>` host permission — Chrome Web Store readiness.

### 🚀 Why
- The `host_permissions: ["<all_urls>"]` field granted the extension access to interact with all websites, but **no code in the extension uses it** — there are no content scripts, no `executeScript()` calls, no cross-origin `fetch()`, and no `webRequest` interception.
- Removing it has **zero impact** on functionality since all APIs used (`tabCapture`, `offscreen`, `downloads`, `storage`, `tabs`) are covered by the `permissions` array.
- **Chrome Web Store benefit:** Avoids near-certain rejection for requesting overly broad permissions. Also reduces the scary "Read and change all your data on all websites" install warning for users.

### 📄 Changed Files
- `packages/extension/manifest.json`

**Status:** ✅ Done

---

## [2026-03-15 16:20 IST]

### 💡 Summary
Fixed: "Only this time" mic permission didn't persist — added real permission verification.

### 🚀 Why
- Choosing "Only this time" in Chrome's mic dialog set the stored flag `micPermissionGranted: true`, but the actual permission didn't persist to the offscreen document, so mic still failed silently.
- **Fix:** Now uses `navigator.permissions.query({ name: 'microphone' })` to verify the **actual Chrome permission state** instead of trusting a stored flag. If the real state isn't `'granted'`, the flag is cleared and the permissions page reopens.
- The permissions page now detects "Only this time" grants and warns the user they must choose **"Allow"** for it to work.
- Added a visible ⚠️ warning on the permissions page explaining the distinction.

### 📄 Changed Files
- `packages/extension/permissions/mic.js`
- `packages/extension/permissions/mic.html`
- `packages/extension/popup/index.js`

**Status:** ✅ Fixed

---

## [2026-03-15 16:08 IST]

### 💡 Summary
Fixed microphone permission — added dedicated permissions page in a full browser tab.

### 🚀 Why
- Both the **popup** and **offscreen document** run in contexts where Chrome auto-dismisses `getUserMedia` permission prompts (`Permission dismissed` error).
- **Fix:** Created `permissions/mic.html` that opens in a **full browser tab** where Chrome CAN show the microphone permission dialog.
- On first "Start Recording" click, if mic hasn't been granted yet, the popup opens the permissions page. User clicks "Grant Access", Chrome shows the prompt, user allows it, and the permission persists for the extension's origin.
- Subsequent recordings reuse the granted permission silently.

### 📄 Changed Files
- `packages/extension/permissions/mic.html` (New)
- `packages/extension/permissions/mic.js` (New)
- `packages/extension/popup/index.js`
- `packages/extension/file-structure.md`

**Status:** ✅ Fixed

---

## [2026-03-15 16:05 IST]

### 💡 Summary
Fixed microphone not recording — offscreen document can't show permission prompts.

### 🚀 Why
- The offscreen document runs in a **hidden context** with no UI. When it called `getUserMedia({ audio: true })`, Chrome auto-dismissed the mic permission request (`Permission dismissed` error).
- **Fix:** The popup now requests mic access **first** (it has a visible UI → Chrome shows the permission dialog). Once the user grants it, the permission persists on the extension's origin, so the offscreen document can access the mic silently.
- The popup also passes `micGranted` flag to the service worker and shows `"Recording (tab + mic)"` or `"Recording (tab only, no mic)"` accordingly.

### 📄 Changed Files
- `packages/extension/popup/index.js`

**Status:** ✅ Fixed

---

## [2026-03-15 15:39 IST]

### 💡 Summary
Added microphone capture, human-readable filenames, and file size optimization.

### 🚀 Why
- **Mic Audio Capture**: Tab capture only records system/tab audio. Mixed in the user's microphone via Web Audio API so both sides of the call are recorded (with echo cancellation & noise suppression).
- **Human-Readable Naming**: Changed files from epoch timestamps (e.g., `17735...`) to readable strings like `CognitoCall_2026-03-15_15-30-25.webm`.
- **File Size Optimization**: Switched to **VP9 codec** with targeted bitrates (1 Mbps video / 128 Kbps audio). Reduced file size by ~50% (now ~8-10MB/min).

### 📄 Changed Files
- `packages/extension/offscreen/recorder.js`
- `packages/extension/background/service-worker.js`

**Status:** ✅ Ready

---

## [2026-03-15 15:15 IST]

### 💡 Summary
Major architecture overhaul — service worker established as the central message hub.

### 🚀 Why
- **MV3 Compliance**: Moved `tabCapture` to the service worker (required in Manifest V3).
- **Download Fix**: Relayed downloads to the service worker because offscreen documents lack `chrome.downloads` access.
- **Message Routing**: Implemented a target-based routing system (`service-worker-from-popup`, `offscreen-doc`, etc.) to prevent cross-talk.
- **State Reliability**: Service worker now manages `chrome.storage.local` updates so recording state persists even if the popup is closed.
- **Race Condition**: Added 300ms init delay for offscreen documents to ensure message listeners are ready.

### 📄 Changed Files
- `packages/extension/background/service-worker.js` (Rewrite)
- `packages/extension/offscreen/recorder.js` (Rewrite)
- `packages/extension/popup/index.js` (Rewrite)
- `packages/extension/manifest.json` (Added `tabs` permission)

**Status:** ✅ Fixed

---

## [2026-03-15 14:48 IST]

### 💡 Summary
Fixed silent communication failure with Offscreen document.

### 🚀 Why
- Resolved race condition where messages were sent before the offscreen document fully initialized. Properly awaiting `hasDocument` and `createDocument`.

### 📄 Changed Files
- `packages/extension/popup/index.js`

**Status:** ✅ Fixed

---

## [2026-03-15 12:25 IST]

### 💡 Summary
Fixed manifest schema errors and tabCapture stream collisions.

### 🚀 Why
- Removed invalid `offscreen: true` property from `manifest.json`.
- Added error handling for `getMediaStreamId` to prevent crashes when a stream is already active.

### 📄 Changed Files
- `packages/extension/manifest.json`
- `packages/extension/popup/index.js`

**Status:** ✅ Fixed

---

## [2026-03-15 12:19 IST]

### 💡 Summary
Persistence for recording state via `chrome.storage.local`.

### 🚀 Why
- Saved `recordingId` and `startTime` to storage so the timer resumes correctly when the popup is reopened.

### 📄 Changed Files
- `packages/extension/popup/index.js`

**Status:** ✅ Fixed

---

## [2026-03-15 12:09 IST]

### 💡 Summary
Updated extension icons with actual branding.

### 🚀 Why
- Replaced placeholders with the official Cognito Call logo.

### 📄 Changed Files
- `packages/extension/icons/icon16.png`
- `packages/extension/icons/icon48.png`
- `packages/extension/icons/icon128.png`

**Status:** ✅ Ready

---

## [2026-03-15 11:58 IST]

### 💡 Summary
Fixed extension recording by correcting offscreen API usage.

### 🚀 Why
- Refactored flow to pass Stream ID from popup to recorder, ensuring correct media capture in MV3.

### 📄 Changed Files
- `packages/extension/popup/index.js`
- `packages/extension/offscreen/recorder.js`
- `packages/extension/background/service-worker.js`

**Status:** ✅ Ready
