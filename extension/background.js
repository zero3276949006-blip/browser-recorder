/**
 * Browser Recorder - Background Service Worker
 * Handles recording lifecycle, event buffering across navigations, and downloads.
 */

let activeRecording = null;  // { tabId, startUrl, events[] }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'RECORDING_STARTED':
      activeRecording = {
        tabId: sender.tab.id,
        startUrl: msg.url,
        events: []
      };
      chrome.action.setBadgeText({ text: '●', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#e74c3c', tabId: sender.tab.id });
      sendResponse({ recording: true });
      break;

    case 'RECORDING_STOPPED':
      if (activeRecording && activeRecording.tabId === sender.tab.id) {
        activeRecording.events = msg.events || activeRecording.events;
        downloadRecording({
          title: documentTitle(msg.startUrl),
          startUrl: activeRecording.startUrl,
          recordedAt: new Date().toISOString(),
          steps: activeRecording.events,
        });
        activeRecording = null;
      }
      chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
      sendResponse({ recording: false });
      break;

    case 'EVENT_RECORDED':
      if (activeRecording && activeRecording.tabId === sender.tab.id) {
        activeRecording.events.push(msg.event);
      }
      break;

    case 'EVENTS_SYNC':
      // Content script is syncing its buffer before navigation
      if (activeRecording && activeRecording.tabId === sender.tab.id && msg.events) {
        activeRecording.events = msg.events;
      }
      break;

    case 'GET_RECORDING_STATUS':
      // Content script checks on init whether recording is active for this tab
      if (activeRecording && activeRecording.tabId === sender.tab.id) {
        sendResponse({
          recording: true,
          startUrl: activeRecording.startUrl,
          eventCount: activeRecording.events.length
        });
      } else {
        sendResponse({ recording: false });
      }
      return true; // keep channel open for async sendResponse
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

function documentTitle(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch {
    return url || 'Untitled Recording';
  }
}
