import { expect, test, webkit, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const bundlePath = path.join(rootDir, '.output', 'chrome-mv3', 'content-scripts', 'comfort.js');

function loadComfortScript(): string {
  return fs.readFileSync(bundlePath, 'utf8');
}

interface InitSettingsOptions {
  revealMode?: 'both' | 'hover' | 'click';
  blurScope?: 'all' | 'content';
  blurAmount?: number;
  enabled?: boolean;
}

async function setupWebKitPage(
  page: Page,
  htmlContent: string,
  options: InitSettingsOptions = {}
): Promise<void> {
  const settings = {
    schemaVersion: 1,
    enabled: options.enabled ?? true,
    paused: false,
    blockEmojis: false,
    blurScope: options.blurScope ?? 'all',
    revealMode: options.revealMode ?? 'both',
    blurAmount: options.blurAmount ?? 50,
    siteOverrides: {},
    emojiSiteOverrides: {},
  };

  await page.addInitScript((injectedSettings) => {
    (window as unknown as { browser: unknown }).browser = {
      storage: {
        local: {
          get: async () => ({ comfortSettings: injectedSettings }),
          set: async () => {},
        },
        onChanged: {
          addListener: () => {},
          removeListener: () => {},
          hasListener: () => false,
        },
      },
      runtime: {
        id: 'cognitive-comfort-webkit-test',
        sendMessage: async () => {},
        onMessage: {
          addListener: () => {},
          removeListener: () => {},
        },
      },
    };
  }, settings);

  await page.goto('http://127.0.0.1:4177/fixture.html');
  await page.setContent(htmlContent);

  const scriptContent = loadComfortScript();
  await page.addScriptTag({ content: scriptContent });
  await page.waitForTimeout(100);
}

test.describe('WebKit / Safari Extension Behavior', () => {
  test('WebKit CSS filter cascade override with !important and :not([data-comfort-revealed="true"])', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .container { padding: 40px; }
            img { width: 300px; height: 200px; display: block; }
          </style>
        </head>
        <body>
          <div class="container">
            <img id="test-img" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='blue'/></svg>">
          </div>
        </body>
        </html>
        `
      );

      const img = page.locator('#test-img');

      // Base state: blurred with 50px
      await expect.poll(() => img.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');

      // When data-comfort-revealed is set, WebKit immediately evaluates to blur(0px) brightness(1)
      await img.evaluate((el) => el.setAttribute('data-comfort-revealed', 'true'));
      await expect.poll(() => img.evaluate((el) => getComputedStyle(el).filter))
        .toBe('blur(0px) brightness(1)');

      // When attribute is removed, returns to blur(50px)
      await img.evaluate((el) => el.removeAttribute('data-comfort-revealed'));
      await expect.poll(() => img.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');
    } finally {
      await browser.close();
    }
  });

  test('YouTube video card hover unblur and dynamic inline preview player <video> mounting reconciliation', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            ytd-rich-item-renderer { display: block; width: 360px; height: 280px; position: relative; margin: 40px; }
            ytd-thumbnail { display: block; width: 360px; height: 202px; position: relative; overflow: hidden; }
            ytd-thumbnail img { width: 100%; height: 100%; object-fit: cover; display: block; }
            #inline-preview-player { position: absolute; top: 0; left: 0; width: 360px; height: 202px; }
            #inline-preview-player video { width: 100%; height: 100%; object-fit: cover; display: block; }
          </style>
        </head>
        <body>
          <ytd-rich-item-renderer id="card-1">
            <ytd-thumbnail id="thumb-container">
              <img id="thumb-img" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='202'><rect width='100%' height='100%' fill='crimson'/></svg>">
            </ytd-thumbnail>
            <div id="details"><h3>Nature Documentary</h3></div>
          </ytd-rich-item-renderer>
        </body>
        </html>
        `
      );

      const thumbImg = page.locator('#thumb-img');

      // 1. Initial blurred state
      await expect.poll(() => thumbImg.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');

      // 2. Hover over thumbnail
      await page.hover('#thumb-img');
      await expect.poll(() => thumbImg.getAttribute('data-comfort-revealed'))
        .toBe('true');
      await expect.poll(() => thumbImg.evaluate((el) => getComputedStyle(el).filter))
        .toBe('blur(0px) brightness(1)');

      // 3. YouTube dynamically mounts the inline-preview-player with video under cursor
      await page.evaluate(() => {
        const thumb = document.querySelector('#thumb-container')!;
        const player = document.createElement('div');
        player.id = 'inline-preview-player';
        player.className = 'html5-video-player';
        player.innerHTML = `<video id="preview-video" muted playsinline autoplay src="data:video/mp4;base64,"></video>`;
        thumb.appendChild(player);
      });

      const previewVideo = page.locator('#preview-video');

      // 4. Mutation observer reconciles and reveals the newly mounted video immediately
      await expect.poll(() => previewVideo.getAttribute('data-comfort-revealed'))
        .toBe('true');
      await expect.poll(() => previewVideo.evaluate((el) => getComputedStyle(el).filter))
        .toBe('blur(0px) brightness(1)');

      // 5. Cursor moves away -> both thumbnail and video re-blur
      await page.mouse.move(0, 0);
      await expect.poll(() => thumbImg.getAttribute('data-comfort-revealed'))
        .toBeNull();
      await expect.poll(() => previewVideo.getAttribute('data-comfort-revealed'))
        .toBeNull();
      await expect.poll(() => thumbImg.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');
      await expect.poll(() => previewVideo.evaluate((el) => getComputedStyle(el).filter))
        .toContain('blur(50px)');
    } finally {
      await browser.close();
    }
  });

  for (const revealMode of ['click', 'both'] as const) {
    for (const leaveBeforeMount of [false, true]) {
      test(`Same-card mounted video stays click-locked without revealing neighbors (${revealMode}, leave ${leaveBeforeMount ? 'before' : 'after'} mount)`, async () => {
        const browser = await webkit.launch({ headless: true });
        const page = await browser.newPage();
        try {
          await setupWebKitPage(page, `
            <!DOCTYPE html>
            <html><head><style>
              body { margin: 40px; }
              main { display: flex; gap: 40px; }
              article, .slot { width: 300px; height: 200px; position: relative; }
              img, video { display: block; width: 300px; height: 200px; }
              #outside { position: fixed; left: 40px; top: 400px; }
            </style></head><body>
              <main>
                <article><div class="slot" id="selected"><img id="thumb" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='crimson'/></svg>"></div></article>
                <article><div class="slot" id="neighbor"><img id="neighbor-thumb" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='blue'/></svg>"></div></article>
              </main>
              <button id="outside">Outside media</button>
            </body></html>
          `, { revealMode });
          await expect.poll(() => page.locator('#thumb').evaluate((el) => getComputedStyle(el).filter))
            .toContain('blur(50px)');
          await page.click('#thumb');
          if (leaveBeforeMount) await page.hover('#outside');
          await page.evaluate(() => {
            const selected = document.createElement('video');
            selected.id = 'selected-video';
            selected.muted = true;
            selected.playsInline = true;
            document.querySelector('#selected')!.replaceChildren(selected);
            const neighbor = document.createElement('video');
            neighbor.id = 'neighbor-video';
            document.querySelector('#neighbor')!.appendChild(neighbor);
          });
          const video = page.locator('#selected-video');
          await expect.poll(() => video.evaluate((el) => getComputedStyle(el).filter))
            .toBe('blur(0px) brightness(1)');
          await page.hover('#outside');
          await expect.poll(() => video.evaluate((el) => getComputedStyle(el).filter))
            .toBe('blur(0px) brightness(1)');
          await expect.poll(() => page.locator('#neighbor-thumb').evaluate((el) => getComputedStyle(el).filter))
            .toContain('blur(50px)');
          await expect.poll(() => page.locator('#neighbor-video').evaluate((el) => getComputedStyle(el).filter))
            .toContain('blur(50px)');
          await page.click('#outside');
          await expect.poll(() => video.evaluate((el) => getComputedStyle(el).filter))
            .toContain('blur(50px)');
        } finally {
          await browser.close();
        }
      });
    }
  }

  test('YouTube Shorts carousel shelf isolation: only hovered Short reveals while siblings stay blurred', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            ytd-reel-shelf-renderer { display: block; width: 1000px; height: 400px; position: relative; margin: 20px; }
            #items { display: flex; gap: 16px; }
            ytd-reel-item-renderer { display: block; width: 180px; height: 320px; position: relative; }
            ytd-thumbnail { display: block; width: 180px; height: 320px; position: relative; }
            ytd-thumbnail img { width: 100%; height: 100%; object-fit: cover; display: block; }
          </style>
        </head>
        <body>
          <ytd-reel-shelf-renderer id="shorts-shelf">
            <div id="items">
              <ytd-reel-item-renderer id="short-1">
                <ytd-thumbnail>
                  <img id="thumb-short-1" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='320'><rect width='100%' height='100%' fill='blue'/></svg>">
                </ytd-thumbnail>
              </ytd-reel-item-renderer>
              <ytd-reel-item-renderer id="short-2">
                <ytd-thumbnail>
                  <img id="thumb-short-2" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='320'><rect width='100%' height='100%' fill='green'/></svg>">
                </ytd-thumbnail>
              </ytd-reel-item-renderer>
              <ytd-reel-item-renderer id="short-3">
                <ytd-thumbnail>
                  <img id="thumb-short-3" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='320'><rect width='100%' height='100%' fill='orange'/></svg>">
                </ytd-thumbnail>
              </ytd-reel-item-renderer>
            </div>
          </ytd-reel-shelf-renderer>
        </body>
        </html>
        `
      );

      const s1 = page.locator('#thumb-short-1');
      const s2 = page.locator('#thumb-short-2');
      const s3 = page.locator('#thumb-short-3');

      // All 3 shorts start blurred
      await expect.poll(() => s1.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => s2.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => s3.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');

      // Hover over Short 2
      await page.hover('#thumb-short-2');

      // Only Short 2 is revealed; Short 1 and 3 remain blurred
      await expect.poll(() => s2.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => s2.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');

      await expect.poll(() => s1.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => s1.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');

      await expect.poll(() => s3.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => s3.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');

      // Move hover to Short 1
      await page.hover('#thumb-short-1');

      // Short 1 is revealed; Short 2 and 3 are blurred
      await expect.poll(() => s1.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => s1.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');

      await expect.poll(() => s2.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => s2.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');

      await expect.poll(() => s3.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => s3.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
    } finally {
      await browser.close();
    }
  });

  test('Row isolation: moving over header/strip/gap reveals nothing; only the hovered card reveals', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin: 8px; font-family: sans-serif; }
            #section { width: 800px; }
            #header { width: 800px; height: 32px; line-height: 32px; }
            #strip { width: 800px; height: 6px; }
            #row { display: flex; gap: 16px; width: 800px; }
            .card { width: 240px; }
            .card img { width: 240px; height: 135px; display: block; }
            .card h3 { margin: 0; font-size: 14px; height: 20px; }
          </style>
        </head>
        <body>
          <section id="section">
            <div id="header">Recommended</div>
            <div id="strip"></div>
            <div id="row">
              <div class="card" id="card1"><img id="t1" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='135'><rect width='100%' height='100%' fill='tomato'/></svg>"><h3>One</h3></div>
              <div class="card" id="card2"><img id="t2" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='135'><rect width='100%' height='100%' fill='seagreen'/></svg>"><h3>Two</h3></div>
              <div class="card" id="card3"><img id="t3" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='135'><rect width='100%' height='100%' fill='steelblue'/></svg>"><h3>Three</h3></div>
            </div>
          </section>
        </body>
        </html>
        `
      );

      const t1 = page.locator('#t1');
      const t2 = page.locator('#t2');
      const t3 = page.locator('#t3');

      // All start blurred
      await expect.poll(() => t1.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => t2.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => t3.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');

      // 1. Moving over the section header (no media under cursor) reveals nothing
      await page.hover('#header');
      await expect.poll(() => t1.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t2.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t3.getAttribute('data-comfort-revealed')).toBeNull();

      // 2. Moving over the thin strip (6px) above the row reveals nothing
      await page.hover('#strip');
      await expect.poll(() => t1.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t2.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t3.getAttribute('data-comfort-revealed')).toBeNull();

      // 3. Moving through the 16px gap between card 1 and card 2 reveals nothing
      // (card 1 spans x 8..248, gap 248..264, card 2 spans x 264..504; row top = 8 + 32 + 6 + 8 = 54)
      await page.mouse.move(256, 100);
      await expect.poll(() => t1.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t2.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t3.getAttribute('data-comfort-revealed')).toBeNull();

      // 4. Hovering card 2 reveals only card 2, not the row's first card
      await page.hover('#t2');
      await expect.poll(() => t2.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => t2.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');
      await expect.poll(() => t1.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t1.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => t3.getAttribute('data-comfort-revealed')).toBeNull();

      // 5. Move away: everything re-blurs
      await page.mouse.move(0, 0);
      await expect.poll(() => t2.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t1.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t3.getAttribute('data-comfort-revealed')).toBeNull();
    } finally {
      await browser.close();
    }
  });

  test('0x0 wrapper in hit chain: pointer over its text reveals nothing; hovered card reveals only itself', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin: 0; }
            #zero { position: relative; width: 0; height: 0; overflow: visible; }
            #label { position: absolute; top: 8px; left: 8px; width: 200px; height: 24px; }
            .card { position: absolute; width: 240px; }
            .card img { width: 240px; height: 135px; display: block; }
            #card1 { top: 48px; left: 8px; }
            #card2 { top: 48px; left: 264px; }
            #card3 { top: 48px; left: 520px; }
          </style>
        </head>
        <body>
          <div id="zero">
            <div id="label">Section</div>
            <div class="card" id="card1"><img id="t1" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='135'><rect width='100%' height='100%' fill='gold'/></svg>"></div>
            <div class="card" id="card2"><img id="t2" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='135'><rect width='100%' height='100%' fill='slateblue'/></svg>"></div>
            <div class="card" id="card3"><img id="t3" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='135'><rect width='100%' height='100%' fill='darkorange'/></svg>"></div>
          </div>
        </body>
        </html>
        `
      );

      const t1 = page.locator('#t1');
      const t2 = page.locator('#t2');
      const t3 = page.locator('#t3');

      await expect.poll(() => t1.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => t2.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => t3.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');

      // 1. Pointer over the 0x0 wrapper's own text: nothing reveals
      await page.hover('#label');
      await expect.poll(() => t1.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t2.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t3.getAttribute('data-comfort-revealed')).toBeNull();

      // 2. Hovering card 2 reveals only card 2, never the wrapper's first card
      await page.hover('#t2');
      await expect.poll(() => t2.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => t2.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');
      await expect.poll(() => t1.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => t1.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => t3.getAttribute('data-comfort-revealed')).toBeNull();
    } finally {
      await browser.close();
    }
  });

  test('Multi-layer scrim coordinate penetration: resolves media under overlay buttons/scrims', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .player-card { position: relative; width: 400px; height: 250px; margin: 30px; }
            .bg-media { position: absolute; inset: 0; background: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='250'><rect width='100%' height='100%' fill='purple'/></svg>"); }
            .video-under { position: absolute; inset: 0; width: 100%; height: 100%; }
            .scrim-overlay { position: absolute; inset: 0; z-index: 10; cursor: pointer; }
            .play-button { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 20; }
          </style>
        </head>
        <body>
          <div class="player-card" id="card">
            <video id="card-video" class="video-under" src="data:video/mp4;base64,"></video>
            <div id="card-bg" class="bg-media" data-comfort-bg-image="true"></div>
            <div id="card-scrim" class="scrim-overlay">
              <button id="card-btn" class="play-button" type="button">Play</button>
            </div>
          </div>
        </body>
        </html>
        `
      );

      const video = page.locator('#card-video');
      const bg = page.locator('#card-bg');

      // Both start blurred
      await expect.poll(() => video.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
      await expect.poll(() => bg.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');

      // Hover directly over the play button on top of the scrim
      await page.hover('#card-btn');

      // Both video and background image under the scrim reveal
      await expect.poll(() => video.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => bg.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => video.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');
      await expect.poll(() => bg.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');

      // Move away
      await page.mouse.move(0, 0);
      await expect.poll(() => video.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => bg.getAttribute('data-comfort-revealed')).toBeNull();
    } finally {
      await browser.close();
    }
  });

  test('Generic multi-layer video stack on non-YouTube sites', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .video-article { display: block; width: 480px; height: 300px; position: relative; margin: 20px; }
            .video-wrapper { position: relative; width: 100%; height: 100%; }
            .poster-img { width: 100%; height: 100%; object-fit: cover; }
            .custom-video { position: absolute; inset: 0; width: 100%; height: 100%; display: none; }
            .video-wrapper.is-playing .poster-img { display: none; }
            .video-wrapper.is-playing .custom-video { display: block; }
          </style>
        </head>
        <body>
          <article class="video-article">
            <div class="video-wrapper" id="vwrap">
              <img id="poster" class="poster-img" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='480' height='300'><rect width='100%' height='100%' fill='indigo'/></svg>">
              <video id="vplayer" class="custom-video" src="data:video/mp4;base64,"></video>
            </div>
          </article>
        </body>
        </html>
        `
      );

      const poster = page.locator('#poster');
      const player = page.locator('#vplayer');

      // Hover over poster
      await page.hover('#poster');
      await expect.poll(() => poster.getAttribute('data-comfort-revealed')).toBe('true');

      // Site starts playing and swaps poster for video
      await page.evaluate(() => {
        document.getElementById('vwrap')!.classList.add('is-playing');
      });

      // Video is now visible and unblurred
      await expect.poll(() => player.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => player.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');

      // Move away
      await page.mouse.move(0, 0);
      await expect.poll(() => player.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => player.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
    } finally {
      await browser.close();
    }
  });

  test('Dynamic node replacement maintains hover unblur without flashing', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .slot { width: 300px; height: 200px; position: relative; margin: 20px; }
            .slot img { width: 100%; height: 100%; display: block; }
          </style>
        </head>
        <body>
          <div class="slot" id="slot">
            <img id="lqip" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='pink'/></svg>">
          </div>
        </body>
        </html>
        `
      );

      // Hover over LQIP image
      await page.hover('#lqip');
      await expect.poll(() => page.locator('#lqip').getAttribute('data-comfort-revealed')).toBe('true');

      // Replace LQIP with high-res image
      await page.evaluate(() => {
        const slotEl = document.getElementById('slot')!;
        slotEl.innerHTML = `<img id="hires" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='magenta'/></svg>">`;
      });

      // Newly inserted hires image is immediately revealed
      const hires = page.locator('#hires');
      await expect.poll(() => hires.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => hires.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');

      // Move away
      await page.mouse.move(0, 0);
      await expect.poll(() => hires.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => hires.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
    } finally {
      await browser.close();
    }
  });

  test('Reveal mode "both": hover unblurs temporarily, click locks reveal permanently until clicked outside', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .media-box { width: 300px; height: 200px; margin: 30px; }
            img { width: 100%; height: 100%; display: block; }
          </style>
        </head>
        <body>
          <div class="media-box">
            <img id="lock-img" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='teal'/></svg>">
          </div>
          <div id="outside" style="margin-top: 50px; height: 100px; width: 100px;">Outside</div>
        </body>
        </html>
        `,
        { revealMode: 'both' }
      );

      const img = page.locator('#lock-img');

      // 1. Hover reveals
      await page.hover('#lock-img');
      await expect.poll(() => img.getAttribute('data-comfort-revealed')).toBe('true');

      // 2. Click while hovering locks it
      await page.click('#lock-img');
      await expect.poll(() => img.getAttribute('data-comfort-revealed')).toBe('true');

      // 3. Move mouse away -> still revealed because it is locked!
      await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
      await expect.poll(() => img.getAttribute('data-comfort-revealed')).toBe('true');
      await expect.poll(() => img.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(0px) brightness(1)');

      // 4. Click outside unlocks and re-blurs
      await page.click('#outside');
      await expect.poll(() => img.getAttribute('data-comfort-revealed')).toBeNull();
      await expect.poll(() => img.evaluate((el) => getComputedStyle(el).filter)).toContain('blur(50px)');
    } finally {
      await browser.close();
    }
  });

  test('Autoplay / pointermove preservation: pointer events propagate freely to page listeners', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await setupWebKitPage(
        page,
        `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .card { width: 300px; height: 200px; margin: 30px; }
            img { width: 100%; height: 100%; display: block; }
          </style>
        </head>
        <body>
          <div class="card" id="card">
            <img id="img" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='navy'/></svg>">
          </div>
          <script>
            window.__pointerEventsReceived = [];
            const card = document.getElementById('card');
            card.addEventListener('pointerenter', (e) => window.__pointerEventsReceived.push('pointerenter'));
            card.addEventListener('pointermove', (e) => window.__pointerEventsReceived.push('pointermove'));
            card.addEventListener('pointerover', (e) => window.__pointerEventsReceived.push('pointerover'));
          </script>
        </body>
        </html>
        `
      );

      await page.hover('#img');
      await page.mouse.move(50, 50);

      const received = await page.evaluate(() => (window as unknown as { __pointerEventsReceived: string[] }).__pointerEventsReceived);
      expect(received).toContain('pointermove');
      expect(received.length).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  });

  test('Safari popup pins to the popover viewport: fixed-height body scroll, dark background, no document scroll', async () => {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.addInitScript(() => {
        const browser = {
          storage: {
            local: { get: async () => ({}), set: async () => {} },
            onChanged: { addListener() {} },
          },
          commands: {
            getAll: async () => [{ name: 'toggle-pause', shortcut: '' }],
          },
          tabs: { query: async () => [{ url: 'https://example.com/' }] },
          runtime: {
            id: 'webkit-popup-test',
            openOptionsPage: async () => {},
            sendMessage: async () => undefined,
            getURL: (s: string) => s,
          },
        };
        Object.assign(globalThis, { browser });
      });

      await page.goto('http://127.0.0.1:4177/popup.html');
      await page.waitForSelector('#buildInfo');
      await expect(page.locator('.shortcut-key.not-set')).toHaveText('Not set');

      // Content must overflow the 600px popover cap, or there is nothing to pin.
      await expect.poll(() => page.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(600);

      const probe = await page.evaluate(() => {
        const cs = (el: Element) => getComputedStyle(el);
        const docEl = document.documentElement;
        return {
          htmlHeight: cs(docEl).height,
          bodyOverflowY: cs(document.body).overflowY,
          bodyClientHeight: document.body.clientHeight,
          docScrollable: docEl.scrollHeight > docEl.clientHeight,
          bodyBg: cs(document.body).backgroundColor,
        };
      });

      // Safari popovers auto-resize the native window to content height, which
      // kills scroll inertia and lets the popover's grey show while scrolling.
      // The WebKit-only @supports gate pins the popup: body owns the scroll and
      // its background always covers the popover.
      expect(probe.htmlHeight).toBe('600px');
      expect(probe.bodyOverflowY).toBe('auto');
      expect(probe.bodyClientHeight).toBe(600);
      expect(probe.docScrollable).toBe(false);
      expect(probe.bodyBg).toBe('rgb(20, 17, 14)');
    } finally {
      await browser.close();
    }
  });
});
