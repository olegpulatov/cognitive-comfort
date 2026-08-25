import { expect, test, chromium, type BrowserContext, type Locator, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionPath = process.env.E2E_EXTENSION_PATH
  ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url));
const browserChannel = process.env.E2E_BROWSER_CHANNEL ?? 'chromium';
const fixtureUrl = 'http://127.0.0.1:4177/fixture.html';

interface TestEnv {
  context: BrowserContext;
  extensionId: string;
  page: Page;
  userDataDir: string;
  errors: string[];
}

async function createTestEnv(): Promise<TestEnv> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'cognitive-comfort-e2e-'));
  const errors: string[] = [];
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: browserChannel,
    headless: true,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const recordPageErrors = (page: Page): void => {
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
  };
  const recordWorkerErrors = (worker: Worker): void => {
    worker.on('console', (message) => {
      if (message.type() === 'error') errors.push(`worker: ${message.text()}`);
    });
  };

  context.on('page', recordPageErrors);
  context.on('serviceworker', recordWorkerErrors);
  for (const worker of context.serviceWorkers()) recordWorkerErrors(worker);

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(serviceWorker.url()).host;

  const page = await context.newPage();
  await page.goto(fixtureUrl);

  return { context, extensionId, page, userDataDir, errors };
}

async function destroyTestEnv(env: TestEnv): Promise<void> {
  await env.context.close();
  await rm(env.userDataDir, { recursive: true, force: true });
}

async function openPopup(env: TestEnv, activeTabUrl?: string): Promise<Page> {
  const popup = await env.context.newPage();
  if (activeTabUrl) {
    await popup.addInitScript((injectedUrl) => {
      const g = globalThis as unknown as {
        chrome?: { tabs?: { query: (info: { active?: boolean }, cb?: (tabs: unknown[]) => void) => Promise<unknown[]> } };
        browser?: { tabs?: { query: (info: { active?: boolean }) => Promise<unknown[]> } };
      };
      const stubTabs = [{ id: 1, url: injectedUrl, active: true }];
      if (g.chrome?.tabs) {
        const origChromeQuery = g.chrome.tabs.query;
        g.chrome.tabs.query = ((info: { active?: boolean }, cb?: (tabs: unknown[]) => void) => {
          if (info?.active) {
            if (typeof cb === 'function') cb(stubTabs);
            return Promise.resolve(stubTabs);
          }
          return origChromeQuery(info, cb);
        }) as typeof g.chrome.tabs.query;
      }
      if (g.browser?.tabs) {
        const origBrowserQuery = g.browser.tabs.query;
        g.browser.tabs.query = async (info) => {
          if (info?.active) return stubTabs;
          return origBrowserQuery(info);
        };
      }
    }, activeTabUrl);
  }
  await popup.goto(`chrome-extension://${env.extensionId}/popup.html`);
  return popup;
}

async function assertControlHasFocusRing(locator: Locator): Promise<void> {
  await expect(locator).toBeFocused();
  const hasFocus = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
    return s.boxShadow !== 'none' || s.outlineStyle !== 'none' || (parent !== null && parent.boxShadow !== 'none');
  });
  expect(hasFocus).toBe(true);
}

interface BrowserActionState {
  title: string;
}

async function getActiveTabBrowserActionState(env: TestEnv): Promise<BrowserActionState> {
  await env.page.bringToFront();
  const worker = env.context.serviceWorkers()[0] ?? await env.context.waitForEvent('serviceworker');

  return worker.evaluate(async () => {
    const api = (globalThis as unknown as {
      chrome: {
        tabs: { query: (details: { active: boolean; currentWindow: boolean }) => Promise<Array<{ id?: number }>> };
        action: {
          getTitle: (details: { tabId: number }) => Promise<string>;
        };
      };
    }).chrome;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('No active tab available for browser-action assertion.');

    const title = await api.action.getTitle({ tabId: tab.id });
    return { title };
  });
}

