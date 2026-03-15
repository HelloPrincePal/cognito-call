let recordingId = null;
let startTime = null;
let timerInterval = null;

document.getElementById('startBtn').onclick = async () => {
    try {
        // Create offscreen document for recording
        await chrome.offscreen.createDocument({
            url: 'offscreen/recorder.html',
            reasons: ['DOM_PARSER'],
            justification: 'media recording'
        });

        // Send message to start recording
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.runtime.sendMessage({
            action: 'startRecording',
            tabId: tab.id
        });

        if (response.success) {
            recordingId = response.recordingId;
            startTime = Date.now();
            startTimer();
            updateUI('recording', true);
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
};

document.getElementById('stopBtn').onclick = async () => {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'stopRecording',
            recordingId: recordingId
        });

        if (response.success) {
            showStatus(`Saved: ${response.filename}`, 'success');
            updateUI('stopped');
            stopTimer();
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
};

function startTimer() {
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('timer').textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

function updateUI(state, recording = false) {
    document.getElementById('startBtn').style.display = state === 'recording' ? 'none' : 'block';
    document.getElementById('startBtn').disabled = recording;
    document.getElementById('stopBtn').style.display = state === 'recording' ? 'block' : 'none';
    document.getElementById('timer').style.display = state === 'recording' ? 'block' : 'none';
}

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? '#fecaca' : type === 'success' ? '#bbf7d0' : 'white';
}
