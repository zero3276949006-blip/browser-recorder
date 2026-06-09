/**
 * Browser Recorder - Content Script
 * Injects into every page to capture user interactions.
 * Recording state persists across navigations via chrome.storage.session.
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let recording = false;
  let events = [];
  let startUrl = '';
  let lastEventTime = 0;
  let hoverTimeout = null;
  let domReady = false;

  // ── Selector Engine ────────────────────────────────────

  function buildSelector(el) {
    if (!el || el === document || el === document.body) return null;

    if (el.getAttribute('data-testid')) {
      return `[data-testid="${escapeAttr(el.getAttribute('data-testid'))}"]`;
    }
    if (el.getAttribute('data-test')) {
      return `[data-test="${escapeAttr(el.getAttribute('data-test'))}"]`;
    }
    if (el.getAttribute('data-cy')) {
      return `[data-cy="${escapeAttr(el.getAttribute('data-cy'))}"]`;
    }

    if (el.id && isUnique(`#${CSS.escape(el.id)}`)) {
      return `#${CSS.escape(el.id)}`;
    }

    if (el.getAttribute('aria-label')) {
      const sel = `[aria-label="${escapeAttr(el.getAttribute('aria-label'))}"]`;
      if (isUnique(sel)) return sel;
    }
    if (el.getAttribute('aria-labelledby')) {
      const labelEl = document.getElementById(el.getAttribute('aria-labelledby'));
      if (labelEl?.textContent?.trim()) {
        const sel = `[aria-labelledby="${escapeAttr(el.getAttribute('aria-labelledby'))}"]`;
        if (isUnique(sel)) return sel;
      }
    }

    if (el.name && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) {
      const sel = `[name="${escapeAttr(el.name)}"]`;
      if (isUnique(sel)) return sel;
    }

    const role = el.getAttribute('role') || implicitRole(el);
    const accName = getAccessibleName(el);
    if (role && accName) {
      return `role=${role}[name="${escapeAttr(accName.substring(0, 80))}"]`;
    }

    if (el.placeholder) {
      const sel = `[placeholder="${escapeAttr(el.placeholder)}"]`;
      if (isUnique(sel)) return sel;
    }

    if (['BUTTON', 'A', 'SUMMARY'].includes(el.tagName)) {
      const text = (el.textContent || '').trim().substring(0, 60);
      if (text && isUnique(`${el.tagName.toLowerCase()}:has-text("${escapeAttr(text)}")`)) {
        return `${el.tagName.toLowerCase()}:has-text("${escapeAttr(text)}")`;
      }
    }
    if (el.getAttribute('role') === 'button') {
      const text = (el.textContent || '').trim().substring(0, 60);
      if (text) return `button:has-text("${escapeAttr(text)}")`;
    }

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent?.trim()) {
        return `label:has-text("${escapeAttr(label.textContent.trim().substring(0, 60))}") + input`;
      }
    }

    const classes = Array.from(el.classList).filter(
      (c) => c && !c.match(/^[a-z]{1,3}-[a-f0-9]{5,}/) && !c.match(/^\d/)
    );
    for (let i = Math.min(classes.length, 3); i >= 1; i--) {
      const sel = classes.slice(0, i).map((c) => `.${CSS.escape(c)}`).join('');
      if (isUnique(sel)) return sel;
    }

    return buildNthPath(el);
  }

  function isUnique(selector) {
    try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
  }

  function escapeAttr(val) {
    return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function implicitRole(el) {
    if (el.getAttribute('type') === 'checkbox') return 'checkbox';
    if (el.getAttribute('type') === 'radio') return 'radio';
    const map = {
      BUTTON:'button', A:'link', INPUT:'textbox', TEXTAREA:'textbox', SELECT:'combobox',
      IMG:'img', NAV:'navigation', MAIN:'main', HEADER:'banner', FOOTER:'contentinfo',
      ASIDE:'complementary', TABLE:'table', FORM:'form',
      H1:'heading',H2:'heading',H3:'heading',H4:'heading',H5:'heading',H6:'heading',
      LI:'listitem', UL:'list', OL:'list', DL:'list',
    };
    return map[el.tagName] || null;
  }

  function getAccessibleName(el) {
    return el.getAttribute('aria-label') || el.getAttribute('alt') ||
           el.getAttribute('title') || (el.textContent || '').trim().substring(0, 80) || null;
  }

  function buildNthPath(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.body && current !== document) {
      const parent = current.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter((s) => s.tagName === current.tagName);
      const idx = siblings.indexOf(current) + 1;
      if (current.id) { parts.unshift(`#${CSS.escape(current.id)}`); break; }
      parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${idx})`);
      current = parent;
      if (current.closest && current.id) { parts.unshift(`#${CSS.escape(current.id)}`); break; }
    }
    return parts.join(' > ');
  }

  function getElementInfo(el) {
    return {
      tagName: el.tagName,
      selector: buildSelector(el),
      text: (el.textContent || '').trim().substring(0, 100),
      inputType: el.type || null,
      href: el.href || null,
      role: el.getAttribute('role') || implicitRole(el),
    };
  }

  // ── Event Handlers ──────────────────────────────────────

  function record(ev) {
    if (!recording) return;
    ev.timestamp = Date.now() - lastEventTime;
    lastEventTime = Date.now();
    ev.url = location.href;
    events.push(ev);
    chrome.runtime.sendMessage({ type: 'EVENT_RECORDED', event: ev });
  }

  function onClick(e) {
    const el = e.target;
    if (!el || el.closest('#br-overlay')) return;
    const info = getElementInfo(el);
    record({ type: 'click', selector: info.selector, tagName: info.tagName, text: info.text });
  }

  function onDblClick(e) {
    const el = e.target;
    if (!el || el.closest('#br-overlay')) return;
    record({ type: 'dblclick', selector: getElementInfo(el).selector, tagName: el.tagName });
  }

  function onInput(e) {
    const el = e.target;
    if (!el || el.closest('#br-overlay')) return;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    const info = getElementInfo(el);
    record({ type: el.tagName === 'SELECT' ? 'select' : 'input', selector: info.selector,
      value: el.value, inputType: info.inputType, tagName: info.tagName });
  }

  function onChange(e) {
    const el = e.target;
    if (!el || el.closest('#br-overlay')) return;
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      record({ type: 'check', selector: buildSelector(el), checked: el.checked, tagName: el.tagName });
    }
    if (el.tagName === 'INPUT' && el.type === 'file') {
      record({ type: 'upload', selector: buildSelector(el), files: Array.from(el.files || []).map(f => f.name) });
    }
  }

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      toggleRecording();
      return;
    }
    if (!recording) return;
    if (['Tab', 'Enter', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      record({ type: 'keydown', key: e.key, selector: buildSelector(e.target) });
    }
  }

  function onHover(e) {
    if (!recording) return;
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      const el = e.target;
      if (!el || el.closest('#br-overlay')) return;
      const isMenuTrigger = el.getAttribute('aria-haspopup') || el.getAttribute('aria-expanded') || el.closest('[data-hover]');
      if (!isMenuTrigger) return;
      record({ type: 'hover', selector: buildSelector(el), tagName: el.tagName });
    }, 300);
  }

  // ── Navigation Detection ────────────────────────────────

  window.addEventListener('beforeunload', () => {
    if (!recording) return;
    // Sync entire events buffer to storage (synchronous fallback via background)
    try { chrome.runtime.sendMessage({ type: 'EVENTS_SYNC', events }); } catch (_) {}
    // Also write directly to storage as a reliable backup
    try {
      chrome.storage.session.set({
        br_events: events,
        br_updatedAt: Date.now()
      });
    } catch (_) {}
  });

  function patchHistory() {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      origPush.apply(this, args);
      if (recording && location.href !== startUrl) onNavigate();
    };
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      if (recording && location.href !== startUrl) onNavigate();
    };
  }

  function onNavigate() {
    startUrl = location.href;
    record({ type: 'navigation', url: location.href, title: document.title });
  }

  // ── Recording Control ───────────────────────────────────

  function toggleRecording() {
    if (recording) stopRecording(); else startRecording();
  }

  function startRecording() {
    events = [];
    startUrl = location.href;
    lastEventTime = Date.now();
    recording = true;
    // Persist recording state to session storage
    chrome.storage.session.set({
      br_recording: true,
      br_tabId: getTabId(),
      br_events: events,
      br_startUrl: startUrl
    });
    record({ type: 'navigation', url: startUrl, title: document.title });
    showIndicator();
    chrome.runtime.sendMessage({ type: 'RECORDING_STARTED', url: startUrl });
  }

  function stopRecording() {
    recording = false;
    hideIndicator();
    // Load events from storage (includes events from previous pages)
    chrome.storage.session.get(['br_events', 'br_startUrl'], (data) => {
      const allEvents = data.br_events || events;
      const fullStartUrl = data.br_startUrl || startUrl;
      const recordingData = {
        title: document.title || 'Untitled Recording',
        startUrl: fullStartUrl,
        recordedAt: new Date().toISOString(),
        steps: allEvents,
      };
      chrome.runtime.sendMessage({ type: 'RECORDING_STOPPED', recording: recordingData });
      // Clean up storage
      chrome.storage.session.remove(['br_recording', 'br_tabId', 'br_events', 'br_startUrl', 'br_updatedAt']);
    });
    events = [];
  }

  // ── Visual Indicator ────────────────────────────────────

  function showIndicator() {
    if (document.getElementById('br-overlay')) return;
    if (!domReady || !document.body) {
      // DOM not ready yet, retry on DOMContentLoaded
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'br-overlay';
    overlay.innerHTML = `
      <style>
        #br-overlay{position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;pointer-events:none;height:0}
        #br-overlay .br-badge{background:#e74c3c;color:#fff;font:12px/1.4 system-ui,sans-serif;padding:4px 14px;border-radius:0 0 8px 8px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,.25);animation:br-pulse 1.5s ease-in-out infinite}
        #br-overlay .br-dot{width:8px;height:8px;border-radius:50%;background:#fff;animation:br-blink 1s step-end infinite}
        @keyframes br-pulse{0%,100%{opacity:1}50%{opacity:.85}}
        @keyframes br-blink{0%,100%{opacity:1}50%{opacity:.2}}
        #br-highlight{position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #3498db;border-radius:3px;background:rgba(52,152,219,.08);transition:all .15s ease}
      </style>
      <div class="br-badge"><span class="br-dot"></span> Recording — Ctrl+Shift+R to stop</div>
    `;
    document.body.appendChild(overlay);

    const highlight = document.createElement('div');
    highlight.id = 'br-highlight';
    document.body.appendChild(highlight);
    document.addEventListener('mousemove', highlightElement, true);
  }

  function hideIndicator() {
    const overlay = document.getElementById('br-overlay');
    const highlight = document.getElementById('br-highlight');
    if (overlay) overlay.remove();
    if (highlight) highlight.remove();
    document.removeEventListener('mousemove', highlightElement, true);
  }

  function highlightElement(e) {
    if (!recording) return;
    const el = e.target;
    if (!el || el.closest('#br-overlay') || el === document.body) {
      const h = document.getElementById('br-highlight'); if (h) h.style.display = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    const h = document.getElementById('br-highlight');
    if (!h) return;
    h.style.display = 'block';
    h.style.top = rect.top + 'px';
    h.style.left = rect.left + 'px';
    h.style.width = rect.width + 'px';
    h.style.height = rect.height + 'px';
  }

  // ── Cross-Page Recording Resume ─────────────────────────

  /**
   * On content script init, check chrome.storage.session for active recording.
   * This survives both page navigations AND Service Worker restarts.
   */
  function initRecordingState() {
    chrome.storage.session.get(['br_recording', 'br_events', 'br_startUrl'], (data) => {
      if (!data.br_recording) return;

      recording = true;
      events = data.br_events || [];
      startUrl = data.br_startUrl || location.href;
      lastEventTime = Date.now();

      // Record navigation to the new page
      record({ type: 'navigation', url: location.href, title: document.title });

      // Show the overlay (wait for DOM if needed)
      showIndicator();
    });
  }

  function getTabId() {
    // content scripts can't access chrome.tabs, but we store what we can
    return null;
  }

  // ── Message Handling ────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case 'start': startRecording(); sendResponse({ status: 'recording' }); break;
      case 'stop': stopRecording(); sendResponse({ status: 'stopped' }); break;
      case 'status': sendResponse({ recording, eventCount: events.length }); break;
      case 'addAssertion':
        record({ type: 'assert', selector: buildSelector(document.activeElement) || msg.selector,
          assertType: msg.assertType || 'visible', expected: msg.expected || null });
        sendResponse({ status: 'assertion_added' }); break;
      case 'addScreenshot':
        record({ type: 'screenshot', label: msg.label || '' });
        sendResponse({ status: 'screenshot_added' }); break;
    }
  });

  // ── Initialize ──────────────────────────────────────────

  document.addEventListener('click', onClick, true);
  document.addEventListener('dblclick', onDblClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mouseover', onHover, true);
  patchHistory();

  // Wait for DOM, then check if recording should resume
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      domReady = true;
      initRecordingState();
    });
  } else {
    domReady = true;
    initRecordingState();
  }

  console.log('[Browser Recorder] Ready. Ctrl+Shift+R to toggle recording.');
})();
