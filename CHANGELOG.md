# Changelog

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
