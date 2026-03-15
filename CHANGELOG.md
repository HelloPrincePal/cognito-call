# Changelog

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
