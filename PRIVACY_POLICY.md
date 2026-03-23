# Privacy Policy for Cognito Call

**Effective Date:** March 23, 2026

At **Cognito Call**, we believe your privacy is non-negotiable. This extension is designed to be **local-first**, meaning your data stays under your control at all times.

## 1. Data Collection
Cognito Call **does not collect, store, or transmit** any personal data, audio recordings, or metadata to any external servers. 

*   **Audio Data:** All recordings (Tab audio and Microphone audio) are processed locally on your device using the browser's MediaRecorder API.
*   **No Tracking:** We do not use cookies, trackers, or analytics (like Google Analytics).
*   **No Accounts:** You do not need an account to use the extension.

## 2. Data Storage
*   **Local Processing:** Audio chunks are stored in your computer's memory while recording.
*   **File Saving:** When you stop a recording, the resulting `.webm` file is saved directly to your computer's **Downloads** folder via the Chrome Downloads API. We do not keep a copy of this file.

## 3. Permissions Justification
*   `tabCapture`: Required to record the audio from the meeting tab you select.
*   `microphone`: Required to include your own voice in the recording.
*   `offscreen`: Required to process heavy audio data in a separate background window, ensuring your browser remains fast.
*   `downloads`: Required to save the final recording file to your computer.
*   `storage`: Used only to remember if a recording is currently in progress (so the timer doesn't reset if you close the popup).

## 4. Third Parties
Cognito Call does not share any information with third parties.

## 5. Changes to This Policy
If we add cloud features in the future (like AI transcription), this policy will be updated, and you will be notified. However, the **Local-Only** version will always remain private.

## Contact
If you have any questions, feel free to reach out via GitHub or email: [HelloPrincePal@gmail.com](mailto:HelloPrincePal@gmail.com)
