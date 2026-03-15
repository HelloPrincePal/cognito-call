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
        // Neither popups nor offscreen documents can show Chrome's mic
        // permission prompt (both get "Permission dismissed").
        // We verify the ACTUAL permission state, not just a stored flag.
        let micReady = false;
        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            micReady = (result.state === 'granted');
        } catch (e) {
            // Fallback to stored flag if permissions.query doesn't work
            const { micPermissionGranted } = await chrome.storage.local.get('micPermissionGranted');
            micReady = !!micPermissionGranted;
        }

        if (!micReady) {
            // Clear any stale stored flag
            await chrome.storage.local.remove('micPermissionGranted');
            // Open the permissions page in a new tab
            showStatus('Opening mic permissions page…');
            chrome.tabs.create({
                url: chrome.runtime.getURL('permissions/mic.html')
            });
            updateUI('stopped');
            showStatus('Grant mic access in the new tab (choose "Allow"), then try again.', 'info');
            return;
        }

        showStatus('Starting capture…');

        // ── Step 2: Get the active tab ──
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            throw new Error('No active tab found.');
        }

        // ── Step 3: Ask the service worker to handle everything ──
        // (tabCapture + offscreen document + start recording)
        const response = await chrome.runtime.sendMessage({
            target: 'service-worker-from-popup',
            action: 'startRecording',
            tabId: tab.id
        });

        if (response && response.success) {
            // Storage is already set by the service worker, but read it for the timer
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
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const timer = document.getElementById('timer');

    if (state === 'recording') {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        timer.style.display = 'block';
    } else if (state === 'starting') {
        startBtn.disabled = true;
        startBtn.textContent = 'Starting…';
    } else {
        // stopped
        startBtn.style.display = 'block';
        startBtn.disabled = false;
        startBtn.textContent = 'Start Recording';
        stopBtn.style.display = 'none';
        timer.style.display = 'none';
        timer.textContent = '00:00';
    }
}

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? '#fecaca' : type === 'success' ? '#bbf7d0' : 'white';
}
