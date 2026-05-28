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

**Method:** Record meetings of varying lengths. Open `Activity Monitor` while the UI says "Processing Recording". Track the memory and CPU load of the `python3.9` process. 

| Test | Video Length | Processing Time | Speed Factor (Length / Time) | Peak RAM Usage | Avg CPU % |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Short** | 2 mins | [e.g., 30 sec] | [e.g., 4x] | | |
| **Medium** | 10 mins | | | | |
| **Long** | 30+ mins | | | | |

*Notes on Performance:*
> [Type findings here: Did the computer get hot? Did other apps lag?]

---

## 🗣️ 2. Speaker Diarization Accuracy

**Method:** Join a meeting with different numbers of participants. Evaluate how well `simple-diarizer` separates the remote audio (`tab.webm`).

| Scenario | Expected Result | Actual Result | Stitching Accuracy (Pass/Fail) |
| :--- | :--- | :--- | :--- |
| **1-on-1 Meeting** | "Me" + "Speaker 1" | | |
| **Group (3-4 People)** | "Me" + Speakers 1, 2, 3 | | |
| **Cross-Talk** | Overlapping speech is tracked cleanly | | |
| **Speaker Dominance**| 1 person speaks 90% of the time | | |

*Notes on Accuracy:*
> [Type findings here: Did Speaker 2 get confused with Speaker 3? Were your words accidentally assigned to a remote speaker?]

---

## 🛑 3. Edge Cases & App Stability

**Method:** Try to intentionally "break" the app to see how the system recovers.

| Edge Case Test | Execution Method | Expected Behavior | Actual Behavior |
| :--- | :--- | :--- | :--- |
| **Micro-Recording** | Record for only 3 seconds (nobody speaks), then generate. | Gracefully outputs empty transcript without crashing. | |
| **Background Noise**| Play music or type loudly while speaking. | Whisper ignores noise / Chrome suppresses echo. | |
| **Mid-Process Kill** | Start processing, then instantly quit the Tauri app. | Python process terminates; no zombie processes in Activity Monitor. | |
| **Spam UI** | Spam click "Reload App" while processing is running. | App reloads safely; processing continues or fails gracefully. | |
| **Missing Files** | Manually delete `tab.webm` from folder, click generate. | Pipeline detects missing file and aborts gracefully. | |

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
