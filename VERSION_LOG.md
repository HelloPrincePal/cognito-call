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
| **v0.2.1** | 2026-03-16 | **UI Redesign & Store Readiness** | Professional UI & Permission cleanup |
| **v0.2.0** | 2026-03-15 | **Architecture & Audio Overhaul** | Complete re-architecture & Mic mixing |

| **v0.1.0** | 2026-03-15 | **Initial Prototype** | Basic tab recording proof-of-concept |

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
