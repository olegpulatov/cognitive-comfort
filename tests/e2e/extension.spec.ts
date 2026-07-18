import { expect, test, chromium, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionPath = process.env.E2E_EXTENSION_PATH
  ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url));
const browserChannel = process.env.E2E_BROWSER_CHANNEL ?? 'chromium';
const fixtureUrl = 'http://127.0.0.1:4177/fixture.html';

test('public Chromium artifact preserves the complete media interaction flow', async () => {
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

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
    const extensionId = new URL(serviceWorker.url()).host;

    const page = await context.newPage();
    await page.goto(fixtureUrl);
    const normalImage = page.locator('#normal-image');
    await expect.poll(() => normalImage.evaluate((element) => getComputedStyle(element).filter))
      .toContain('blur(40px)');

    await expect.poll(() => page.locator('#background-media').getAttribute('data-comfort-bg-image'))
      .toBe('true');
    await expect.poll(() => page.locator('#background-media').evaluate((element) => getComputedStyle(element).filter))
      .toContain('blur(40px)');
    await expect(page.locator('#bare-svg')).toHaveCSS('filter', 'none');

    const linkedImage = page.locator('#linked-image');
    const initialUrl = page.url();
    await linkedImage.click();
    expect(page.url()).toBe(initialUrl);
    await expect.poll(() => linkedImage.evaluate((element) => getComputedStyle(element).filter))
      .toContain('blur(0px)');
    await linkedImage.click();
    await expect(page).toHaveURL(/#linked-destination$/);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#pauseBtn')).toHaveText('Pause');
    await expect(popup.locator('.shortcut-item')).toHaveCount(4);
    await expect(popup.locator('.shortcut-item > .shortcut-name')).toHaveCount(4);
    await expect(popup.locator('.shortcut-item > .shortcut-key')).toHaveCount(4);
    await popup.locator('#pauseBtn').click();
    await expect(popup.locator('#pauseBtn')).toHaveText('Resume');
    await expect.poll(() => normalImage.evaluate((element) => getComputedStyle(element).filter)).toBe('none');

    await popup.locator('#pauseBtn').click();
    await expect(popup.locator('#pauseBtn')).toHaveText('Pause');
    await expect.poll(() => normalImage.evaluate((element) => getComputedStyle(element).filter))
      .toContain('blur(40px)');

    const dynamicBackground = page.locator('#dynamic-background');
    await expect(dynamicBackground).toHaveAttribute('data-comfort-bg-image', 'true');
    await expect.poll(() => dynamicBackground.evaluate((element) => getComputedStyle(element).filter))
      .toContain('blur(40px)');

    await popup.locator('#emojiGlobalEnabled').click();
    await expect(page.locator('#emoji-text .comfort-emoji')).toHaveCSS('display', 'none');
    await expect(page.locator('#editable-text .comfort-emoji')).toHaveCount(0);
    await expect.poll(() => normalImage.evaluate((element) => getComputedStyle(element).filter))
      .toContain('blur(40px)');
    await popup.locator('#emojiGlobalDisabled').click();
    await expect(page.locator('#emoji-text .comfort-emoji')).toHaveCount(0);
    await expect(page.locator('#emoji-text')).toContainText('🧠');

    await page.bringToFront();
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.down('a');
    await expect.poll(() => normalImage.evaluate((element) => getComputedStyle(element).filter))
      .toContain('blur(0px)');
    await page.keyboard.up('a');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await expect.poll(() => normalImage.evaluate((element) => getComputedStyle(element).filter))
      .toContain('blur(40px)');

    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
