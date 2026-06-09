# 馃幀 Browser Recorder

**Record browser actions. Generate clean Playwright scripts. No flaky selectors.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-compatible-green)](https://playwright.dev/)

---

## What is this?

A two-part toolchain:

1. **Browser Extension** 鈥?records your clicks, inputs, and navigations with intelligent selectors
2. **CLI (`br`)** 鈥?converts recordings into production-ready Playwright test scripts

Unlike other recorders, Browser Recorder generates **resilient, readable code** 鈥?not fragile XPath chains. It prioritizes `data-testid`, `aria-label`, semantic roles, and text content over brittle DOM paths.

---

## Demo (30 seconds)

```
馃幀 Record:  Ctrl+Shift+R 鈫?click around 鈫?Ctrl+Shift+R again
馃摜 Export:   recording-2026-06-10.json downloaded automatically
鈿?Generate: br generate recording-2026-06-10.json
鉁?Result:   tests/github-login.spec.ts
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

### 馃 Smart Selector Engine (10-priority fallback chain)

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

### 馃摝 Smart Script Generation

- **Variable extraction** 鈥?repeated values (emails, URLs) become named constants
- **Smart waits** 鈥?inserts `waitForTimeout` only when there's a real time gap
- **Deduplicated navigations** 鈥?consecutive navigations to the same URL are merged
- **Password safety** 鈥?password field values are never inlined in comments
- **Keyboard support** 鈥?`Tab`, `Enter`, `Escape`, arrow keys mapped to Playwright API

### 馃幆 Recording Features

- **SPA-aware** 鈥?patches `history.pushState` / `replaceState` for single-page apps
- **Element highlight** 鈥?blue overlay on hover shows what's being captured
- **Recording badge** 鈥?red pulsing indicator with step count
- **Inline assertions** 鈥?add visibility/text checks while recording
- **Screenshot steps** 鈥?insert `page.screenshot()` at any point
- **Keyboard shortcut** 鈥?`Ctrl+Shift+R` toggles recording (works inside any page)

---

## Installation

### 1. Browser Extension

```bash
# Chrome / Edge / Brave / Arc / QQ Browser
1. Open chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory
```

### 2. CLI

```bash
git clone https://github.com/lain/browser-recorder.git
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

1. Click the extension icon 鈫?**Start Recording** (or press `Ctrl+Shift+R`)
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
鈹溾攢鈹€ extension/              # Chrome Extension (Manifest V3)
鈹?  鈹溾攢鈹€ content.js           #   Injected recorder 鈥?event capture + selector engine
鈹?  鈹溾攢鈹€ popup.html/js/css    #   Extension popup UI
鈹?  鈹溾攢鈹€ background.js        #   Service worker 鈥?download + badge management
鈹?  鈹斺攢鈹€ manifest.json        #   Extension manifest
鈹?鈹溾攢鈹€ cli/                     # CLI Tool (TypeScript)
鈹?  鈹斺攢鈹€ src/
鈹?      鈹溾攢鈹€ index.ts          #   Commander CLI entry 鈥?generate, list, info, init
鈹?      鈹溾攢鈹€ generator.ts      #   Recording 鈫?Playwright code transformation
鈹?      鈹斺攢鈹€ types.ts          #   TypeScript interfaces for recordings
鈹?鈹溾攢鈹€ examples/                # Sample recordings
鈹?  鈹斺攢鈹€ github-login.json    #   Example: GitHub login flow
鈹?鈹斺攢鈹€ scripts/
    鈹斺攢鈹€ generate-icons.js     #   Generate extension icons
```

### Data Flow

```
User Actions 鈫?content.js (capture + build selectors)
     鈫?background.js (collect, assemble Recording JSON)
     鈫?Download as .json
     鈫?CLI: index.ts (parse)
     鈫?CLI: generator.ts (transform)
     鈫?.spec.ts (Playwright test)
```

### Selector Decision Tree

```
Can we use data-testid?      鈫?Yes 鈫?[data-testid="xxx"]          (Priority 1)
Can we use unique id?        鈫?Yes 鈫?#id                          (Priority 2)
Can we use aria-label?       鈫?Yes 鈫?[aria-label="xxx"]           (Priority 3)
Does it have a name attr?    鈫?Yes 鈫?[name="xxx"]                 (Priority 4)
Does it have role + name?    鈫?Yes 鈫?role=button[name="xxx"]      (Priority 5)
Is it a button/link w/ text? 鈫?Yes 鈫?button:has-text("xxx")       (Priority 7)
Has unique class combo?      鈫?Yes 鈫?.parent .child               (Priority 9)
Fallback                     鈫?CSS nth-of-type path                (Priority 10)
```

---

## Why This Exists

Existing record-and-replay tools generate:
- Fragile XPath chains (`/html/body/div[3]/div[1]/span[2]`)
- Unreadable code you'd never commit
- No awareness of testing best practices

Browser Recorder generates code **you'd write yourself** 鈥?with semantic selectors, assertion patterns, and variable extraction.

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

- [ ] **Replay mode** 鈥?play recordings back in the browser for visual verification
- [ ] **Step editor** 鈥?modify, reorder, and delete steps before export
- [ ] **Puppeteer output** 鈥?alternative target for Playwright-less projects
- [ ] **CI integration** 鈥?`br generate --ci` outputs GitHub Actions / GitLab CI config
- [ ] **Shadow DOM support** 鈥?improved selector traversal for web components
- [ ] **Video recording** 鈥?capture screen during recording for documentation
- [ ] **Diff mode** 鈥?compare two recordings to detect UI changes

---

## Contributing

Contributions welcome! Areas that could use help:

- **Selector engine improvements** 鈥?edge cases, shadow DOM, iframe support
- **Test frameworks** 鈥?Cypress, WebdriverIO output formats
- **Recorder UI** 鈥?step editor, inline value editing
- **Documentation** 鈥?tutorials, video demos

```bash
# Development setup
git clone https://github.com/lain/browser-recorder.git
cd browser-recorder

# Extension: load unpacked from extension/ in chrome://extensions

# CLI
cd cli
npm install
npm run dev  # Watch mode
```

---

## License

MIT 漏 2026
