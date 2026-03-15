chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startRecording') {
        // Forward to offscreen
        chrome.runtime.sendMessage({ ...request }, { frameId: 0 });
        sendResponse({ success: true });
        return true;
    } else if (request.action === 'stopRecording') {
        chrome.runtime.sendMessage({ ...request });
        sendResponse({ success: true });
        return true;
    } else if (request.action === 'recordingSaved') {
        console.log('Recording saved:', request.filename);
    }
});
