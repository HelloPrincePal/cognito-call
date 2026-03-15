let mediaRecorder = null;
let recordedChunks = [];
let recordingId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startRecording') {
        startRecording(request.tabId).then(sendResponse);
        return true;
    } else if (request.action === 'stopRecording') {
        stopRecording().then(sendResponse);
        return true;
    }
});

async function startRecording(tabId) {
    try {
        // Get tab media stream
        const streamId = await chrome.tabCapture.getMediaStreamId({
            tabId: tabId,
            audio: true,
            video: true
        });

        const stream = await navigator.mediaDevices.getUserMedia({
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

        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) recordedChunks.push(event.data);
        };

        mediaRecorder.onstop = saveRecording;

        mediaRecorder.start(1000); // Collect data every second

        recordingId = Date.now().toString();

        return { success: true, recordingId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // Stop the stream
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    return { success: true };
}

async function saveRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const filename = `cognito-call-${recordingId}.webm`;

    // Trigger download
    chrome.downloads.download({
        url: URL.createObjectURL(blob),
        filename: `CognitoCall/${filename}`,
        saveAs: false
    });

    // Notify background
    chrome.runtime.sendMessage({
        action: 'recordingSaved',
        filename: filename,
        duration: Math.floor((Date.now() - parseInt(recordingId)) / 1000)
    });
}
