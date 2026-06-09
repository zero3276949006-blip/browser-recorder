/**
 * Browser Recorder - Content Script
 * Injects into every page to capture user interactions.
 * Uses Manifest V3 isolated world.
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let recording = false;
  let events = [];
  let startUrl = '';
  let lastEventTime = 0;
  let hoverTimeout = null;

  // ── Selector Engine ────────────────────────────────────

  /** Build the most resilient, readable selector for an element */
  function buildSelector(el) {
    if (!el || el === document || el === document.body) return null;

    // Priority 1: Explicit test attributes
    if (el.getAttribute('data-testid')) {
      return `[data-testid="${escapeAttr(el.getAttribute('data-testid'))}"]`;
    }
    if (el.getAttribute('data-test')) {
      return `[data-test="${escapeAttr(el.getAttribute('data-test'))}"]`;
    }
    if (el.getAttribute('data-cy')) {
      return `[data-cy="${escapeAttr(el.getAttribute('data-cy'))}"]`;
    }

    // Priority 2: Unique ID
    if (el.id && isUnique(`#${CSS.escape(el.id)}`)) {
      return `#${CSS.escape(el.id)}`;
    }

    // Priority 3: Accessibility attributes
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

    // Priority 4: Name attribute on form elements
    if (el.name && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) {
      const sel = `[name="${escapeAttr(el.name)}"]`;
      if (isUnique(sel)) return sel;
    }

    // Priority 5: Role + accessible name
    const role = el.getAttribute('role') || implicitRole(el);
    const accName = getAccessibleName(el);
    if (role && accName) {
      const sel = `role=${role}[name="${escapeAttr(accName.substring(0, 80))}"]`;
      return sel;
    }

    // Priority 6: Placeholder text
    if (el.placeholder) {
      const sel = `[placeholder="${escapeAttr(el.placeholder)}"]`;
      if (isUnique(sel)) return sel;
    }

    // Priority 7: Button/Link text
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

    // Priority 8: Label association
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent?.trim()) {
        return `label:has-text("${escapeAttr(label.textContent.trim().substring(0, 60))}") + input`;
      }
    }

    // Priority 9: Unique class combination
    const classes = Array.from(el.classList).filter(
      (c) => c && !c.match(/^[a-z]{1,3}-[a-f0-9]{5,}/) && !c.match(/^\d/)
    );
    for (let i = Math.min(classes.length, 3); i >= 1; i--) {
      const sel = classes.slice(0, i).map((c) => `.${CSS.escape(c)}`).join('');
      if (isUnique(sel)) return sel;
    }

    // Priority 10: nth-of-type (last resort, but still readable)
    return buildNthPath(el);
  }

  function isUnique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function escapeAttr(val) {
    return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function implicitRole(el) {
    const map = {
      BUTTON: 'button', A: 'link', INPUT: 'textbox',
      TEXTAREA: 'textbox', SELECT: 'combobox', IMG: 'img',
      NAV: 'navigation', MAIN: 'main', HEADER: 'banner',
      FOOTER: 'contentinfo', ASIDE: 'complementary',
      TABLE: 'table', FORM: 'form', H1: 'heading',
      H2: 'heading', H3: 'heading', H4: 'heading',
      H5: 'heading', H6: 'heading', LI: 'listitem',
      UL: 'list', OL: 'list', DL: 'list',
    };
    if (el.getAttribute('type') === 'checkbox') return 'checkbox';
    if (el.getAttribute('type') === 'radio') return 'radio';
    return map[el.tagName] || null;
  }

  function getAccessibleName(el) {
    return (
      el.getAttribute('aria-label') ||
      el.getAttribute('alt') ||
      el.getAttribute('title') ||
      (el.textContent || '').trim().substring(0, 80) ||
      null
    );
  }

  function buildNthPath(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.body && current !== document) {
      const parent = current.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === current.tagName
      );
      const idx = siblings.indexOf(current) + 1;
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      parts.unshift(`${tag}:nth-of-type(${idx})`);
      current = parent;

      // Stop early if ancestor is uniquely identifiable
      if (current.closest && current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
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

  function record(event) {
    if (!recording) return;
    event.timestamp = Date.now() - lastEventTime;
    lastEventTime = Date.now();
    event.url = location.href;
    events.push(event);
    chrome.runtime.sendMessage({ type: 'EVENT_RECORDED', event });
  }

  function onClick(e) {
    const el = e.target;
    if (!el || el.closest('#br-overlay')) return;
    const info = getElementInfo(el);
    record({
      type: 'click',
      selector: info.selector,
      tagName: info.tagName,
      text: info.text,
    });
  }

  function onDblClick(e) {
    const el = e.target;
    if (!el || el.closest('#br-overlay')) return;
    const info = getElementInfo(el);
    record({
      type: 'dblclick',
      selector: info.selector,
      tagName: info.tagName,
    });
  }

  function onInput(e) {
    const el = e.target;
    if (!el || el.closest('#br-overlay')) return;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    const info = getElementInfo(el);
    record({
      type: el.tagName === 'SELECT' ? 'select' : 'input',
      selector: info.selector,
      value: el.value,
      inputType: info.inputType,
      tagName: info.tagName,
    });
  }

  function onChange(e) {
    const el = e.target;
    if (!el || el.closest('#br-overlay')) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      record({
        type: 'check',
        selector: buildSelector(el),
        checked: el.checked,
        tagName: el.tagName,
      });
    }
    if (el.tagName === 'INPUT' && el.type === 'radio') {
      record({
        type: 'check',
        selector: buildSelector(el),
        checked: true,
        tagName: el.tagName,
      });
    }
    if (el.tagName === 'INPUT' && el.type === 'file') {
      record({
        type: 'upload',
        selector: buildSelector(el),
        files: Array.from(el.files || []).map((f) => f.name),
      });
    }
  }

  function onKeyDown(e) {
    // Ctrl+Shift+R / Cmd+Shift+R to toggle recording
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      toggleRecording();
      return;
    }
    if (!recording) return;
    if (['Tab', 'Enter', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      record({
        type: 'keydown',
        key: e.key,
        selector: buildSelector(e.target),
      });
    }
  }

  function onHover(e) {
    if (!recording) return;
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      const el = e.target;
      if (!el || el.closest('#br-overlay')) return;
      const sel = buildSelector(el);
      // Only record hover if it reveals something (dropdown, tooltip)
      const isMenuTrigger =
        el.getAttribute('aria-haspopup') ||
        el.getAttribute('aria-expanded') ||
        el.closest('[data-hover]');
      if (!isMenuTrigger) return;
      record({ type: 'hover', selector: sel, tagName: el.tagName });
    }, 300);
  }

  // ── Navigation Detection ────────────────────────────────

  function onPageShow() {
    if (!recording) return;
    // Check if URL actually changed
    if (location.href !== startUrl) {
      startUrl = location.href;
      record({ type: 'navigation', url: location.href, title: document.title });
    }
  }

  // Patch pushState/replaceState for SPA navigation
  function patchHistory() {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      origPush.apply(this, args);
      if (recording && location.href !== startUrl) {
        startUrl = location.href;
        record({ type: 'navigation', url: location.href, title: document.title });
      }
    };
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      if (recording && location.href !== startUrl) {
        startUrl = location.href;
        record({ type: 'navigation', url: location.href, title: document.title });
      }
    };
  }

  // ── Recording Control ───────────────────────────────────

  function toggleRecording() {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function startRecording() {
    events = [];
    startUrl = location.href;
    lastEventTime = Date.now();
    recording = true;
    record({ type: 'navigation', url: startUrl, title: document.title });
    showIndicator();
    chrome.runtime.sendMessage({ type: 'RECORDING_STARTED', url: startUrl });
  }

  function stopRecording() {
    recording = false;
    hideIndicator();
    const recordingData = {
      title: document.title || 'Untitled Recording',
      startUrl,
      recordedAt: new Date().toISOString(),
      steps: events,
    };
    chrome.runtime.sendMessage(
      { type: 'RECORDING_STOPPED', recording: recordingData }
    );
    events = [];
  }

  // ── Visual Indicator ────────────────────────────────────

  function showIndicator() {
    if (document.getElementById('br-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'br-overlay';
    overlay.innerHTML = `
      <style>
        #br-overlay {
          position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none; height: 0;
        }
        #br-overlay .br-badge {
          background: #e74c3c; color: #fff; font: 12px/1.4 system-ui, sans-serif;
          padding: 4px 14px; border-radius: 0 0 8px 8px;
          display: flex; align-items: center; gap: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,.25);
          animation: br-pulse 1.5s ease-in-out infinite;
        }
        #br-overlay .br-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #fff; animation: br-blink 1s step-end infinite;
        }
        @keyframes br-pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.85; }
        }
        @keyframes br-blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0.2; }
        }
        #br-highlight {
          position: fixed; pointer-events: none; z-index: 2147483646;
          border: 2px solid #3498db; border-radius: 3px;
          background: rgba(52,152,219,.08); transition: all .15s ease;
        }
      </style>
      <div class="br-badge">
        <span class="br-dot"></span> Recording — Ctrl+Shift+R to stop
      </div>
    `;
    document.body.appendChild(overlay);

    // Element highlight on hover (only during recording)
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
      const h = document.getElementById('br-highlight');
      if (h) h.style.display = 'none';
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

  // ── Message Handling ────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case 'start':
        startRecording();
        sendResponse({ status: 'recording' });
        break;
      case 'stop':
        stopRecording();
        sendResponse({ status: 'stopped' });
        break;
      case 'status':
        sendResponse({ recording, eventCount: events.length });
        break;
      case 'addAssertion':
        record({
          type: 'assert',
          selector: buildSelector(document.activeElement) || msg.selector,
          assertType: msg.assertType || 'visible',
          expected: msg.expected || null,
        });
        sendResponse({ status: 'assertion_added' });
        break;
      case 'addScreenshot':
        record({ type: 'screenshot', label: msg.label || '' });
        sendResponse({ status: 'screenshot_added' });
        break;
    }
  });

  // ── Initialize ──────────────────────────────────────────

  document.addEventListener('click', onClick, true);
  document.addEventListener('dblclick', onDblClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mouseover', onHover, true);
  window.addEventListener('pageshow', onPageShow);
  patchHistory();

  console.log('[Browser Recorder] Ready. Ctrl+Shift+R to toggle recording.');
})();
