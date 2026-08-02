# 🧪 Cognito Call - Testing & Quality Assurance Log

Use this document to log your findings while stress-testing the Cognito Call recording and AI transcription pipeline.

---

## 🖥️ Hardware Profile
*Fill this out to establish a baseline for your metrics.*
- **Mac Model:** MacBook Air (M-Series)
- **RAM:** [e.g., 8GB / 16GB]
- **OS Version:** [e.g., macOS Sonoma]

---

## 📊 1. Performance & Speed Benchmarks

**Method:** Record meetings of varying lengths. Open `Activity Monitor` while the UI says "Processing Recording". Track the memory and CPU load of the `cognito-assistant` process. 

| Test | Video Length | Processing Time | Speed Factor (Length / Time) | Peak RAM Usage | Avg CPU % |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Short** | 2 mins | ~15 sec | ~8x | ~310 MB | ~180% |
| **Medium** | 15 mins | ~45 sec | ~20x | ~340 MB | ~210% |
| **Long (3-Hour / 2GB)** | 180 mins | ~8 mins | ~22x | ~350 MB ($O(1)$) | ~240% |
| **Google Meet Fast-Path**| 60 mins | ~2 sec | ~1800x | ~80 MB | ~20% |

*Notes on Performance:*
> Streaming 15-minute Whisper audio windowing and windowed diarization reduced peak RAM usage on 3-hour (2 GB) recordings from ~4.5 GB down to ~350 MB. The fanless MacBook Air chip ran cool without memory pressure or thermal throttling.

---

## 🗣️ 2. Speaker Diarization & Sentence Restructuring Accuracy

**Method:** Join a meeting with different numbers of participants. Evaluate sentence restructuring and speaker attribution.

| Scenario | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- |
| **1-on-1 Meeting** | "Ram" + "Speaker 1" | "Ram" assigned to local mic; Speaker 1 to remote tab | Pass |
| **Google Meet Captions** | Participant display names | Extracted directly from live Meet DOM via `MutationObserver` | Pass |
| **Contextual Speaker Name**| Direct address ("Ram, your turn") | Gemma correctly attributes next sentence to "Ram" | Pass |
| **Sentence Segmentation** | Clean, punctuated sentences | Compact ~50 KB `transcript.json` with timestamped sentence blocks | Pass |

*Notes on Accuracy:*
> [Type findings here: Did Speaker 2 get confused with Speaker 3? Were your words accidentally assigned to a remote speaker?]

---

## 🛑 3. Edge Cases & App Stability

| Edge Case Test | Execution Method | Expected Behavior | Actual Behavior | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Process Cancellation** | Press `Escape` on Home view while transcribing | Instantly sends non-blocking `kill -9` to `cognito-assistant` PID; UI returns immediately | Pass |
| **App Close During Run** | Close window while sidecar running | `on_window_event` window destroy hook kills child PID without orphan processes | Pass |
| **3-Hour Recording Cap** | Leave recorder running >3 hours | Extension auto-stops recording, injects EBML Cues/Duration headers, and saves `.webm` | Pass |
| **3-Hour Audio Windowing** | Transcribe 180-minute Opus recording | Slices audio into 15-minute streaming windows; clears Metal cache after each window | Pass |
| **Micro-Recording** | Record for only 3 seconds (nobody speaks), then generate. | Gracefully outputs empty transcript without crashing. | |
| **Background Noise**| Play music or type loudly while speaking. | Whisper ignores noise / Chrome suppresses echo. | |
| **Mid-Process Kill** | Start processing, then instantly quit the Tauri app. | Python process terminates; no zombie processes in Activity Monitor. | |
| **Spam UI** | Spam click "Reload App" while processing is running. | App reloads safely; processing continues or fails gracefully. | |
| **Missing Files** | Manually delete `tab.opus` from folder, click generate. | Pipeline detects missing file and aborts gracefully. | |

*Notes on Stability:*
> [Type findings here: Did anything cause the app to completely freeze? Did any zombie processes survive?]

---

## 🎯 4. Karaoke UI Sync Test

**Method:** Open a successfully generated transcript in the Cognito Gallery.

- [ ] **Highlight Sync:** Do the words highlight at the exact millisecond they are spoken?
- [ ] **Click-to-Jump:** If you click a word 10 minutes into the transcript, does the video instantly jump to the exact correct frame?
- [ ] **Scrolling:** Does the transcript panel auto-scroll correctly as the video plays? *(Note: auto-scroll might need to be implemented later if it's missing!)*

*Notes on UI:*
> [Type findings here]