test.describe('Chromium Extension Acceptance Suite', () => {
  test('1. Content script media blur, cursor affordance, hover reveal, and peek shortcut', async () => {
    const env = await createTestEnv();
    try {
      const normalImage = env.page.locator('#normal-image');
      await expect.poll(() => normalImage.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');

      // Verify cursor pointer affordance on blurred media
      await expect.poll(() => normalImage.evaluate((el) => getComputedStyle(el).cursor))
        .toBe('pointer');

      // Background media blurred
      await expect.poll(() => env.page.locator('#background-media').getAttribute('data-comfort-bg-image'))
        .toBe('true');
      await expect.poll(() => env.page.locator('#background-media').evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');

      // Bare SVG blurred under 'all' scope
      await expect.poll(() => env.page.locator('#bare-svg').evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');

      // Hover reveals linked image
      const linkedImage = env.page.locator('#linked-image');
      await linkedImage.hover();
      await expect.poll(() => linkedImage.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(0px)');
      await linkedImage.click();
      await expect(env.page).toHaveURL(/#linked-destination$/);

      // Peek shortcut (Control+Shift+A)
      await env.page.bringToFront();
      await env.page.keyboard.down('Control');
      await env.page.keyboard.down('Shift');
      await env.page.keyboard.down('a');
      await expect.poll(() => normalImage.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(0px)');
      await env.page.keyboard.up('a');
      await env.page.keyboard.up('Shift');
      await env.page.keyboard.up('Control');
      await expect.poll(() => normalImage.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('2. Effective state ledger: reflects global default vs site own rule attribution', async () => {
    const env = await createTestEnv();
    try {
      const popup = await openPopup(env, fixtureUrl);

      // 1. Initial state: attributed to global default
      await expect(popup.locator('#ledgerState')).toHaveText('Media is blurred on 127.0.0.1.');
      await expect(popup.locator('#ledgerBecause')).toContainText('From the global default.');

      // 2. Set rule for this domain to disabled (Show)
      await popup.locator('#siteDisabled').click();
      await expect(popup.locator('#ledgerState')).toHaveText('Media is shown on 127.0.0.1.');
      await expect(popup.locator('#ledgerBecause')).toContainText('From this site’s own rule.');

      // 3. Fixture page reflects unblur
      const normalImage = env.page.locator('#normal-image');
      await expect.poll(() => normalImage.evaluate((el) => getComputedStyle(el).filter))
        .toBe('none');

      // 4. Revert rule to default (Use global)
      await popup.locator('#siteDefault').click();
      await expect(popup.locator('#ledgerState')).toHaveText('Media is blurred on 127.0.0.1.');
      await expect(popup.locator('#ledgerBecause')).toContainText('From the global default.');
      await expect.poll(() => normalImage.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('3. Inheritance: subdomains inherit base domain rules with note and .is-inherited mark', async () => {
    const env = await createTestEnv();
    try {
      // Seed base domain rule in storage
      const popupSetup = await openPopup(env, 'http://example.com/home');
      await popupSetup.locator('#siteDisabled').click();
      await popupSetup.close();

      // Open popup on a subdomain
      const popupSub = await openPopup(env, 'http://blog.example.com/article');

      // Assert attribution names base domain
      await expect(popupSub.locator('#ledgerState')).toHaveText('Media is shown on blog.example.com.');
      await expect(popupSub.locator('#ledgerBecause')).toContainText('From the rule filed for example.com.');

      // Assert .is-inherited class is present
      await expect(popupSub.locator('#siteMediaSegments')).toHaveClass(/is-inherited/);
      await expect(popupSub.locator('#siteMediaNote')).toHaveText('Following the rule filed for example.com.');

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('4. Pause honesty: button state, ledger, stamp, and controls remain operable', async () => {
    const env = await createTestEnv();
    try {
      const popup = await openPopup(env, fixtureUrl);

      await expect(popup.locator('#pauseBtn')).toHaveText('Pause');
      await popup.locator('#pauseBtn').click();

      await expect(popup.locator('#pauseBtn')).toHaveText('Resume');
      await expect(popup.locator('#ledgerState')).toHaveText('Paused everywhere.');
      await expect(popup.locator('#siteSheet .stamp')).toBeVisible();

      // Media is unblurred on page while paused
      const normalImage = env.page.locator('#normal-image');
      await expect.poll(() => normalImage.evaluate((el) => getComputedStyle(el).filter))
        .toBe('none');

      // Resume restores blur and clears the pause stamp
      await popup.locator('#pauseBtn').click();
      await expect(popup.locator('#pauseBtn')).toHaveText('Pause');
      await expect(popup.locator('#siteSheet .stamp')).toHaveCount(0);
      await expect.poll(() => normalImage.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('5. Non-web tab: ledger informs user and site controls are disabled', async () => {
    const env = await createTestEnv();
    try {
      // Open popup directly without a web URL active tab
      const popup = await openPopup(env);

      await expect(popup.locator('#ledgerState')).toHaveText('This page cannot have its own rule.');
      await expect(popup.locator('#siteEnabled')).toBeDisabled();
      await expect(popup.locator('#siteDisabled')).toBeDisabled();
      await expect(popup.locator('#siteDefault')).toBeDisabled();
      await expect(popup.locator('#siteMediaNote')).toHaveText('Open a website to file a rule for it.');

      // Global controls still operable
      await expect(popup.locator('#globalEnabled')).toBeEnabled();
      await expect(popup.locator('#globalDisabled')).toBeEnabled();

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('6. Global emoji rule toggling', async () => {
    const env = await createTestEnv();
    try {
      const popup = await openPopup(env, fixtureUrl);

      // Hide emojis globally
      await popup.locator('#emojiGlobalEnabled').click();
      await expect(env.page.locator('#emoji-text .comfort-emoji')).toHaveCSS('display', 'none');
      // Editable emoji remains untouched
      await expect(env.page.locator('#editable-text .comfort-emoji')).toHaveCount(0);

      // Show emojis globally
      await popup.locator('#emojiGlobalDisabled').click();
      await expect(env.page.locator('#emoji-text .comfort-emoji')).toHaveCount(0);
      await expect(env.page.locator('#emoji-text')).toContainText('🧠');

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('7. Options page: filed site rules management and persistence', async () => {
    const env = await createTestEnv();
    try {
      // Seed site rules via popup
      const popup1 = await openPopup(env, 'http://alpha.com/');
      await popup1.locator('#siteDisabled').click();
      await popup1.close();

      const popup2 = await openPopup(env, 'http://beta.com/');
      await popup2.locator('#siteDisabled').click();
      await popup2.close();

      const popup3 = await openPopup(env, 'http://gamma.com/');
      await popup3.locator('#emojiSiteDisabled').click();
      await popup3.close();

      // Open options page
      const options = await env.context.newPage();
      await options.goto(`chrome-extension://${env.extensionId}/options.html`);

      await expect(options.locator('#defaultsSheet')).toBeVisible();
      await expect(options.locator('#coverageSheet')).toBeVisible();
      await expect(options.locator('#revealSheet')).toBeVisible();
      await expect(options.locator('#blurSheet')).toBeVisible();
      await expect(options.locator('#siteRules')).toBeVisible();
      await expect(options.locator('#blurAmountValue')).toHaveText('50');

      // Assert all 3 filed rules exist
      const alphaRow = options.locator('.site-rule').filter({ hasText: 'alpha.com' });
      const betaRow = options.locator('.site-rule').filter({ hasText: 'beta.com' });
      const gammaRow = options.locator('.site-rule').filter({ hasText: 'gamma.com' });
      await expect(alphaRow).toBeVisible();
      await expect(betaRow).toBeVisible();
      await expect(gammaRow).toBeVisible();

      // Change alpha.com rule: select 'Blur' (enabled)
      await alphaRow.locator('input[value="enabled"]').first().click();

      // Remove beta.com rule: select 'Use global' (default) on media fieldset
      await betaRow.locator('fieldset').filter({ hasText: 'Media' }).locator('input[value="default"]').click();
      await expect(options.locator('.site-rule').filter({ hasText: 'beta.com' })).toHaveCount(0);

      // Remove gamma.com emoji rule: select 'Use global' (default) on emoji fieldset
      await gammaRow.locator('fieldset').filter({ hasText: 'Emoji' }).locator('input[value="default"]').click();
      await expect(options.locator('.site-rule').filter({ hasText: 'gamma.com' })).toHaveCount(0);

      // Verify persistence in storage
      await expect.poll(async () => {
        return options.evaluate(async () => {
          const g = globalThis as unknown as {
            chrome?: { storage?: { local: { get: (k: string) => Promise<{ comfortSettings?: { siteOverrides?: Record<string, string>; emojiSiteOverrides?: Record<string, string> } }> } } };
            browser?: { storage?: { local: { get: (k: string) => Promise<{ comfortSettings?: { siteOverrides?: Record<string, string>; emojiSiteOverrides?: Record<string, string> } }> } } };
          };
          const api = g.chrome?.storage?.local ?? g.browser?.storage?.local;
          if (!api) return undefined;
          const s = (await api.get('comfortSettings')).comfortSettings;
          return {
            siteOverrides: s?.siteOverrides,
            emojiSiteOverrides: s?.emojiSiteOverrides,
          };
        });
      }).toEqual({
        siteOverrides: { 'alpha.com': 'enabled' },
        emojiSiteOverrides: {},
      });

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('8. Keyboard traversal and native radio accessibility in popup', async () => {
    const env = await createTestEnv();
    try {
      const popup = await openPopup(env, fixtureUrl);

      // Tab 1: Focus Pause button and assert visible focus styling
      await popup.keyboard.press('Tab');
      await assertControlHasFocusRing(popup.locator('#pauseBtn'));

      // Space activates focused Pause button
      await popup.keyboard.press('Space');
      await expect(popup.locator('#pauseBtn')).toHaveText('Resume');
      await popup.keyboard.press('Space');
      await expect(popup.locator('#pauseBtn')).toHaveText('Pause');

      // Tab 2: Focus siteMedia radio group (currently checked radio #siteDefault)
      await popup.keyboard.press('Tab');
      await assertControlHasFocusRing(popup.locator('#siteDefault'));

      // ArrowLeft changes selection to #siteDisabled
      await popup.keyboard.press('ArrowLeft');
      await expect(popup.locator('#siteDisabled')).toBeChecked();

      // Verify setting persisted to storage
      await expect.poll(async () => {
        return popup.evaluate(async () => {
          const g = globalThis as unknown as {
            chrome?: { storage?: { local: { get: (k: string) => Promise<{ comfortSettings?: { siteOverrides?: Record<string, string> } }> } } };
            browser?: { storage?: { local: { get: (k: string) => Promise<{ comfortSettings?: { siteOverrides?: Record<string, string> } }> } } };
          };
          const api = g.chrome?.storage?.local ?? g.browser?.storage?.local;
          if (!api) return undefined;
          const s = (await api.get('comfortSettings')).comfortSettings;
          return s?.siteOverrides?.['127.0.0.1'];
        });
      }).toBe('disabled');

      // Tab 3: Focus siteEmoji radio group
      await popup.keyboard.press('Tab');
      await assertControlHasFocusRing(popup.locator('#emojiSiteDefault'));

      // Tab 4: Focus globalMedia radio group
      await popup.keyboard.press('Tab');
      await assertControlHasFocusRing(popup.locator('#globalEnabled'));

      // Tab 5: Focus globalEmoji radio group
      await popup.keyboard.press('Tab');
      await assertControlHasFocusRing(popup.locator('#emojiGlobalDisabled'));

      // Tab 6: Focus blurAmount slider
      await popup.keyboard.press('Tab');
      await assertControlHasFocusRing(popup.locator('#blurAmount'));

      // Tab 7: Focus editShortcuts button
      await popup.keyboard.press('Tab');
      await assertControlHasFocusRing(popup.locator('#editShortcuts'));

      // Tab 8: Focus openOptions link
      await popup.keyboard.press('Tab');
      await assertControlHasFocusRing(popup.locator('#openOptions'));

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('9. Reduced motion emulation disables transition animations cleanly', async () => {
    const env = await createTestEnv();
    try {
      await env.page.emulateMedia({ reducedMotion: 'reduce' });
      const popup = await openPopup(env, fixtureUrl);
      await popup.emulateMedia({ reducedMotion: 'reduce' });

      // Verify that reduced-motion media query matches in popup
      const prefersReduced = await popup.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      expect(prefersReduced).toBe(true);

      // Verify transition duration is set to 1ms (0.001s) under prefers-reduced-motion
      const transitionDuration = await popup.locator('.sheet').first().evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(transitionDuration).toBe('0.001s');

      // Trigger card filing: click siteDisabled which adds .sheet-filed to siteSheet
      await popup.locator('#siteDisabled').click();
      await expect(popup.locator('#siteSheet')).toHaveClass(/sheet-filed/);

      // Verify animation duration on .sheet-filed is set to 1ms (0.001s) under prefers-reduced-motion
      const filedAnimDuration = await popup.locator('#siteSheet').evaluate((el) => getComputedStyle(el).animationDuration);
      expect(filedAnimDuration).toBe('0.001s');

      // Verify pause interactions work cleanly
      await popup.locator('#pauseBtn').click();
      await expect(popup.locator('#pauseBtn')).toHaveText('Resume');
      await popup.locator('#pauseBtn').click();
      await expect(popup.locator('#pauseBtn')).toHaveText('Pause');

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });

  test('10. Browser action reflects active, paused, and global-show titles', async () => {
    const env = await createTestEnv();
    try {
      // Without an activeTab grant, Chrome intentionally withholds the tab URL;
      // the action still reports the global active state.
      await expect.poll(() => getActiveTabBrowserActionState(env)).toEqual({
        title: 'Cognitive Comfort — Active',
      });

      const popup = await openPopup(env, fixtureUrl);
      await popup.locator('#pauseBtn').click();
      await expect.poll(() => getActiveTabBrowserActionState(env)).toEqual({
        title: 'Cognitive Comfort — Paused',
      });

      await popup.locator('#pauseBtn').click();
      await popup.locator('#globalDisabled').click();
      await expect.poll(() => getActiveTabBrowserActionState(env)).toEqual({
        title: 'Cognitive Comfort — Media shown globally',
      });

      expect(env.errors).toEqual([]);
    } finally {
      await destroyTestEnv(env);
    }
  });
});
