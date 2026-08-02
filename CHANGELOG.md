# Changelog

---

## [2026-08-02 13:39 IST]

> **No version bump.** Feature + quality hardening; app version intentionally unchanged (see *Versioning Policy* in `VERSION_LOG.md`).

### 💡 Summary
Added a **selectable model quality tier** so users can trade speed for accuracy based on their Mac's RAM, and fixed the pipeline bugs that were garbling AI notes. A one-line-installer flag now picks between a **Lite** tier (fast, MacBook-Air-friendly) and a **Pro** tier (larger, much higher-quality models). Diagnosed from a real 2h55m run whose transcript was fragmented and whose `summary.json` contained a raw, broken JSON blob.

### 🚀 Detailed Enhancements & Fixes
- **Selectable model tiers (`install.sh`, `build-local.sh`, `transcriber.py`):** The installers now accept `--pro` (a.k.a. `--quality`) and write `~/.cognitocall/models.json`; the sidecar reads it at startup via a new `_load_model_config()` and loads those models (falling back to the Lite defaults if the file is absent). Switchable anytime by re-running the installer.
  - **Lite** (default): `whisper-base-mlx-q4` + `gemma-2-2b-it-4bit` — fast, runs on 8–16 GB.
  - **Pro** (`--pro`): `whisper-large-v3-turbo` + `Qwen2.5-14B-Instruct-4bit` — the best models that run comfortably on a 24 GB Mac; far more accurate transcripts and reliable JSON notes. Needs more RAM and a ~10 GB first-run download.
  - The chosen tier is logged per run (`Model tier -> Whisper: … | LLM: …`).
- **Per-tier storage management (`install.sh`, `build-local.sh`):** Models still download lazily into `~/.cache/huggingface/hub` (Lite ≈ 1.5 GB, Pro ≈ 10 GB), but the installer now **removes the other tier's cached weights** on install — so switching to Pro offloads the Lite models and vice-versa, and the machine never holds both sets at once. `uninstall.sh --models-only` clears everything.
- **Fixed garbled summaries (`transcriber.py`):** When the LLM's final JSON was unrepairable, the fallback dumped the entire raw (often broken) blob into `executive_summary`. It now regex-extracts the human-readable `executive_summary` text from the raw output, so `summary.json` shows a clean summary instead of a JSON dump. (Verified on the exact broken output from the 2h55m run.)
- **Killed the schema-placeholder echo (`transcriber.py`):** A weak LLM sometimes copied the map prompt's JSON example verbatim, so `"Cleaned complete sentence."` was appearing as real transcript segments. The refinement step now drops any segment matching the known placeholder text, and the example wording was changed.
- **`README.md` — complete rewrite:** Restructured the whole README around a new user's first visit: a short intro (what it is / why), then **The Problem** and **The Solution**, then install guides (**extension**, then **app** with both tiers), then **How the Extension Works** and **How the App Works** (linked to from the install steps), and finally a single **Configuration & Management** section consolidating every `curl`/`bash` command (tier switching, updating, uninstalling) plus a storage-locations table. Replaced the previous scattered layout; added an in-page table of contents and anchor links.

### 🔎 Root-cause notes (for reference)
- The audio was **not** the problem — both `mic` (−24 dB) and `tab` (−22.8 dB) measured as normal speech. The quality ceiling was the deliberately-tiny Lite models: `whisper-base` fragments real speech, and `gemma-2-2b` can't reliably emit the nested JSON the map/reduce prompts ask for (only 10 of 705 segments got AI-refined; 2 of 6 chunks failed JSON parse). The Pro tier addresses both.

### 📄 Changed Files
- `cognito-desktop/python/transcriber.py`
- `install.sh`
- `build-local.sh`
- `README.md`
- `CHANGELOG.md`

---

## [2026-08-02 10:23 IST]

> **No version bump.** Runtime bug fix / reliability hardening; app version intentionally unchanged (see *Versioning Policy* in `VERSION_LOG.md`).

