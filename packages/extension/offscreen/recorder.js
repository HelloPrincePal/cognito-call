let videoRecorder = null;
let tabAudioRecorder = null;
let micAudioRecorder = null;

let videoChunks = [];
let tabAudioChunks = [];
let micAudioChunks = [];

let activeStream = null;
let micStream = null;
let audioContext = null;
let workspacePrefix = null;
let tabAudioOutput = null;

// ─── Message Listener ───
// Only handle messages targeted at 'offscreen-doc' (from service worker)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target !== 'offscreen-doc') return false;

    if (request.action === 'startRecording') {
        startRecording(request.streamId).then(sendResponse);
        return true; // keep channel open for async response
    } else if (request.action === 'stopRecording') {
        stopRecording().then(sendResponse);
        return true;
    }
});

// ─── Workspace Prefix Helper ───
// Generates: CognitoCall/2026-03-15_15-30-25/
function generateWorkspacePrefix() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `CognitoCall/${date}_${time}/`;
}

async function startRecording(streamId) {
    try {
        // ── Clean up any previous session ──
        cleanupStreams();

        // ── 1. Get the tab stream (video + system/tab audio) ──
        const tabStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            }
        });

        activeStream = tabStream;

        // ── 2. Try to get microphone stream ──
        // This captures the user's voice so both sides of the call are recorded
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            console.log('[Offscreen] Microphone captured successfully');
        } catch (micError) {
            console.warn('[Offscreen] Microphone not available, recording tab audio only:', micError.message);
            micStream = null;
        }

        // ── 3. Extract independent audio streams ──
        let tabAudioStream = null;
        if (tabStream.getAudioTracks().length > 0) {
            tabAudioStream = new MediaStream(tabStream.getAudioTracks());

            // Unmute the tab to the user: route tab audio to the system speakers
            tabAudioOutput = new Audio();
            tabAudioOutput.srcObject = tabAudioStream;
            tabAudioOutput.play().catch(e => console.warn('[Offscreen] Could not play tab audio:', e));
        }

        let micAudioStream = null;
        if (micStream && micStream.getAudioTracks().length > 0) {
            micAudioStream = new MediaStream(micStream.getAudioTracks());
        }

        // ── 4. Mix audio streams for the video file ──
        let recordingStream;

        if (micStream && tabStream.getAudioTracks().length > 0) {
            audioContext = new AudioContext();
            const dest = audioContext.createMediaStreamDestination();

            const tabAudioSource = audioContext.createMediaStreamSource(tabAudioStream);
            tabAudioSource.connect(dest);

            const micSource = audioContext.createMediaStreamSource(micAudioStream);
            micSource.connect(dest);

            recordingStream = new MediaStream([
                ...tabStream.getVideoTracks(),
                ...dest.stream.getAudioTracks()
            ]);

            console.log('[Offscreen] Audio mixing: tab + microphone');
        } else {
            recordingStream = tabStream;
            console.log('[Offscreen] Audio: tab only (no mic)');
        }

        // ── 5. Create Recorders ──
        videoChunks = [];
        tabAudioChunks = [];
        micAudioChunks = [];
        workspacePrefix = generateWorkspacePrefix();

        const mimeOptions = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        let selectedMime = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

        videoRecorder = new MediaRecorder(recordingStream, {
            mimeType: selectedMime,
            videoBitsPerSecond: 1_000_000,
            audioBitsPerSecond: 128_000
        });

        videoRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) videoChunks.push(event.data);
        };

        if (tabAudioStream) {
            tabAudioRecorder = new MediaRecorder(tabAudioStream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128_000
            });
            tabAudioRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) tabAudioChunks.push(event.data);
            };
        }

        if (micAudioStream) {
            micAudioRecorder = new MediaRecorder(micAudioStream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128_000
            });
            micAudioRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) micAudioChunks.push(event.data);
            };
        }

        let activeRecordersCount = 1 + (tabAudioRecorder ? 1 : 0) + (micAudioRecorder ? 1 : 0);
        let stoppedRecordersCount = 0;
        const checkDone = () => {
            stoppedRecordersCount++;
            if (stoppedRecordersCount === activeRecordersCount) {
                saveRecordings();
            }
        };

        videoRecorder.onstop = checkDone;
        if (tabAudioRecorder) tabAudioRecorder.onstop = checkDone;
        if (micAudioRecorder) micAudioRecorder.onstop = checkDone;

        // ── 6. Synchronous Start ──
        videoRecorder.start(1000);
        if (tabAudioRecorder) tabAudioRecorder.start(1000);
        if (micAudioRecorder) micAudioRecorder.start(1000);

        console.log('[Offscreen] Recording started in workspace:', workspacePrefix);
        return { success: true, recordingId: workspacePrefix };
    } catch (error) {
        console.error('[Offscreen] startRecording error:', error);
        return { success: false, error: error.message };
    }
}

