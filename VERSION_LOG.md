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
| **v0.2.4** | 2026-03-23 | **Meticulous Design Parity** | 1:1 parity & Boss Design System |
| **v0.2.3** | 2026-03-23 | **Icon Reliability & Layout Fixes** | Pixel-perfect popup & CSP-safe icons |
| **v0.2.2** | 2026-03-19 | **Professional UI Implementation** | High-fidelity UI & Lucide Transition |
| **v0.2.1** | 2026-03-16 | **UI Redesign & Store Readiness** | Professional UI & Permission cleanup |
| **v0.2.0** | 2026-03-15 | **Architecture & Audio Overhaul** | Complete re-architecture & Mic mixing |

| **v0.1.0** | 2026-03-15 | **Initial Prototype** | Basic tab recording proof-of-concept |

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
