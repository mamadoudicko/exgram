#!/usr/bin/env node
// exgram — tiny static server for the live viewer.
// Serves the viewer at `/`, a list of diagrams at `/api/diagrams`, and each
// scene at `/scene/<slug>.excalidraw`, all with no-store headers so the browser
// always sees the latest build. One server hosts many live boards.
// Pure Node built-ins. Port: $EXGRAM_PORT or 3737.

import { createServer, get as httpGet } from 'node:http';
import { createReadStream, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { realpathSync, mkdirSync } from 'node:fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PREFERRED_PORT = Number(process.env.EXGRAM_PORT) || 3737;
const MAX_PORT_PROBE = 20; // try preferred..preferred+20
// Workspace holds one `<slug>.excalidraw` per live diagram. Override with
// $EXGRAM_WORKSPACE so a global install (read-only package dir) can point at a
// writable location instead.
const WORKSPACE = process.env.EXGRAM_WORKSPACE || join(ROOT, 'workspace');
const VIEWER = join(ROOT, 'viewer.html');
const SLUG = /^[a-z0-9][a-z0-9_-]*$/i; // safe slug: no slashes, no dots, no traversal

// Absolute, real path of the workspace this server serves. Used to identify
// ourselves at /whoami so a stale server from a DIFFERENT install/workspace is
// never mistaken for an equivalent one (issue #3). The dir may not exist yet,
// so create it (best effort) before resolving its real path.
const absWorkspace = (() => {
  try {
    mkdirSync(WORKSPACE, { recursive: true });
  } catch {
    /* ignore: realpath below will still resolve as far as it can */
  }
  try {
    return realpathSync(WORKSPACE);
  } catch {
    // Fall back to a best-effort absolute path if realpath fails.
    return join(ROOT, WORKSPACE);
  }
})();

// Version string from the repo root package.json (repo root is parent of lib/).
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

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

// `boundPort` is set once we actually bind, so /whoami reports the real port.
let boundPort = PREFERRED_PORT;

const handler = (req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/health') return send(res, 200, 'ok');
  if (url === '/whoami') {
    return send(
      res,
      200,
      JSON.stringify({ workspace: absWorkspace, version: VERSION, port: boundPort }),
      'application/json',
    );
  }
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
};

// Probe http://127.0.0.1:<port>/whoami. Resolves to the parsed JSON body, or
// null if the request fails / times out / isn't a valid /whoami response.
const probeWhoami = (port) =>
  new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const req = httpGet(
      { host: '127.0.0.1', port, path: '/whoami', timeout: 500 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return done(null);
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          try {
            done(JSON.parse(body));
          } catch {
            done(null);
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      done(null);
    });
    req.on('error', () => done(null));
  });

// Try to bind `port` on loopback. Resolves true on success (and sets up the
// server), 'inuse' if EADDRINUSE, or rejects on any other error.
const tryBind = (server, port) =>
  new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE') return resolve('inuse');
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(true);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    // Bind to loopback only: scenes may contain a private architecture, so they
    // must not be reachable from other machines on the network.
    server.listen(port, '127.0.0.1');
  });

const start = async () => {
  const server = createServer(handler);

  for (let port = PREFERRED_PORT; port <= PREFERRED_PORT + MAX_PORT_PROBE; port++) {
    let result;
    try {
      result = await tryBind(server, port);
    } catch (err) {
      console.error(`exgram: failed to bind port ${port}: ${err.message}`);
      process.exit(1);
    }

    if (result === true) {
      // We own this port. Record it and publish the URL for this workspace.
      boundPort = port;
      const base = `http://localhost:${port}`;
      try {
        writeFileSync(join(WORKSPACE, '.exgram-url'), base);
      } catch (err) {
        console.error(`exgram: warning, could not write .exgram-url: ${err.message}`);
      }
      console.error(`exgram: viewer on ${base}`);
      return;
    }

    // Port in use: is it an equivalent exgram serving OUR workspace?
    const who = await probeWhoami(port);
    if (who && who.workspace === absWorkspace) {
      // An equivalent server already serves this workspace; reuse it. It already
      // wrote the correct .exgram-url, so do not overwrite it.
      console.error(`exgram: viewer already serving this workspace on http://localhost:${port}`);
      process.exit(0);
    }
    // Different workspace (or no answer): move on to the next candidate port.
    console.error(`exgram: port ${port} in use by another workspace, trying ${port + 1}`);
  }

  console.error(
    `exgram: no free port in ${PREFERRED_PORT}..${PREFERRED_PORT + MAX_PORT_PROBE} for this workspace`,
  );
  process.exit(1);
};

start();
