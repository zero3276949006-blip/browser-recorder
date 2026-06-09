/**
 * Browser Recorder - Popup Script
 */
const btnRecord = document.getElementById('btn-record');
const btnStop = document.getElementById('btn-stop');
const btnAssertVisible = document.getElementById('btn-assert-visible');
const btnAssertText = document.getElementById('btn-assert-text');
const btnScreenshot = document.getElementById('btn-screenshot');
const statusEl = document.getElementById('status');
const stepCountEl = document.getElementById('step-count');
const countEl = document.getElementById('count');
const actionBtns = [btnAssertVisible, btnAssertText, btnScreenshot];

let isRecording = false;

// ── Query current tab status ──────────────────────────────
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'status' });
    if (res) {
      isRecording = res.recording;
      updateUI();
    }
  } catch {
    // Content script might not be injected yet
    updateUI();
  }
})();

// ── Button handlers ───────────────────────────────────────
btnRecord.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'start' });
    isRecording = true;
    updateUI();
  } catch {
    // Inject content script if needed
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tab.id, { action: 'start' });
    isRecording = true;
    updateUI();
  }
});

btnStop.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
  isRecording = false;
  updateUI();
});

btnAssertVisible.addEventListener('click', () => sendAction('addAssertion', { assertType: 'visible' }));
btnAssertText.addEventListener('click', async () => {
  const text = prompt('Expected text:');
  if (text) {
    await sendAction('addAssertion', { assertType: 'text', expected: text });
  }
});
btnScreenshot.addEventListener('click', () =>
  sendAction('addScreenshot', { label: 'User screenshot' })
);

async function sendAction(action, data = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { action, ...data });
}

// ── UI updates ────────────────────────────────────────────
function updateUI() {
  if (isRecording) {
    btnRecord.disabled = true;
    btnStop.disabled = false;
    statusEl.textContent = '● Recording';
    statusEl.className = 'status-recording';
    stepCountEl.style.display = 'block';
    actionBtns.forEach((b) => (b.disabled = false));
  } else {
    btnRecord.disabled = false;
    btnStop.disabled = true;
    statusEl.textContent = '○ Idle';
    statusEl.className = 'status-idle';
    stepCountEl.style.display = 'none';
    actionBtns.forEach((b) => (b.disabled = true));
  }
}

// Listen for step count updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'EVENT_RECORDED') {
    countEl.textContent = parseInt(countEl.textContent) + 1;
  }
});