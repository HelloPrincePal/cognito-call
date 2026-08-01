// ─── State ───
const MAX_RECORDING_MS = 3 * 60 * 60 * 1000; // Hard cap: no recording may exceed 3 hours
const CAP_ALARM = 'recordingCap';

let recording = false;
let recordedTabId = null;
let stopping = false;      // guards requestStop re-entry within a SW instance
let stateCleared = false;  // single-fire guard so overlapping stop triggers notify only once

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

// ─── Auto-stop triggers ───
// Registered synchronously at the top level so Chrome can wake a terminated
// service worker to run them. Handlers re-read state from chrome.storage because
// the in-memory module vars may have been reset when the worker restarted.

// 3-hour hard cap (PRIMARY): the alarm fires even if the service worker was killed.
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== CAP_ALARM) return;
    const { isRecording } = await chrome.storage.local.get('isRecording');
    if (!isRecording) {
        await chrome.alarms.clear(CAP_ALARM);
        return;
    }
    // If the offscreen doc is gone (e.g. the browser was closed mid-recording and
    // reopened past the deadline) there's nothing to save — clear stale state quietly.
    const hasDocument = await chrome.offscreen.hasDocument();
    if (!hasDocument) {
        await clearRecordingState('stale');
        return;
    }
    await requestStop('cap');
});

// Stop when the recorded tab is closed (SECONDARY; the offscreen track `onended`
// is the primary detector). Closing any OTHER tab — including the mic-permission
// tab — is a no-op because the id must match the recorded tab.
chrome.tabs.onRemoved.addListener(async (closedTabId) => {
    const { isRecording, recordedTabId: storedTabId } =
        await chrome.storage.local.get(['isRecording', 'recordedTabId']);
    if (!isRecording) return;
    if (closedTabId !== storedTabId) return;
    await requestStop('tab-closed');
});

// Clear a stale "recording" flag left over from a previous worker that died
// mid-recording (the in-memory recording is unrecoverable once the offscreen doc is gone).
chrome.runtime.onStartup.addListener(reconcileStaleState);
chrome.runtime.onInstalled.addListener(reconcileStaleState);

async function reconcileStaleState() {
    const { isRecording } = await chrome.storage.local.get('isRecording');
    if (!isRecording) return;
    const hasDocument = await chrome.offscreen.hasDocument();
    if (!hasDocument) {
        await clearRecordingState('stale');
    }
}

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
        // Reset for offscreen-initiated stops (track onended / secondary timeout) that
        // never went through requestStop. Idempotent if requestStop already cleared.
        await clearRecordingState(request.reason || 'saved');
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
                reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
                justification: 'Tab recording and playback'
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

        // 3. Tell the offscreen document to start recording.
        //    Pass the cap so it can arm its own secondary safety timer.
        let response = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                response = await chrome.runtime.sendMessage({
                    target: 'offscreen-doc',
                    action: 'startRecording',
                    streamId: streamId,
                    capMs: MAX_RECORDING_MS
                });
                if (response) break;
            } catch (err) {
                if (attempt === 2) throw err;
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        if (response && response.success) {
            recording = true;
            recordedTabId = tabId;
            stopping = false;
            stateCleared = false;

            // Persist so state survives SW termination (source of truth for the auto-stop triggers)
            await chrome.storage.local.set({
                isRecording: true,
                recordingStartTime: Date.now(),
                recordedTabId: tabId,
                capDeadline: Date.now() + MAX_RECORDING_MS
            });

            // Arm the 3-hour hard cap (primary timer — survives SW termination)
            await chrome.alarms.create(CAP_ALARM, { when: Date.now() + MAX_RECORDING_MS });

            // Persistent REC badge on the toolbar icon
            setBadge(true);

            sendResponse({ success: true, recordingId: response.recordingId });
        } else {
            // Failed to start — make sure nothing (alarm/badge) leaks
            await chrome.alarms.clear(CAP_ALARM);
            sendResponse({
                success: false,
                error: response ? response.error : 'No response from offscreen recorder'
            });
        }
    } catch (error) {
        console.error('[SW] startRecording error:', error);
        await chrome.alarms.clear(CAP_ALARM);
        sendResponse({ success: false, error: error.message });
    }
}

// Manual stop from the popup — routes through the single canonical stop path.
async function stopRecording(sendResponse) {
    try {
        await requestStop('manual');
        sendResponse({ success: true });
    } catch (error) {
        console.error('[SW] stopRecording error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// ─── Canonical stop-and-save (service-worker side) ───
// Every SW-initiated stop (manual, 3h cap alarm, tab-close) funnels through here.
async function requestStop(reason) {
    if (stopping) return;
    stopping = true;
    try {
        const { isRecording } = await chrome.storage.local.get('isRecording');
        if (!isRecording && !recording) return; // already stopped

        await chrome.alarms.clear(CAP_ALARM);

        // Ask the offscreen doc to stop, flush buffered chunks, and save.
        // It may already be gone (e.g. after a reload) — that's fine.
        try {
            await chrome.runtime.sendMessage({
                target: 'offscreen-doc',
                action: 'stopRecording',
                reason
            });
        } catch (err) {
            console.warn('[SW] Offscreen stop message failed (may be closed):', err.message);
        }

        // Optimistically reset state now. The later `recordingSaved` from the offscreen
        // doc will find state already cleared and no-op.
        await clearRecordingState(reason);
    } finally {
        stopping = false;
    }
}

// ─── Single canonical state reset + user notification ───
// Runs at most once per recording session. Called by both requestStop and the
// recordingSaved handler; the synchronous `stateCleared` guard dedupes the
// overlapping triggers a tab-close produces (onRemoved + track onended).
async function clearRecordingState(reason) {
    if (stateCleared) return;
    stateCleared = true;

    const { isRecording } = await chrome.storage.local.get('isRecording');
    if (!isRecording) return; // already cleared by a previous worker (stale trigger) — don't re-notify

    recording = false;
    recordedTabId = null;

    await chrome.alarms.clear(CAP_ALARM);
    await chrome.storage.local.remove(['isRecording', 'recordingStartTime', 'recordedTabId', 'capDeadline']);
    setBadge(false);

    // Best-effort: tell the popup (if open) to reset its timer/UI. Rejects when no popup is listening.
    try {
        await chrome.runtime.sendMessage({ target: 'popup', action: 'recordingStopped', reason });
    } catch (_) { /* popup closed — ignored */ }

    notifyAutoStop(reason);
}

// ─── UI helpers ───

function setBadge(active) {
    try {
        chrome.action.setBadgeText({ text: active ? 'REC' : '' });
        if (active) {
            chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
        }
    } catch (err) {
        console.warn('[SW] Could not set badge:', err.message);
    }
}

// Desktop notification for auto-stops only (a manual stop means the user is already present).
function notifyAutoStop(reason) {
    const messages = {
        'cap': 'Recording saved — reached the 3-hour limit.',
        'tab-closed': 'Recording saved — the recorded tab was closed.',
        'capture-ended': 'Recording saved — tab capture ended.'
    };
    const message = messages[reason];
    if (!message) return; // manual / saved / stale → no notification

    try {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: 'Cognito Call',
            message,
            priority: 2
        });
    } catch (err) {
        console.warn('[SW] Could not create notification:', err.message);
    }
}
