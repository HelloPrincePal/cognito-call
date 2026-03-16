# 🎯 Phase 1: Chrome Extension Spec

## 🛠 Tech Stack
- **Core:** JavaScript (Manifest V3), HTML, Vanilla CSS.
- **Audio:** Tab Capture API + Web Audio API (Mic mixing).
- **Storage:** Chrome Offscreen API + MediaRecorder.
- **Icons:** **Remix Icon** library (`https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css`).
- **Typography:** Inter Font.

## 🎨 Design Rules
- All icons **MUST** use the Remix Icon library. 
- Use specific `ri-` classes (e.g., `ri-mic-fill`, `ri-record-circle-line`).
- Primary Color: `#335CFF` (Indigo).
- UI Width: `360px`.
- Corner Radius: `16px`.

## 🔒 Constraints
- No external APIs (except Icon CDN).
- 100% Local processing.
- No cloud storage.
