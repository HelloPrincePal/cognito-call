const grantBtn = document.getElementById('grantBtn');
const statusEl = document.getElementById('status');

// Check if already persistently granted
checkExistingPermission();

async function checkExistingPermission() {
    try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'granted') {
            await chrome.storage.local.set({ micPermissionGranted: true });
            showGranted();
        } else {
            // Clear stale flag if permission was revoked or temporary
            await chrome.storage.local.remove('micPermissionGranted');
        }
    } catch (e) {
        // permissions.query may not support 'microphone' in all contexts
        console.warn('Cannot query permission state:', e);
    }
}

grantBtn.onclick = async () => {
    grantBtn.disabled = true;
    grantBtn.textContent = 'Requesting…';
    statusEl.textContent = '';

    try {
        // This will show Chrome's native permission dialog
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Permission obtained — stop the stream, we only needed the grant
        stream.getTracks().forEach(track => track.stop());

        // Now verify: is this a PERSISTENT grant or just "only this time"?
        let persistent = false;
        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            persistent = (result.state === 'granted');
        } catch (e) {
            // If we can't query, assume persistent (best effort)
            persistent = true;
        }

        if (persistent) {
            // Full "Allow" — save flag and close
            await chrome.storage.local.set({ micPermissionGranted: true });
            showGranted();
            setTimeout(() => window.close(), 1500);
        } else {
            // User chose "Only this time" — not enough for the offscreen document
            await chrome.storage.local.remove('micPermissionGranted');
            grantBtn.disabled = false;
            grantBtn.textContent = 'Grant Microphone Access';
            statusEl.className = 'error';
            statusEl.innerHTML = `
                <strong>⚠️ You selected "Only this time"</strong><br><br>
                The recording happens in a background process that can't use temporary permissions.
                Please click the button again and select <strong>"Allow"</strong> (not "Only this time")
                so the permission persists.
            `;
        }
    } catch (err) {
        grantBtn.disabled = false;
        grantBtn.textContent = 'Grant Microphone Access';

        if (err.name === 'NotAllowedError') {
            statusEl.className = 'error';
            statusEl.textContent = 'Permission denied. Please click the button and select "Allow" in Chrome\'s prompt.';
        } else {
            statusEl.className = 'error';
            statusEl.textContent = 'Error: ' + err.message;
        }
    }
};

function showGranted() {
    grantBtn.disabled = true;
    grantBtn.textContent = '✅ Access Granted Permanently';
    grantBtn.style.background = '#374151';
    statusEl.className = 'success';
    statusEl.textContent = 'Microphone access granted! You can close this tab and start recording.';
}
