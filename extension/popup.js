/**
 * Browser Recorder - Popup Script
 * Tabs: Record / Playback / Scripts
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
let activeTabId = null;

// ── Tab Navigation ──────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'scripts') renderScriptList();
  });
});

// ── Query current tab status ────────────────────────────
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  activeTabId = tab.id;

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'status' });
    if (res) {
      isRecording = res.recording;
      if (res.eventCount) countEl.textContent = res.eventCount;
      updateUI();
    }
  } catch { updateUI(); }
})();

// ── Record handlers ─────────────────────────────────────
btnRecord.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'start' });
    isRecording = true;
    updateUI();
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
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
  const text = prompt('期望文本：');
  if (text) await sendAction('addAssertion', { assertType: 'text', expected: text });
});
btnScreenshot.addEventListener('click', () => sendAction('addScreenshot', { label: '用户截图' }));

async function sendAction(action, data = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { action, ...data });
}

function updateUI() {
  if (isRecording) {
    btnRecord.disabled = true;
    btnStop.disabled = false;
    statusEl.textContent = '● 录制中';
    statusEl.className = 'status-recording';
    stepCountEl.style.display = 'block';
    actionBtns.forEach(b => b.disabled = false);
  } else {
    btnRecord.disabled = false;
    btnStop.disabled = true;
    statusEl.textContent = '○ 空闲';
    statusEl.className = 'status-idle';
    stepCountEl.style.display = 'none';
    actionBtns.forEach(b => b.disabled = true);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'EVENT_RECORDED') {
    countEl.textContent = parseInt(countEl.textContent) + 1;
  }
});

// ═══════════════════════════════════════════════════════
// Playback
// ═══════════════════════════════════════════════════════

const fileInput = document.getElementById('file-input');
const btnLoadRecording = document.getElementById('btn-load-recording');
const playbackInfo = document.getElementById('playback-info');
const btnPlay = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const btnStep = document.getElementById('btn-step');
const btnResetPlayback = document.getElementById('btn-reset-playback');
const playbackTitle = document.getElementById('playback-title');
const playbackSteps = document.getElementById('playback-steps');
const playbackSpeed = document.getElementById('playback-speed');
const playbackProgress = document.getElementById('playback-progress');
const progressFill = playbackProgress.querySelector('.progress-fill');
const playbackCurrent = document.getElementById('playback-current');
const currentStepDesc = document.getElementById('current-step-desc');
const stepList = document.getElementById('step-list');

let playbackRecording = null;
let playbackIndex = -1;
let playbackRunning = false;
let playbackPaused = false;
let playbackTimer = null;

btnLoadRecording.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    playbackRecording = JSON.parse(text);
    loadPlaybackRecording(playbackRecording);
  } catch (err) {
    alert('无法解析录制文件：' + err.message);
  }
});

function loadPlaybackRecording(rec) {
  playbackRecording = rec;
  playbackIndex = -1;
  playbackRunning = false;
  playbackPaused = false;
  clearTimeout(playbackTimer);

  playbackTitle.textContent = rec.title || '未命名录制';
  playbackSteps.textContent = `${rec.steps.length} 步`;
  playbackInfo.style.display = 'block';
  playbackCurrent.style.display = 'none';
  playbackProgress.style.display = 'block';
  progressFill.style.width = '0%';
  btnPlay.disabled = false;
  btnPause.disabled = true;

  renderStepList(rec.steps);
}

function renderStepList(steps) {
  stepList.innerHTML = steps.map((s, i) => {
    const icon = stepIcon(s);
    const desc = stepDesc(s);
    return `<li data-index="${i}">
      <span class="step-num">${i + 1}</span>
      <span class="step-icon">${icon}</span>
      <span class="step-desc" title="${escapeHtml(desc)}">${escapeHtml(desc)}</span>
    </li>`;
  }).join('');
}

function stepIcon(s) {
  const map = {
    click: '👆', dblclick: '👆👆', input: '⌨', select: '📋',
    navigation: '🌐', keydown: '⌨', assert: '✅',
    screenshot: '📸', hover: '🖱', check: '☑', upload: '📤'
  };
  return map[s.type] || '•';
}

function stepDesc(s) {
  switch (s.type) {
    case 'click': return `点击 ${s.selector || s.text || '元素'}`;
    case 'dblclick': return `双击 ${s.selector || '元素'}`;
    case 'input': return `输入 "${s.value || ''}" → ${s.selector || ''}`;
    case 'select': return `选择 ${s.value || ''} → ${s.selector || ''}`;
    case 'navigation': return `导航到 ${s.url || s.title || ''}`;
    case 'keydown': return `按键 ${s.key}`;
    case 'assert': return `断言 ${s.assertType}: ${s.selector || s.expected || ''}`;
    case 'screenshot': return `截图 ${s.label || ''}`;
    case 'hover': return `悬停 ${s.selector || ''}`;
    case 'check': return `${s.checked ? '勾选' : '取消勾选'} ${s.selector || ''}`;
    case 'upload': return `上传 ${(s.files || []).join(', ') || ''}`;
    default: return `${s.type} ${s.selector || ''}`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function highlightStep(index) {
  stepList.querySelectorAll('li').forEach(li => {
    const i = parseInt(li.dataset.index);
    li.classList.remove('active', 'done');
    if (i === index) li.classList.add('active');
    else if (i < index) li.classList.add('done');
  });
  // Scroll to active step
  const active = stepList.querySelector('li.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateProgress() {
  const pct = playbackRecording ? ((playbackIndex + 1) / playbackRecording.steps.length * 100) : 0;
  progressFill.style.width = pct + '%';
}

async function executeStep(index) {
  if (!playbackRecording || index >= playbackRecording.steps.length) return false;
  const step = playbackRecording.steps[index];

  playbackCurrent.style.display = 'block';
  currentStepDesc.textContent = `[${index + 1}/${playbackRecording.steps.length}] ${stepDesc(step)}`;
  highlightStep(index);
  updateProgress();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'playback:execute', step, index });
  } catch {
    // Inject content script if needed
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { action: 'playback:execute', step, index });
  }
  return true;
}

async function runPlayback() {
  if (!playbackRunning || playbackPaused) return;
  if (playbackIndex >= playbackRecording.steps.length - 1) {
    stopPlayback();
    return;
  }

  playbackIndex++;
  await executeStep(playbackIndex);

  if (!playbackRunning || playbackPaused) return;

  const delay = playbackRecording.steps[playbackIndex].timestamp || 500;
  const speed = parseFloat(playbackSpeed.value);
  const wait = Math.max(200, Math.min(delay / speed, 5000));
  playbackTimer = setTimeout(runPlayback, wait);
}

function stopPlayback() {
  playbackRunning = false;
  playbackPaused = false;
  clearTimeout(playbackTimer);
  btnPlay.disabled = false;
  btnPause.disabled = true;
  playbackCurrent.style.display = 'none';
}

btnPlay.addEventListener('click', () => {
  if (playbackPaused) {
    playbackPaused = false;
    btnPlay.textContent = '⏸ 暂停';
    btnPause.disabled = true;
    runPlayback();
  } else {
    if (playbackIndex >= playbackRecording.steps.length - 1) {
      // Restart
      playbackIndex = -1;
      progressFill.style.width = '0%';
      highlightStep(-1);
      stepList.querySelectorAll('li').forEach(li => li.classList.remove('done'));
    }
    playbackRunning = true;
    playbackPaused = false;
    btnPlay.textContent = '⏸ 暂停';
    btnPause.disabled = false;
    runPlayback();
  }
});

btnPause.addEventListener('click', () => {
  playbackPaused = true;
  clearTimeout(playbackTimer);
  btnPlay.textContent = '▶ 继续';
  btnPlay.disabled = false;
  btnPause.disabled = true;
});

btnStep.addEventListener('click', async () => {
  if (!playbackRecording) return;
  if (playbackIndex >= playbackRecording.steps.length - 1) {
    playbackIndex = -1;
    highlightStep(-1);
    stepList.querySelectorAll('li').forEach(li => li.classList.remove('done'));
    progressFill.style.width = '0%';
  }
  playbackIndex++;
  await executeStep(playbackIndex);
});

btnResetPlayback.addEventListener('click', () => {
  stopPlayback();
  playbackIndex = -1;
  progressFill.style.width = '0%';
  highlightStep(-1);
  stepList.querySelectorAll('li').forEach(li => li.classList.remove('done'));
  btnPlay.textContent = '▶ 播放';
  playbackCurrent.style.display = 'none';
});



// ═══════════════════════════════════════════════════════
// Scripts Management
// ═══════════════════════════════════════════════════════

const scriptFileInput = document.getElementById('script-file-input');
const btnImportScript = document.getElementById('btn-import-script');
const scriptListEl = document.getElementById('script-list');
const scriptsCount = document.getElementById('scripts-count');

btnImportScript.addEventListener('click', () => scriptFileInput.click());

scriptFileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  for (const file of files) {
    try {
      const text = await file.text();
      const rec = JSON.parse(text);
      rec._importedAt = Date.now();
      await saveScript(rec);
    } catch (err) {
      console.error('导入失败：', file.name, err);
    }
  }
  renderScriptList();
  scriptFileInput.value = '';
});

function getStoredScripts() {
  return new Promise(resolve => {
    chrome.storage.local.get(['br_scripts'], data => {
      resolve(data.br_scripts || []);
    });
  });
}

async function saveScript(rec) {
  const scripts = await getStoredScripts();
  // Avoid duplicates by title+steps count
  const exists = scripts.find(s =>
    s.title === rec.title && s.steps?.length === rec.steps?.length
  );
  if (exists) {
    Object.assign(exists, rec);
  } else {
    scripts.unshift(rec);
  }
  await chrome.storage.local.set({ br_scripts: scripts });
}

async function deleteScript(index) {
  const scripts = await getStoredScripts();
  scripts.splice(index, 1);
  await chrome.storage.local.set({ br_scripts: scripts });
  renderScriptList();
}

async function loadScriptForPlayback(index) {
  const scripts = await getStoredScripts();
  const rec = scripts[index];
  if (!rec) return;
  // Switch to playback tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="playback"]').classList.add('active');
  document.getElementById('tab-playback').classList.add('active');
  loadPlaybackRecording(rec);
}

async function renderScriptList() {
  const scripts = await getStoredScripts();
  scriptsCount.textContent = `共 ${scripts.length} 个脚本`;

  if (scripts.length === 0) {
    scriptListEl.innerHTML = '<div class="empty-state">暂无脚本<br>录制后会自动保存，或点击「导入」加载文件</div>';
    return;
  }

  scriptListEl.innerHTML = scripts.map((s, i) => {
    const date = s.recordedAt ? new Date(s.recordedAt).toLocaleString('zh-CN') : '';
    const steps = s.steps?.length || 0;
    return `<div class="script-item">
      <div class="script-name">${escapeHtml(s.title || '未命名')}</div>
      <div class="script-meta">${steps}步 · ${date}</div>
      <div class="script-actions">
        <button class="btn-icon" data-action="load" data-index="${i}" title="加载到回放">▶</button>
        <button class="btn-icon" data-action="delete" data-index="${i}" title="删除">🗑</button>
      </div>
    </div>`;
  }).join('');

  // Delegate click events
  scriptListEl.querySelectorAll('[data-action="load"]').forEach(btn => {
    btn.addEventListener('click', () => loadScriptForPlayback(parseInt(btn.dataset.index)));
  });
  scriptListEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('确定删除这个脚本？')) deleteScript(parseInt(btn.dataset.index));
    });
  });
}

// Auto-save recordings when they stop
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RECORDING_STOPPED' && msg.recording) {
    saveScript(msg.recording);
  }
});
