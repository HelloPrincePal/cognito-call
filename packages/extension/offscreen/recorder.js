let mediaRecorder = null;
let recordedChunks = [];
let activeStream = null;
let micStream = null;
let audioContext = null;
let recordingFilename = null;

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

// ─── Filename Helper ───
// Generates: CognitoCall_2026-03-15_15-30-25.webm
function generateFilename() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `CognitoCall/CognitoCall_${date}_${time}.webm`;
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

        // ── 3. Mix audio streams using Web Audio API ──
        let recordingStream;

        if (micStream && tabStream.getAudioTracks().length > 0) {
            // Mix tab audio + microphone audio
            audioContext = new AudioContext();
            const dest = audioContext.createMediaStreamDestination();

            // Tab audio source
            const tabAudioSource = audioContext.createMediaStreamSource(
                new MediaStream(tabStream.getAudioTracks())
            );
            tabAudioSource.connect(dest);

            // Microphone audio source
            const micSource = audioContext.createMediaStreamSource(micStream);
            micSource.connect(dest);

            // Combined stream = tab video + mixed audio
            recordingStream = new MediaStream([
                ...tabStream.getVideoTracks(),
                ...dest.stream.getAudioTracks()
            ]);

            console.log('[Offscreen] Audio mixing: tab + microphone');
        } else {
            // Fallback: just use the tab stream as-is
            recordingStream = tabStream;
            console.log('[Offscreen] Audio: tab only (no mic)');
        }

        // ── 4. Create MediaRecorder with optimized settings ──
        recordedChunks = [];
        recordingFilename = generateFilename();

        // VP9 + Opus gives much better compression than VP8
        // Target: ~8-10 MB per minute instead of ~20 MB per minute
        const mimeOptions = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];

        let selectedMime = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

        mediaRecorder = new MediaRecorder(recordingStream, {
            mimeType: selectedMime,
            videoBitsPerSecond: 1_000_000,  // 1 Mbps video (was unset = ~2.5 Mbps)
            audioBitsPerSecond: 128_000     // 128 Kbps audio
        });

        console.log('[Offscreen] MediaRecorder codec:', selectedMime);
        console.log('[Offscreen] Bitrate: 1 Mbps video + 128 Kbps audio');

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) recordedChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            saveRecording();
        };

        mediaRecorder.start(1000); // Collect data every second

        console.log('[Offscreen] Recording started:', recordingFilename);
        return { success: true, recordingId: recordingFilename };
    } catch (error) {
        console.error('[Offscreen] startRecording error:', error);
        return { success: false, error: error.message };
    }
}

function cleanupStreams() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
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
        audioContext.close().catch(() => {});
        audioContext = null;
    }
}

async function stopRecording() {
    try {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
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
            audioContext.close().catch(() => {});
            audioContext = null;
        }
        console.log('[Offscreen] Recording stopped');
        return { success: true };
    } catch (error) {
        console.error('[Offscreen] stopRecording error:', error);
        return { success: false, error: error.message };
    }
}

async function saveRecording() {
    if (recordedChunks.length === 0) {
        console.warn('[Offscreen] No recorded chunks to save.');
        return;
    }

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const sizeInMB = (blob.size / (1024 * 1024)).toFixed(2);
    const filename = recordingFilename || generateFilename();

    console.log(`[Offscreen] Saving recording: ${filename} (${sizeInMB} MB)`);

    // Convert blob to data URL, then send to service worker for download
    // (offscreen documents do NOT have access to chrome.downloads)
    const reader = new FileReader();
    reader.onloadend = () => {
        // Ask the service worker to trigger the download
        chrome.runtime.sendMessage({
            target: 'service-worker',
            action: 'downloadRecording',
            dataUrl: reader.result,
            filename: filename
        });

        // Also notify that recording was saved
        chrome.runtime.sendMessage({
            target: 'service-worker',
            action: 'recordingSaved',
            filename: filename,
            sizeMB: sizeInMB
        });
    };
    reader.readAsDataURL(blob);

    // Clean up
    recordedChunks = [];
}
