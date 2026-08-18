#!/usr/bin/env node

/*
  Renders every store asset described by brand/store/copy.json at its exact store
  pixel size, from brand/store/templates/asset.html, into brand/store/out/.

  Inputs it expects to already exist:
    brand/store/captures/*.png   real browser + real extension captures
                                 (node scripts/capture-shots.mjs)
    brand/icon/icon-1024.png     rendered icon master (bash scripts/generate-icons.sh)

  Deliberately dumb and sequential: a static file server, one Chromium page per
  asset, one screenshot each. Copy changes cost a re-render, never new art.

  Usage:
    node scripts/render-store-assets.mjs                 # everything
    node scripts/render-store-assets.mjs shot-2 marquee  # id substring filters
*/

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'brand/store/out');
const copy = JSON.parse(fs.readFileSync(path.join(rootDir, 'brand/store/copy.json'), 'utf8'));

const filters = process.argv.slice(2);
const assets = filters.length
  ? copy.assets.filter((asset) => filters.some((needle) => asset.id.includes(needle)))
  : copy.assets;

if (assets.length === 0) {
  console.error(`No asset in copy.json matched: ${filters.join(', ')}`);
  process.exit(1);
}

const missing = assets
  .flatMap((asset) => [asset.capture, asset.captureSecondary])
  .filter(Boolean)
  .filter((relative) => !fs.existsSync(path.join(rootDir, 'brand/store', relative)));

if (missing.length > 0) {
  console.error('Missing captures. Run `node scripts/capture-shots.mjs` first:');
  for (const relative of new Set(missing)) console.error(`  brand/store/${relative}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(rootDir, 'brand/icon/icon-1024.png'))) {
  console.error('Missing brand/icon/icon-1024.png. Run `bash scripts/generate-icons.sh` first.');
  process.exit(1);
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const filePath = path.join(rootDir, path.normalize(requested).replace(/^(\.\.[/\\])+/, ''));

  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, { 'content-type': contentTypes[path.extname(filePath)] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  for (const asset of assets) {
    const page = await browser.newPage({
      viewport: { width: asset.width, height: asset.height },
      deviceScaleFactor: 1,
    });

    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto(`${origin}/brand/store/templates/asset.html?id=${encodeURIComponent(asset.id)}`, {
      waitUntil: 'load',
    });
    await page.waitForFunction('document.documentElement.dataset.ready === "true"', null, { timeout: 15000 });

    if (consoleErrors.length > 0) {
      throw new Error(`${asset.id} raised page errors: ${consoleErrors.join(' | ')}`);
    }

    const output = path.join(outDir, `${asset.id}.png`);
    await page.screenshot({ path: output, animations: 'disabled' });
    await page.close();

    console.log(`${asset.width}x${asset.height}  ${asset.store.padEnd(34)}  ${path.relative(rootDir, output)}`);
  }
} finally {
  await browser.close();
  server.close();
}
