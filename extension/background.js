/**
 * Browser Recorder - Background Service Worker
 * Handles recording lifecycle and downloads.
 */
let activeRecording = null;

chrome.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case 'RECORDING_STARTED':
      activeRecording = { tabId: sender.tab.id, url: msg.url };
      chrome.action.setBadgeText({ text: '●', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#e74c3c', tabId: sender.tab.id });
      break;

    case 'RECORDING_STOPPED':
      activeRecording = null;
      chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
      downloadRecording(msg.recording);
      break;

    case 'EVENT_RECORDED':
      // Could update step count badge here
      break;
  }
});

function downloadRecording(recording) {
  const json = JSON.stringify(recording, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `recording-${timestamp}.json`;

  chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  });
}