function cleanupStreams() {
    if (videoRecorder && videoRecorder.state === 'recording') videoRecorder.stop();
    if (tabAudioRecorder && tabAudioRecorder.state === 'recording') tabAudioRecorder.stop();
    if (micAudioRecorder && micAudioRecorder.state === 'recording') micAudioRecorder.stop();

    if (tabAudioOutput) {
        tabAudioOutput.pause();
        tabAudioOutput.srcObject = null;
        tabAudioOutput = null;
    }

    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (audioContext) {
        audioContext.close().catch(() => { });
        audioContext = null;
    }
}

async function stopRecording() {
    try {
        if (videoRecorder && videoRecorder.state === 'recording') videoRecorder.stop();
        if (tabAudioRecorder && tabAudioRecorder.state === 'recording') tabAudioRecorder.stop();
        if (micAudioRecorder && micAudioRecorder.state === 'recording') micAudioRecorder.stop();

        if (tabAudioOutput) {
            tabAudioOutput.pause();
            tabAudioOutput.srcObject = null;
            tabAudioOutput = null;
        }

        // Stop all tracks
        if (activeStream) {
            activeStream.getTracks().forEach(track => track.stop());
            activeStream = null;
        }
        if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
            micStream = null;
        }
        if (audioContext) {
            audioContext.close().catch(() => { });
            audioContext = null;
        }
        console.log('[Offscreen] Recording stopped');
        return { success: true };
    } catch (error) {
        console.error('[Offscreen] stopRecording error:', error);
        return { success: false, error: error.message };
    }
}

async function saveRecordings() {
    let totalSizeMB = 0;
    const prefix = workspacePrefix || "CognitoCall/";
    let filesProcessed = 0;
    let filesToProcess = 0;

    const processFile = (chunks, mimeType, filename) => {
        if (chunks.length === 0) return;
        filesToProcess++;

        const blob = new Blob(chunks, { type: mimeType });
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        totalSizeMB += parseFloat(sizeMB);

        const fullFilename = `${prefix}${filename}`;
        console.log(`[Offscreen] Saving ${fullFilename} (${sizeMB} MB)`);

        const blobUrl = URL.createObjectURL(blob);
        
        chrome.runtime.sendMessage({
            target: 'service-worker',
            action: 'downloadRecording',
            dataUrl: blobUrl,
            filename: fullFilename
        });

        filesProcessed++;
        checkAllProcessed();
    };

    const checkAllProcessed = () => {
        if (filesProcessed === filesToProcess && filesToProcess > 0) {
            chrome.runtime.sendMessage({
                target: 'service-worker',
                action: 'recordingSaved',
                filename: prefix,
                sizeMB: totalSizeMB.toFixed(2)
            });
        }
    };

    processFile(videoChunks, 'video/webm', 'video.webm');
    processFile(tabAudioChunks, 'audio/webm', 'tab.opus');
    processFile(micAudioChunks, 'audio/webm', 'mic.opus');

    if (filesToProcess === 0) {
        console.warn('[Offscreen] No recorded chunks to save.');
    }

    // Clean up
    videoChunks = [];
    tabAudioChunks = [];
    micAudioChunks = [];
}
