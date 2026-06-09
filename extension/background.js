/**
 * Browser Recorder - Background Service Worker
 * Handles badge updates, event buffering, and download triggers.
 * State is persisted in chrome.storage.session (survives SW restarts).
 */

const BR_KEY = 'br_events';
const REC_KEY = 'br_recording';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'RECORDING_STARTED':
      chrome.action.setBadgeText({ text: '\u25CF', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#e74c3c', tabId: sender.tab.id });
      break;

    case 'RECORDING_STOPPED':
      chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
      downloadRecording(msg.recording);
      break;

    case 'EVENT_RECORDED':
      // Append event to session storage buffer
      chrome.storage.session.get([BR_KEY], (data) => {
        const buf = data[BR_KEY] || [];
        buf.push(msg.event);
        chrome.storage.session.set({ [BR_KEY]: buf });
      });
      break;

    case 'EVENTS_SYNC':
      // Replace entire buffer (used on beforeunload)
      chrome.storage.session.set({ [BR_KEY]: msg.events });
      break;
  }
});

function downloadRecording(recording) {
  const json = JSON.stringify(recording, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  chrome.downloads.download({ url, filename: `recording-${timestamp}.json`, saveAs: true });
}
