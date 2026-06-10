#!/usr/bin/env node
// exgram — tiny static server for the live viewer.
// Serves the viewer at `/`, a list of diagrams at `/api/diagrams`, and each
// scene at `/scene/<slug>.excalidraw`, all with no-store headers so the browser
// always sees the latest build. One server hosts many live boards.
// Pure Node built-ins. Port: $EXGRAM_PORT or 3737.

import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.EXGRAM_PORT) || 3737;
// Workspace holds one `<slug>.excalidraw` per live diagram. Override with
// $EXGRAM_WORKSPACE so a global install (read-only package dir) can point at a
// writable location instead.
const WORKSPACE = process.env.EXGRAM_WORKSPACE || join(ROOT, 'workspace');
const VIEWER = join(ROOT, 'viewer.html');
const SLUG = /^[a-z0-9][a-z0-9_-]*$/i; // safe slug: no slashes, no dots, no traversal

const send = (res, code, body, type = 'text/plain') => {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
};

const stream = (res, file, type) => {
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  createReadStream(file).pipe(res);
};

// List existing diagram slugs (filenames sans .excalidraw) in the workspace.
const listDiagrams = () => {
  try {
    return readdirSync(WORKSPACE)
      .filter((f) => f.endsWith('.excalidraw'))
      .map((f) => f.slice(0, -'.excalidraw'.length))
      .sort();
  } catch {
    return [];
  }
};

const server = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/health') return send(res, 200, 'ok');
  if (url === '/' || url === '/index.html') {
    return existsSync(VIEWER) ? stream(res, VIEWER, 'text/html') : send(res, 404, 'viewer missing');
  }
  if (url === '/api/diagrams') {
    return send(res, 200, JSON.stringify(listDiagrams()), 'application/json');
  }
  if (url.startsWith('/scene/')) {
    const slug = decodeURIComponent(url.slice('/scene/'.length)).replace(/\.excalidraw$/, '');
    if (!SLUG.test(slug)) return send(res, 400, 'bad slug');
    const file = join(WORKSPACE, `${slug}.excalidraw`);
    return existsSync(file)
      ? stream(res, file, 'application/json')
      : send(res, 404, 'no scene yet');
  }
  return send(res, 404, 'not found');
});

// Bind to loopback only: scenes may contain a private architecture, so they
// must not be reachable from other machines on the network.
server.listen(PORT, '127.0.0.1', () => {
  console.error(`exgram: viewer on http://localhost:${PORT}`);
});

// Exit quietly if the port is already taken (a viewer is presumably already up).
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`exgram: port ${PORT} already in use, assuming viewer is running`);
    process.exit(0);
  }
  throw err;
});
