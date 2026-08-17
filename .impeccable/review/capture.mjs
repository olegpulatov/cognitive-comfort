// Loads the built Chrome artifact and captures the popup and options surfaces.
// Usage: node .impeccable/review/capture.mjs
import { chromium } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionPath = fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url));
const outDir = fileURLToPath(new URL('.', import.meta.url));
await mkdir(outDir, { recursive: true });

const userDataDir = await mkdtemp(path.join(tmpdir(), 'cc-capture-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [
    '--headless=new',
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

const errors = [];
context.on('page', (page) => {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
});

let worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;

async function seed(settings) {
  await worker.evaluate(async (value) => {
    await chrome.storage.local.set({ comfortSettings: value });
  }, settings);
}

const base = {
  schemaVersion: 1,
  enabled: true,
  paused: false,
  blockEmojis: false,
  blurScope: 'content',
  revealMode: 'click',
  blurAmount: 40,
  siteOverrides: { 'example.com': 'disabled', 'news.ycombinator.com': 'enabled' },
  emojiSiteOverrides: { 'example.com': 'enabled' },
};

async function shot(name, url, size) {
  const page = await context.newPage();
  await page.setViewportSize(size);
  await page.goto(url);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  await page.close();
}

await seed(base);
await shot('popup-active', `chrome-extension://${extensionId}/popup.html`, { width: 372, height: 640 });

await seed({ ...base, paused: true });
await shot('popup-paused', `chrome-extension://${extensionId}/popup.html`, { width: 372, height: 640 });

await seed(base);
await shot('options-desktop', `chrome-extension://${extensionId}/options.html`, { width: 1280, height: 900 });
await shot('options-narrow', `chrome-extension://${extensionId}/options.html`, { width: 420, height: 900 });

await seed({ ...base, siteOverrides: {}, emojiSiteOverrides: {} });
await shot('options-empty', `chrome-extension://${extensionId}/options.html`, { width: 900, height: 900 });

await context.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console or page errors');
