#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(fixtureDir, '..', '..', '.output', 'chrome-mv3');
const port = Number(process.env.E2E_PORT || 4177);
const host = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);

  if (url.pathname === '/' || url.pathname === '/fixture.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await readFile(path.join(fixtureDir, 'fixture.html')));
    return;
  }

  if (url.pathname === '/youtube-frame') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Fixture frame</title><p>Embedded media fixture</p>');
    return;
  }

  if (url.pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }

  // Serve built extension assets: WebKit has no extension host, so popup tests
  // load the packed popup.html and its chunks from here.
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const filePath = path.resolve(outputDir, rel);
  if (filePath === outputDir || filePath.startsWith(`${outputDir}${path.sep}`)) {
    try {
      const data = await readFile(filePath);
      response.writeHead(200, {
        'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      });
      response.end(data);
      return;
    } catch {
      // not an extension asset; fall through to 404
    }
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, host, () => {
  console.log(`Fixture server listening at http://127.0.0.1:${port}/fixture.html`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
