let startTime = null;
let timerInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check if there's an active recording when popup opens
    const data = await chrome.storage.local.get(['isRecording', 'recordingStartTime']);
    if (data.isRecording) {
        startTime = data.recordingStartTime;
        startTimer();
        updateUI('recording');
        showStatus('Recording…', 'success');
    }
});

document.getElementById('startBtn').onclick = async () => {
    try {
        updateUI('starting');

        // ── Step 1: Verify microphone permission ──
        let micReady = false;
        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            micReady = (result.state === 'granted');
        } catch (e) {
            const { micPermissionGranted } = await chrome.storage.local.get('micPermissionGranted');
            micReady = !!micPermissionGranted;
        }

        if (!micReady) {
            await chrome.storage.local.remove('micPermissionGranted');
            showStatus('Opening mic permissions page…');
            chrome.tabs.create({
                url: chrome.runtime.getURL('permissions/mic.html')
            });
            updateUI('stopped');
            showStatus('Grant mic access in the new tab, then try again.', 'error');
            return;
        }

        showStatus('Starting capture…');

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            throw new Error('No active tab found.');
        }

        const response = await chrome.runtime.sendMessage({
            target: 'service-worker-from-popup',
            action: 'startRecording',
            tabId: tab.id
        });

        if (response && response.success) {
            const data = await chrome.storage.local.get(['recordingStartTime']);
            startTime = data.recordingStartTime || Date.now();
            startTimer();
            updateUI('recording');
            showStatus('Recording (tab + mic) …', 'success');
        } else {
            throw new Error(response ? response.error : 'Failed to start recording.');
        }
    } catch (error) {
        updateUI('stopped');
        showStatus('Error: ' + error.message, 'error');
    }
};

document.getElementById('stopBtn').onclick = async () => {
    try {
        showStatus('Stopping…');

        const response = await chrome.runtime.sendMessage({
            target: 'service-worker-from-popup',
            action: 'stopRecording'
        });

        if (response && response.success) {
            stopTimer();
            updateUI('stopped');
            showStatus('Recording saved! ✅', 'success');
        } else {
            throw new Error(response ? response.error : 'Failed to stop recording.');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
};

// ─── Timer ───

function startTimer() {
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('timer').textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ─── UI Helpers ───

function updateUI(state) {
    const idleView = document.getElementById('idle-view');
    const recordingView = document.getElementById('recording-view');
    const recBadge = document.getElementById('rec-badge');
    const startBtn = document.getElementById('startBtn');
    const startBtnLabel = document.getElementById('startBtnLabel');

    if (state === 'recording') {
        idleView.style.display = 'none';
        recordingView.style.display = 'flex';
        recBadge.style.display = 'flex';
    } else if (state === 'starting') {
        startBtn.disabled = true;
        startBtnLabel.textContent = 'Starting…';
    } else {
        // stopped / idle
        idleView.style.display = 'flex';
        recordingView.style.display = 'none';
        recBadge.style.display = 'none';
        startBtn.disabled = false;
        startBtnLabel.textContent = 'Start Recording';
    }
}

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = type === 'error' ? 'error' : type === 'success' ? 'success' : '';
}
