#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const root = process.cwd();
const extensionPath = path.join(root, '.output', 'chrome-mv3');
const demoDir = path.join(root, 'brand', 'store', 'demo');
const demoUrl = 'https://example.com/';
const outputDir = parseOutputDir(process.argv.slice(2));
const settleMs = 250;

function parseOutputDir(args) {
  if (args.length === 0) return path.join(root, 'brand', 'store', 'captures');
  if (args.length === 2 && args[0] === '--out' && args[1]) return path.resolve(root, args[1]);
  throw new Error('Usage: node scripts/capture-shots.mjs [--out <dir>]');
}

function run(command, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...environment },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}`));
    });
  });
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

async function routeDemo(route) {
  const url = new URL(route.request().url());
  const relativePath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(demoDir, relativePath);
  if (filePath !== demoDir && !filePath.startsWith(`${demoDir}${path.sep}`)) {
    await route.fulfill({ status: 404, body: 'Not found' });
    return;
  }
  try {
    await route.fulfill({
      status: 200,
      contentType: contentType(filePath),
      body: await readFile(filePath),
    });
  } catch {
    await route.fulfill({ status: 404, body: 'Not found' });
  }
}

async function readyForShot(page) {
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(settleMs);
}

async function capture(page, name, description, files, options = {}) {
  await readyForShot(page);
  const filePath = path.join(outputDir, name);
  await page.screenshot({ path: filePath, ...options });
  const size = await page.evaluate(() => ({
    width: Math.ceil(document.documentElement.scrollWidth),
    height: Math.ceil(document.documentElement.scrollHeight),
  }));
  const dimensions = options.fullPage
    ? size
    : { width: page.viewportSize().width, height: page.viewportSize().height };
  files.push({ name, ...dimensions, description });
  console.log(filePath);
}

async function setSettings(extensionPage, settings) {
  await extensionPage.evaluate(async (value) => {
    const api = globalThis.chrome?.storage?.local ?? globalThis.browser?.storage?.local;
    if (!api) throw new Error('No storage API found on extension page');
    await api.set({ comfortSettings: value });
  }, settings);
}

let context;
let userDataDir;

try {
  await run('pnpm', ['build:chrome'], { BUILD_PROFILE: 'public' });
  await mkdir(outputDir, { recursive: true });
  userDataDir = await mkdtemp(path.join(tmpdir(), 'cognitive-comfort-captures-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'chromium',
    headless: true,
    deviceScaleFactor: 2,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  await context.route('https://example.com/**', routeDemo);

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(serviceWorker.url()).host;
  const extensionManifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
  const files = [];

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(demoUrl);
  const hero = page.locator('.lede figure img');
  await hero.waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector('.lede figure img');
    return el && getComputedStyle(el).filter.includes('blur');
  });
  const cards = page.locator('.cards img');
  await cards.first().waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.cards img')].every((image) =>
      getComputedStyle(image).filter.includes('blur')
    )
  );
  await capture(page, 'page-hidden.png', 'Media-dense demonstration page with all media blurred by Cognitive Comfort.', files);

  await hero.hover();
  await page.waitForFunction(() => {
    const el = document.querySelector('.lede figure img');
    return el && getComputedStyle(el).filter.includes('blur(0px)');
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.cards img')].every((image) =>
      getComputedStyle(image).filter.includes('blur')
    )
  );
  await capture(page, 'page-revealed.png', 'Demonstration page with only the hero photograph cluster revealed.', files);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 372, height: 800 });
  // A directly opened extension page has no activeTab grant. Pin only the popup's
  // active-tab lookup to our local example.com demo; settings, rules, and ledger
  // rendering continue to come from real storage and the real popup code.
  await popup.addInitScript((url) => {
    const g = globalThis;
    const stubTabs = [{ id: 1, url, active: true }];
    if (g.chrome?.tabs) {
      const origChromeQuery = g.chrome.tabs.query;
      g.chrome.tabs.query = (info, cb) => {
        if (info?.active === true && info?.currentWindow === true) {
          if (typeof cb === 'function') cb(stubTabs);
          return Promise.resolve(stubTabs);
        }
        return origChromeQuery(info, cb);
      };
    }
    if (g.browser?.tabs) {
      const origBrowserQuery = g.browser.tabs.query;
      g.browser.tabs.query = async (info) => {
        if (info?.active === true && info?.currentWindow === true) {
          return stubTabs;
        }
        return origBrowserQuery(info);
      };
    }
  }, demoUrl);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#currentDomain').filter({ hasText: 'example.com' }).waitFor();
  await capture(popup, 'popup-default.png', 'Toolbar popup showing example.com inheriting the global defaults.', files, { fullPage: true });

  const defaultSettings = {
    schemaVersion: 1,
    enabled: true,
    paused: false,
    blockEmojis: false,
    blurScope: 'all',
    revealMode: 'both',
    blurAmount: 50,
    siteOverrides: {},
    emojiSiteOverrides: {},
  };
  await setSettings(popup, { ...defaultSettings, paused: true });
  await popup.reload();
  await popup.locator('.stamp').waitFor();
  await capture(popup, 'popup-paused.png', 'Toolbar popup paused everywhere, with the example.com site and Paused stamp.', files, { fullPage: true });

  await setSettings(popup, {
    ...defaultSettings,
    siteOverrides: { 'example.com': 'disabled' },
  });
  await popup.reload();
  await popup.locator('#siteDisabled:checked').waitFor();
  await capture(popup, 'popup-site-rule.png', 'Toolbar popup with an exact-domain Show rule filed for example.com.', files, { fullPage: true });

  await setSettings(popup, {
    ...defaultSettings,
    siteOverrides: { 'example.com': 'disabled', 'docs.example.com': 'enabled' },
    emojiSiteOverrides: { 'example.com': 'enabled' },
  });
  const options = await context.newPage();
  await options.setViewportSize({ width: 900, height: 1200 });
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator('.site-rule').filter({ hasText: 'docs.example.com' }).waitFor();
  await options.evaluate(() => scrollTo(0, 0));
  await capture(options, 'options-top.png', 'Top of the options page with global policy and the first filed rule visible.', files);
  await capture(options, 'options.png', 'Options page showing two filed media rules and one emoji rule.', files, { fullPage: true });

  const filedRules = options.locator('#siteRules').locator('xpath=ancestor::section[1]');
  await filedRules.scrollIntoViewIfNeeded();
  await options.evaluate(() => {
    const section = document.querySelector('#siteRules')?.closest('section');
    if (section) scrollTo(0, section.getBoundingClientRect().top + scrollY);
  });
  await capture(options, 'options-rules.png', 'Filed site-rules section with example.com and docs.example.com controls visible.', files);
  const metadata = {
    generatedAt: new Date().toISOString(),
    extensionVersion: extensionManifest.version,
    files,
  };
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(metadata, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.close();
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
}