### 💡 Summary
Fixed an **infinite transcription retry loop**: on a machine where `ffmpeg` lived only in `~/.local/bin`, the desktop app could not find it (a GUI app doesn't inherit the shell `PATH`, and that directory wasn't on the sidecar's search path), so **every** run failed to decode audio, produced no transcript, yet exited "successfully" — causing the auto-runner to re-launch the same session every ~8 seconds forever. Fixed the root cause (ffmpeg discovery) and added two independent guards so a silent failure can never loop again.

### 🚀 Detailed Enhancements & Fixes
- **Root cause — ffmpeg not found by the GUI sidecar:** `~/.local/bin` (where a user/static ffmpeg commonly lives) was absent from the sidecar's `PATH`, and `~/.cognitocall/bin` was empty. The symptom was `FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'` on every `mlx_whisper.audio.load_audio` call, cascading into failed transcription **and** diarization (`Couldn't find converted wav file`).
- **Fix A — ffmpeg discovery (`transcriber.py`, `install.sh`, `build-local.sh`):**
  - `transcriber.py` now adds `~/.local/bin` to the injected `PATH` (alongside `~/.cognitocall/bin` and the Homebrew/system dirs).
  - Both installers now **always stage a copy of ffmpeg into `~/.cognitocall/bin`** (the app-controlled dir that's always on the sidecar's `PATH`) even when ffmpeg is already found on the shell `PATH` at install time — because "found in the Terminal during install" ≠ "found by the GUI app at runtime."
- **Fix B — fail loudly instead of silently (`transcriber.py`):** Added a startup **preflight** (`shutil.which("ffmpeg")` → `sys.exit(1)` with a clear message if missing) and a **zero-segments guard** (if transcription produced nothing, `sys.exit(1)`). A non-zero exit makes the existing Rust handler write `failed.txt`, which stops the auto-runner from re-launching — turning a silent forever-loop into a single clear error.
- **Fix C — loop guard in the desktop app (`lib.rs`):** The post-run handler now treats a "successful" exit that produced **no** `transcript.json` and **no** `summary.json` as a failure (writes `failed.txt`), so any future silent no-output run also can't loop. *(Requires an app rebuild to take effect; Fixes A + B work with the current binary once `transcriber.py` is updated.)*

### ✅ Verification
Diagnosed from the session log (8 identical failed runs in ~50 s, 32 ffmpeg errors). After the fix, running `transcriber.py` under a stripped `PATH=/usr/bin:/bin` (simulating the GUI environment) now logs `ffmpeg located at: …/.local/bin/ffmpeg` via the injected path, and an empty session exits non-zero with `[FATAL] No transcript segments…` — confirming both the discovery fix and the fail-fast guard. `bash -n` clean on both installers; `transcriber.py` compiles. The `lib.rs` change was not compile-verified (cold Rust cache) but mirrors the existing `failed.txt` pattern.

### 📄 Changed Files
- `cognito-desktop/python/transcriber.py`
- `cognito-desktop/src-tauri/src/lib.rs`
- `install.sh`
- `build-local.sh`
- `CHANGELOG.md`

---

## [2026-08-02 08:54 IST]

> **No version bump.** This is a code-cleanup / reliability pass, not a user-facing app change, so the app version is intentionally unchanged (see the *Versioning Policy* in `VERSION_LOG.md` — the changelog logs every change; version numbers only move on meaningful app/extension releases).

### 💡 Summary
Repaired the local AI intelligence layer and hardened the audio pipeline in `transcriber.py`. Fixed **truncated-JSON parse failures** and **Gemma-2b repeat-loops** that were leaving `summary.json` empty on every run, made Whisper/diarization **audio windowing fully torchaudio-independent** (it was crashing on runtime devices where torchaudio's native backend fails to load), and added **silence-hallucination filtering** so quiet stretches in real meetings no longer flood the transcript and summary with junk. All four fixes were verified end-to-end on a real session recording.

### 🚀 Detailed Enhancements & Fixes
- **LLM JSON Truncation Fixed (`transcriber.py`):** Raised `max_tokens` on the two `mlx_lm.generate()` calls from `384 → 2048` (map/refine stage) and `400 → 1024` (reduce/synthesis stage). The old limits cut Gemma off mid-JSON, so **every** chunk logged `JSON parse failed` and fell back to raw, unrefined segments (bloating `transcript.json` to thousands of hallucinated fragments) while the summary was fed truncated-JSON garbage.
- **Truncation-Safe JSON Salvage (`salvage_json()`):** New best-effort recovery helper that parses a leading JSON object (ignoring trailing prose via `JSONDecoder.raw_decode`), strips trailing commas, closes dangling strings, and re-balances unclosed `{`/`[` brackets. Wired in ahead of the existing fallbacks at both parse sites, so a clipped response is recovered instead of discarded.
- **Gemma-2b Repeat-Loop Fixed (`mlx_lm` sampler):** Added `sampler=make_sampler(temp=0.3)` and `logits_processors=make_logits_processors(repetition_penalty=1.3, repetition_context_size=64)` to both generate calls. Without a repetition penalty the small 4-bit model degenerated into loops (e.g. emitting `"Yes."` hundreds of times) that consumed the entire token budget before ever writing the `summary`/`action_items` — leaving `summary.json` empty even after the `max_tokens` bump. Verified: same input went from an empty summary to a coherent executive summary + action item.
- **Consecutive-Duplicate Collapse (`collapse_consecutive_duplicates()`):** Runs of identical same-speaker back-channel (`"Yes."` ×40) are merged into one segment before the LLM prompt is built, removing the repetitive input that triggered the loop (44 → 11 segments on the test session) while preserving the timeline.
- **Single-Chunk Notes Fix:** On short (single-chunk) meetings the reduce stage is skipped and the map output — whose schema uses `"summary"` not `"notes"` — was read straight into `summary.json`, producing empty notes. Now synthesizes a proper `notes` object (`executive_summary` + `detailed_summary`) from the map `summary` when `notes` is absent.
- **torchaudio-Free Audio Windowing (`transcriber.py`):** Replaced `torchaudio.info` / `torchaudio.load` / `torchaudio.save` in both the Whisper transcription and diarization windowing paths with `mlx_whisper.audio.load_audio` (ffmpeg-backed, always available) for duration + in-memory slicing, and `soundfile.write(..., subtype="PCM_16")` for diarization temp WAVs. The old code threw `module 'torchaudio' has no attribute 'info'` on runtime devices where torchaudio's native backend does not load (disabling every duration check), and would have crashed outright on `torchaudio.load`/`save` if a >30-minute call ever triggered the windowed path. Also correctly measures duration for headerless streaming WebM (MediaRecorder output reports `Duration: N/A`), which no container-header probe can read.
- **Silence-Hallucination Hardening (`transcriber.py`):** Set `condition_on_previous_text=False` (stops Whisper feeding hallucinated text back as context in an infinite loop) and `hallucination_silence_threshold=2.0` (skips detected silent stretches) on both transcription passes. Added `is_hallucinated_segment()` — a conservative filter (high `no_speech_prob`, or degenerate low-unique-token repetition) applied only to Whisper (`mic`/`tab`) sources in the merge loop — which dropped 33 junk segments on the test session while leaving genuine short affirmations ("yeah, yeah") intact. Captions and AI-refined segments always pass through untouched.

- **Legacy WebM Repair Command Documented (`ARCHITECTURE.md`):** Added a "Repair Legacy WebM Metadata" maintenance command under Developer Diagnostics. New recordings are already fixed in-browser by `webm-fixer.js`, but sessions captured before that fix (or any raw `MediaRecorder` output) still report `Duration: N/A` and cannot be scrubbed. The documented one-liner losslessly remuxes every `.webm` in `~/Downloads/CognitoCall` in place (`ffmpeg -nostdin -c copy`) to restore the `Duration`/`Cues` headers. Note the `-nostdin` flag: without it, `ffmpeg` swallows the `while read` loop's stdin and silently skips files (observed corrupting/skipping 2 of 18 files in testing).
- **Versioning Policy Documented (`VERSION_LOG.md`):** Added an explicit policy clarifying that (a) the Chrome Extension and the Desktop App are versioned on **independent tracks** and are not expected to share a number, and (b) `CHANGELOG.md` is a running log of **all** changes — a changelog entry does not require or imply a version bump; versions advance only on meaningful app/extension releases. This entry itself is an example: logged, but no version change.
- **Project Consistency Sweep (docs / installers / CI):** Fixed a set of doc-vs-code and config mismatches surfaced by a full-project audit:
  - **`ARCHITECTURE.md`** — corrected the recorded filenames to `tab.opus` / `mic.opus` (they were listed as `.webm`) in the extension and pipeline sections, and rewrote the audio-tooling line: decoding is FFmpeg-via-mlx-whisper + `soundfile` WAV slicing, with `torchaudio` noted as `simple-diarizer`'s transitive dependency (it is no longer used directly by `transcriber.py`).
  - **`install.sh` / `build-local.sh`** — both now install Python deps via `pip install -r requirements.txt` (single source of truth) instead of a hardcoded, divergent list. This restores the missing `soundfile` (now load-bearing for diarization WAV slices) and the dropped `speechbrain==0.5.16` / `huggingface-hub<1.0` pins; `build-local.sh` previously created **no** Python venv and installed **no** deps at all. `torchcodec` is retained as a non-fatal best-effort install (only newer `torchaudio` needs it). Also corrected the `.app.tar.gz` fallback asset name (GitHub serves the bundle as `Cognito.Call.app.tar.gz`).
  - **`requirements.txt`** — added `setproctitle` (used to set the `cognito-assistant` process name) and a comment noting `torchaudio` arrives via `simple-diarizer`.
  - **pip self-upgrade in installers (`install.sh` / `build-local.sh`):** both now run `python -m pip install --upgrade pip` (non-fatal) right after creating the venv, before installing dependencies. Fresh venvs are seeded with the system Python's bundled pip — on macOS Command Line Tools Python 3.9 that's pip 21.2.4 (2021), which prints a self-outdated warning and, more importantly, can mis-resolve or fail on modern wheels. This removes the warning and gives every install pip's current dependency resolver.
  - **`.github/workflows/release.yml`** — the macOS desktop release now derives its tag/name from the app's own version (`tauri.conf.json` → `desktop-v…`) instead of reusing the extension's `manifest.json` version, keeping the two independent version tracks from being conflated in the published release.
  - **`file-structure.md`** — added the previously-undocumented `requirements.txt`, `legacy_pytorch_archive/`, `cognito-desktop/README.md`, and a few `src/` files to the tree.
  - **`TESTING.md`** — corrected the "Missing Files" test case to reference `tab.opus` (was `tab.webm`).

### ✅ Verification
Ran the full pipeline on a real session (`~/Downloads/CognitoCall/2026-07-23…`, copied to a scratch folder): no `JSON parse failed` and no `torchaudio` warnings; `Dropped 33 hallucinated/no-speech segment(s)`; both salvage sites recovered truncated JSON; and after the repetition penalty, `summary.json` produced a coherent summary + action item (vs. empty before). Helper functions (`salvage_json`, `is_hallucinated_segment`, `collapse_consecutive_duplicates`) covered by standalone unit checks. Separately, remuxed all 18 legacy `.webm` recordings — every file now reports a valid duration (0 remaining `N/A`).

### 📄 Changed Files
- `cognito-desktop/python/transcriber.py`
- `cognito-desktop/python/requirements.txt`
- `ARCHITECTURE.md`
- `VERSION_LOG.md`
- `file-structure.md`
- `TESTING.md`
- `install.sh`
- `build-local.sh`
- `.github/workflows/release.yml`
- `CHANGELOG.md`

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
- **One-Line Installer & Static FFmpeg Auto-Downloader (`install.sh` & `build-local.sh`):** Added automatic detection and installation of `ffmpeg`. If missing and Homebrew is not present, the installer automatically downloads the official static build of FFmpeg for macOS, extracts it to `~/.cognitocall/bin/`, and appends it to the Tauri runtime `PATH` during child process spawn.
- **Python-Side Environment Bootstrap (`transcriber.py`):** At process startup (before any library import), `transcriber.py` now injects `~/.cognitocall/bin`, `/opt/homebrew/bin`, and all standard macOS bin paths into `os.environ["PATH"]`. This ensures `mlx_whisper`, `simple_diarizer`, and `torchaudio` — which all launch their own sub-processes — can locate `ffmpeg`. Also sets `SPEECHBRAIN_CACHE` to `~/.cognitocall/pretrained_models` and `TORCH_HOME` to `~/.cognitocall/torch`, fixing `OSError: [Errno 30] Read-only file system` when SpeechBrain/PyTorch attempt to cache models inside the read-only app bundle.
- **Diarizer Writeable Model Cache (`transcriber.py`):** Removed invalid `savedir` kwarg from `Diarizer()` constructor. Cache redirection is fully handled via the `SPEECHBRAIN_CACHE` environment variable set at startup.
- **`mlx_lm` API Compatibility Fix (`transcriber.py`):** Renamed `temp=0.1` → `temperature=0.1` in both `mlx_lm.generate()` calls (map and reduce phases). The `mlx_lm` library renamed this argument in a recent version update, causing `TypeError: generate_step() got an unexpected keyword argument 'temp'` — which silently blocked all AI intelligence generation (summaries, action items, titles) and left the UI stuck at 50%.
- **`torchcodec` Missing Dependency (`install.sh`):** Added `torchcodec` to the pip install list in `install.sh`. Newer versions of `torchaudio` require `torchcodec` for audio loading and throw `ImportError: TorchCodec is required for load_with_torchcodec` when it is absent, causing diarization to fail on fresh installs.
- **PyTorch Hub Headless Trust Bypass (`transcriber.py`):** Overrode PyTorch Hub's interactive trusted repository warning checker (`torch.hub._check_repo_is_trusted`) with a type-aligned dummy handler, preventing terminal stdin blockages and `EOFError` during headless VAD downloads while satisfying IDE static check.
- **Loop-Breaking Failure Marker (`failed.txt`):** Added logic in `lib.rs` to write a `failed.txt` file inside the session folder upon cancellation or error. The auto-runner checks for this marker and skips auto-starting failed/cancelled sessions, preventing duplicate background process accumulation.
- **Global App Exit & Window Close Cleanup Hooks & Writeable CWD (`lib.rs`):** Registered callbacks on Tauri `Exit` and `CloseRequested { api: _ }` window events to force-terminate all running `cognito-assistant` helper processes (`pkill -9 -f cognito-assistant`), guaranteeing no zombie helper scripts survive application closure. Resolves Rust compilation pattern destructuring mismatch (E0533). Set the sidecar process's working directory (`.current_dir`) to the writeable session folder, resolving `OSError: [Errno 30] Read-only file system: 'pretrained_models'` when loading SpeechBrain models.
- **In-App Real-Time Progress Bar (0% - 100%) & Stage Indicator (`App.tsx`):** Replaced generic pulse loading box with an animated gradient progress bar and stage status messaging (`25% - Mic`, `50% - Tab`, `70% - Diarization`, `78% - Transcription Completed`, `88% - Gemma Restructuring`, `100% - Complete`), complete with a shortcut hint (*"Press Esc to cancel"*). Removed intermediate jump to 100% after the transcription phase.
- **Developer Diagnostic Commands & Background Monitoring (`ARCHITECTURE.md`):** Added terminal commands section documenting real-time telemetry streaming (`tail -f ~/Downloads/CognitoCall/*/diagnostic.log`), process status inspection (`ps aux | grep cognito-assistant`), dev server log streaming, and memory rescue guidelines.
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
