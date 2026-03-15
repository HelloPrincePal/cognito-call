// ─── State ───
let recording = false;

// ─── Message Router ───
// The service worker is the central hub:
//   popup  ──▶  service-worker  ──▶  offscreen document
//   popup  ◀──  service-worker  ◀──  offscreen document

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Messages FROM the offscreen recorder
    if (request.target === 'service-worker') {
        handleOffscreenMessage(request, sendResponse);
        return true;
    }

    // Messages FROM the popup
    if (request.target === 'service-worker-from-popup') {
        handlePopupMessage(request, sendResponse);
        return true;
    }
});

async function handlePopupMessage(request, sendResponse) {
    try {
        if (request.action === 'startRecording') {
            await startRecording(request.tabId, sendResponse);
        } else if (request.action === 'stopRecording') {
            await stopRecording(sendResponse);
        } else if (request.action === 'getStatus') {
            sendResponse({ recording });
        }
    } catch (error) {
        console.error('[SW] handlePopupMessage error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleOffscreenMessage(request, sendResponse) {
    if (request.action === 'recordingSaved') {
        console.log(`[SW] Recording saved: ${request.filename} (${request.sizeMB} MB)`);
        recording = false;
        await chrome.storage.local.remove(['isRecording', 'recordingStartTime']);
    }

    if (request.action === 'downloadRecording') {
        // Offscreen docs can't use chrome.downloads — we do it here
        try {
            await chrome.downloads.download({
                url: request.dataUrl,
                filename: request.filename,
                saveAs: false
            });
            console.log('[SW] Download started:', request.filename);
        } catch (err) {
            console.error('[SW] Download error:', err);
        }
    }

    sendResponse({ ok: true });
}

// ─── Core Logic ───

async function startRecording(tabId, sendResponse) {
    try {
        // 1. Ensure offscreen document exists
        const hasDocument = await chrome.offscreen.hasDocument();
        if (!hasDocument) {
            await chrome.offscreen.createDocument({
                url: 'offscreen/recorder.html',
                reasons: ['USER_MEDIA'],
                justification: 'Tab recording via MediaRecorder'
            });
            // Give the offscreen document time to load and register its listener
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // 2. Get stream ID (MUST be called from service worker in MV3)
        const streamId = await new Promise((resolve, reject) => {
            chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                resolve(id);
            });
        });

        // 3. Tell the offscreen document to start recording
        const response = await chrome.runtime.sendMessage({
            target: 'offscreen-doc',
            action: 'startRecording',
            streamId: streamId
        });

        if (response && response.success) {
            recording = true;

            // Service worker sets storage (so it persists even if popup closes)
            await chrome.storage.local.set({
                isRecording: true,
                recordingStartTime: Date.now()
            });

            sendResponse({ success: true, recordingId: response.recordingId });
        } else {
            sendResponse({
                success: false,
                error: response ? response.error : 'No response from offscreen recorder'
            });
        }
    } catch (error) {
        console.error('[SW] startRecording error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function stopRecording(sendResponse) {
    try {
        const response = await chrome.runtime.sendMessage({
            target: 'offscreen-doc',
            action: 'stopRecording'
        });

        recording = false;
        await chrome.storage.local.remove(['isRecording', 'recordingStartTime']);

        if (response && response.success) {
            sendResponse({ success: true });
        } else {
            sendResponse({
                success: false,
                error: response ? response.error : 'No response from offscreen recorder'
            });
        }
    } catch (error) {
        console.error('[SW] stopRecording error:', error);
        sendResponse({ success: false, error: error.message });
    }
}
