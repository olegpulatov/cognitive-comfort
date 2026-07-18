#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.E2E_PORT || 4177);
const host = '127.0.0.1';

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

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, host, () => {
  console.log(`Fixture server listening at http://${host}:${port}/fixture.html`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
