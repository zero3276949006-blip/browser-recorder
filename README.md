# 🚀 Browser Recorder

**Record browser actions. Generate clean Playwright scripts. No flaky selectors.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-compatible-green)](https://playwright.dev/)

---

## What is this?

A two-part toolchain:

1. **Browser Extension** — records your clicks, inputs, and navigations with intelligent selectors
2. **CLI (`br`)** — converts recordings into production-ready Playwright test scripts

Unlike other recorders, Browser Recorder generates **resilient, readable code** — not fragile XPath chains. It prioritizes `data-testid`, `aria-label`, semantic roles, and text content over brittle DOM paths.

---

## Demo (30 seconds)

```
🎬 Record:  Ctrl+Shift+R → click around → Ctrl+Shift+R again
💾 Export:   recording-2026-06-10.json downloaded automatically
✏️ Generate: br generate recording-2026-06-10.json
✅ Result:   tests/github-login.spec.ts
```

**Input** (what you recorded):
```json
{
  "title": "GitHub Login Flow",
  "steps": [
    { "type": "click", "selector": "[name=\"commit\"]" },
    { "type": "input", "selector": "#login_field", "value": "user@example.com" },
    { "type": "assert", "selector": ".Header", "assertType": "visible" }
  ]
}
```

**Output** (generated test):
```typescript
import { test, expect } from '@playwright/test';

test('GitHub Login Flow', async ({ page }) => {
  await page.goto('https://github.com/login');
  await page.locator('#login_field').fill('user@example.com');
  await page.locator('#password').fill('password123');
  await page.locator('[name="commit"]').click();
  await expect(page.locator('.Header')).toBeVisible();
});
```

---

## Features

### 🧠 Smart Selector Engine (10-priority fallback chain)

| Priority | Strategy | Example |
|----------|----------|---------|
| 1 | `data-testid` / `data-test` / `data-cy` | `[data-testid="submit-btn"]` |
| 2 | Unique `id` | `#login_field` |
| 3 | `aria-label` / `aria-labelledby` | `[aria-label="Search"]` |
| 4 | `name` attribute (form elements) | `[name="commit"]` |
| 5 | ARIA role + accessible name | `role=button[name="Submit"]` |
| 6 | `placeholder` text | `[placeholder="Email"]` |
| 7 | Button/link text content | `button:has-text("Sign in")` |
| 8 | Label association | `label:has-text("Email") + input` |
| 9 | Unique class combination | `.nav .login-btn` |
| 10 | `nth-of-type` path (last resort) | `header > nav:nth-of-type(1)` |

Every selector is verified with `document.querySelectorAll()` to ensure **uniqueness at record time**.

### 🧩 Smart Script Generation

- **Variable extraction** — repeated values (emails, URLs) become named constants
- **Smart waits** — inserts `waitForTimeout` only when there's a real time gap
- **Deduplicated navigations** — consecutive navigations to the same URL are merged
- **Password safety** — password field values are never inlined in comments
- **Keyboard support** — `Tab`, `Enter`, `Escape`, arrow keys mapped to Playwright API

### 🏷️ Recording Features

- **SPA-aware** — patches `history.pushState` / `replaceState` for single-page apps
- **Element highlight** — blue overlay on hover shows what's being captured
- **Recording badge** — red pulsing indicator with step count
- **Inline assertions** — add visibility/text checks while recording
- **Screenshot steps** — insert `page.screenshot()` at any point
- **Keyboard shortcut** — `Ctrl+Shift+R` toggles recording (works inside any page)

---

## Installation

### 1. Browser Extension

```
Chrome / Edge / Brave / Arc / QQ Browser
1. Open chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension/ directory
```

### 2. CLI

```bash
git clone https://github.com/zero3276949006-blip/browser-recorder.git
cd browser-recorder
cd cli && npm install && npm run build
npm link  # Makes `br` globally available
```

Or without cloning:

```bash
npx browser-recorder generate recording.json
```

---

## Usage

### Record

1. Click the extension icon → **Start Recording** (or press `Ctrl+Shift+R`)
2. Interact with the page normally
3. Click **Stop & Export** (or press `Ctrl+Shift+R` again)
4. A JSON file downloads automatically

### Generate

```bash
# Generate a Playwright test
br generate recording.json

# Generate a standalone script (no test framework)
br generate recording.json --format script

# Custom output directory
br generate recording.json --output e2e/

# Disable variable extraction
br generate recording.json --no-parameterize

# Disable smart wait insertion
br generate recording.json --no-smart-wait
```

### Manage

```bash
# List all recordings
br list

# Show recording details
br info recording.json

# Setup Playwright in current project
br init
```

---

## Architecture

```
browser-recorder/
├── extension/              # Chrome Extension (Manifest V3)
│   ├── content.js           #   Injected recorder — event capture + selector engine
│   ├── popup.html/js/css    #   Extension popup UI
│   ├── background.js        #   Service worker — download + badge management
│   └── manifest.json        #   Extension manifest
├── cli/                     # CLI Tool (TypeScript)
│   └── src/
│       ├── index.ts          #   Commander CLI entry — generate, list, info, init
│       ├── generator.ts      #   Recording → Playwright code transformation
│       └── types.ts          #   TypeScript interfaces for recordings
├── examples/                # Sample recordings
│   └── github-login.json    #   Example: GitHub login flow
└── scripts/
    └── generate-icons.js     #   Generate extension icons
```

### Data Flow

```
User Actions → content.js (capture + build selectors)
     → background.js (collect, assemble Recording JSON)
     → Download as .json
     → CLI: index.ts (parse)
     → CLI: generator.ts (transform)
     → .spec.ts (Playwright test)
```

### Selector Decision Tree

```
Can we use data-testid?      → Yes → [data-testid="xxx"]          (Priority 1)
Can we use unique id?        → Yes → #id                           (Priority 2)
Can we use aria-label?       → Yes → [aria-label="xxx"]            (Priority 3)
Does it have a name attr?    → Yes → [name="xxx"]                  (Priority 4)
Does it have role + name?    → Yes → role=button[name="xxx"]       (Priority 5)
Is it a button/link w/ text? → Yes → button:has-text("xxx")        (Priority 7)
Has unique class combo?      → Yes → .parent .child                (Priority 9)
Fallback                     → CSS nth-of-type path                (Priority 10)
```

---

## Why This Exists

Existing record-and-replay tools generate:
- Fragile XPath chains (`/html/body/div[3]/div[1]/span[2]`)
- Unreadable code you'd never commit
- No awareness of testing best practices

Browser Recorder generates code **you'd write yourself** — with semantic selectors, assertion patterns, and variable extraction.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Recorder | Chrome Extension API (Manifest V3) |
| Selector Engine | Pure DOM traversal (no dependencies) |
| CLI | TypeScript + Commander |
| Output | Playwright Test / Playwright Library |
| Icons | PNG (generated via Canvas API) |

---

## Roadmap

- [ ] **Replay mode** — play recordings back in the browser for visual verification
- [ ] **Step editor** — modify, reorder, and delete steps before export
- [ ] **Puppeteer output** — alternative target for Playwright-less projects
- [ ] **CI integration** — `br generate --ci` outputs GitHub Actions / GitLab CI config
- [ ] **Shadow DOM support** — improved selector traversal for web components
- [ ] **Video recording** — capture screen during recording for documentation
- [ ] **Diff mode** — compare two recordings to detect UI changes

---

## Contributing

Contributions welcome! Areas that could use help:

- **Selector engine improvements** — edge cases, shadow DOM, iframe support
- **Test frameworks** — Cypress, WebdriverIO output formats
- **Recorder UI** — step editor, inline value editing
- **Documentation** — tutorials, video demos

```bash
# Development setup
git clone https://github.com/zero3276949006-blip/browser-recorder.git
cd browser-recorder

# Extension: load unpacked from extension/ in chrome://extensions

# CLI
cd cli
npm install
npm run dev  # Watch mode
```

---

## License

MIT © 2026
