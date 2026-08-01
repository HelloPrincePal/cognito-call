// ─── Google Meet Live Captions Extractor Content Script ───
// Observes Google Meet DOM when captions are enabled and streams real-time
// speaker names and caption text to Cognito Call background worker during recording.

(function () {
    console.log('[Cognito Call] Google Meet caption observer initialized.');

    let observer = null;
    let isObserving = false;
    let recordingStartTime = 0;
    let lastProcessedTextMap = new Map(); // speaker -> last processed text

    // Check if recording is active
    async function checkRecordingStatus() {
        try {
            const data = await chrome.storage.local.get(['isRecording', 'recordingStartTime']);
            if (data.isRecording) {
                recordingStartTime = data.recordingStartTime || Date.now();
                startObserving();
            } else {
                stopObserving();
            }
        } catch (e) {
            // Storage access error or context invalidated
        }
    }

    // Listen to storage changes to start/stop observing automatically
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.isRecording) {
            if (changes.isRecording.newValue) {
                checkRecordingStatus();
            } else {
                stopObserving();
            }
        }
    });

    function startObserving() {
        if (isObserving) return;

        // Try to target caption region or fallback to document body
        const targetNode = document.querySelector('[role="region"][aria-label*="caption" i]') ||
                           document.querySelector('[role="region"][aria-label*="Caption" i]') ||
                           document.querySelector('.a5S2') ||
                           document.body;

        if (!targetNode) return;

        observer = new MutationObserver(handleMutations);
        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            characterData: true
        });

        isObserving = true;
        console.log('[Cognito Call] Started observing Google Meet captions.');
    }

    function stopObserving() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        isObserving = false;
        lastProcessedTextMap.clear();
        console.log('[Cognito Call] Stopped observing Google Meet captions.');
    }

    function handleMutations(mutationsList) {
        if (!isObserving) return;

        // Search for active caption blocks
        // Google Meet DOM patterns for captions:
        // Speaker element: .NWpY1d, [data-sender-name], .nMcdL, .TSl20b
        // Text element: .ygicle, .VbkSUe, .bhv1q, [jsname="t-s"]
        const captionNodes = document.querySelectorAll('.a5S2, [role="region"][aria-label*="caption" i] div, div[jsname="ysP1D"]');

        captionNodes.forEach((container) => {
            const speakerEl = container.querySelector('.NWpY1d, [data-sender-name], .nMcdL, .TSl20b, div[jsname="W297wb"]');
            const textEl = container.querySelector('.ygicle, .VbkSUe, .bhv1q, [jsname="t-s"], span[jsname]');

            if (textEl && textEl.textContent) {
                const text = textEl.textContent.trim();
                const speaker = speakerEl ? speakerEl.textContent.trim() : "Speaker";

                if (text && text.length > 2) {
                    const previousText = lastProcessedTextMap.get(speaker) || "";

                    // If text has expanded or changed significantly
                    if (text !== previousText && !previousText.endsWith(text)) {
                        lastProcessedTextMap.set(speaker, text);
                        
                        const now = Date.now();
                        const timestampSec = Math.max(0, (now - (recordingStartTime || now)) / 1000.0);

                        try {
                            chrome.runtime.sendMessage({
                                target: 'service-worker',
                                action: 'captionSegment',
                                segment: {
                                    speaker: speaker,
                                    text: text,
                                    timestamp: timestampSec
                                }
                            });
                        } catch (err) {
                            // Service worker channel closed or idle
                        }
                    }
                }
            }
        });
    }

    // Initial status check on script injection
    checkRecordingStatus();
})();
