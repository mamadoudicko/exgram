#!/usr/bin/env node
// exgram — tiny static server for the live viewer.
// Serves the viewer at `/`, a list of diagrams at `/api/diagrams`, and each
// scene at `/scene/<slug>.excalidraw`, all with no-store headers so the browser
// always sees the latest build. One server hosts many live boards.
// Pure Node built-ins. Port: $EXGRAM_PORT or 3737.

import { createServer, get as httpGet } from 'node:http';
import { createReadStream, existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { realpathSync, mkdirSync } from 'node:fs';
import { resolveWorkspace } from './workspace.mjs';
import { duplicateBoard, DuplicateError } from './duplicate.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PREFERRED_PORT = Number(process.env.EXGRAM_PORT) || 3737;
const MAX_PORT_PROBE = 20; // try preferred..preferred+20
// Workspace holds one `<slug>.excalidraw` per live diagram. It lives OUTSIDE the
// package dir by default (~/.exgram/workspace) so `npx skills update`, which
// mirrors the package and prunes untracked files, can never wipe user boards.
// Override with $EXGRAM_WORKSPACE (e.g. a repo checkout for local dev). See
// lib/workspace.mjs.
const WORKSPACE = resolveWorkspace();
const VIEWER = join(ROOT, 'viewer.html');
const ASSETS = join(ROOT, 'assets'); // bundled static brand assets (e.g. the wordmark)
// Static asset content types (brand assets only; small, fixed allowlist).
const ASSET_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const SLUG = /^[a-z0-9][a-z0-9_-]*$/i; // safe slug: no slashes, no dots, no traversal
// Cap the save body so a runaway/abusive client can't exhaust memory. A real
// hand-edited scene is well under this; loopback-only access keeps the risk low,
// but a hard ceiling is still cheap insurance.
const MAX_SAVE_BYTES = 8 * 1024 * 1024; // 8 MB

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

// Read a small request body (POST JSON) without any dependency. Caps the size
// so a malicious local client can't make us buffer unbounded memory; the only
// bodies we accept are tiny `{ from, to }` rename payloads.
const readJsonBody = (req, max = 4096) =>
  new Promise((resolve) => {
    let body = '';
    let aborted = false;
    req.setEncoding('utf8');
    req.on('data', (c) => {
      if (aborted) return;
      body += c;
      if (body.length > max) {
        aborted = true;
        resolve(null); // too big -> treat as malformed
      }
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });

// Derive created/updated timestamps for a board from its two files
// (<slug>.json spec + <slug>.excalidraw render). The .json may be absent for
// hand-made boards, so we only consider files that exist.
//   created = earliest birthtimeMs of the present files; if birthtime is
//             missing/0/unreliable we fall back to that file's mtimeMs.
//   updated = latest mtimeMs of the present files.
// We never report created later than updated (clamp). On any stat failure we
// return null timestamps so the board still appears in the list.
const boardTimes = (slug) => {
  const created = [];
  const updated = [];
  for (const ext of ['.json', '.excalidraw']) {
    const f = join(WORKSPACE, slug + ext);
    let st;
    try {
      st = statSync(f);
    } catch {
      continue; // file absent or unreadable -> skip it
    }
    const mtime = Number(st.mtimeMs) || 0;
    // birthtime can be 0/unreliable on some filesystems; fall back to mtime.
    const birth = Number(st.birthtimeMs) > 0 ? Number(st.birthtimeMs) : mtime;
    if (birth > 0) created.push(birth);
    if (mtime > 0) updated.push(mtime);
  }
  let createdMs = created.length ? Math.min(...created) : null;
  const updatedMs = updated.length ? Math.max(...updated) : null;
  // Never report a creation later than the last edit.
  if (createdMs != null && updatedMs != null && createdMs > updatedMs) {
    createdMs = updatedMs;
  }
  return { created: createdMs, updated: updatedMs };
};

// List existing diagrams in the workspace as objects carrying creation +
// last-edited timestamps: [{ slug, created, updated }]. The render
// (<slug>.excalidraw) is the source of truth for "a board exists". Slugs stay
// sorted as a stable default (the viewer re-sorts client-side).
const listDiagrams = () => {
  try {
    return readdirSync(WORKSPACE)
      .filter((f) => f.endsWith('.excalidraw'))
      .map((f) => f.slice(0, -'.excalidraw'.length))
      .sort()
      .map((slug) => {
        try {
          const { created, updated } = boardTimes(slug);
          return { slug, created, updated };
        } catch {
          // Resilient: a board whose files can't be statted still appears.
          return { slug, created: null, updated: null };
        }
      });
  } catch {
    return [];
  }
};

// `boundPort` is set once we actually bind, so /whoami reports the real port.
let boundPort = PREFERRED_PORT;

const handler = async (req, res) => {
  const url = (req.url || '/').split('?')[0];

  // Rename a board: moves both <from>.json and <from>.excalidraw to <to>.*.
  // Loopback-only + slug guard already protect against traversal / remote access.
  if (req.method === 'POST' && url === '/api/rename') {
    const body = await readJsonBody(req);
    const from = body && typeof body.from === 'string' ? body.from : '';
    const to = body && typeof body.to === 'string' ? body.to : '';
    if (!SLUG.test(from) || !SLUG.test(to)) return send(res, 400, 'bad slug');
    if (from === to) return send(res, 400, 'same slug');
    // The render is the source of truth for "a board exists"; the .json may be
    // absent for hand-made boards.
    if (!existsSync(join(WORKSPACE, `${from}.excalidraw`))) return send(res, 404, 'no such board');
    // Refuse to clobber an existing board under the target name.
    if (existsSync(join(WORKSPACE, `${to}.excalidraw`)) || existsSync(join(WORKSPACE, `${to}.json`))) {
      return send(res, 409, 'target board already exists');
    }
    try {
      // Rename the render always, and the spec only when present.
      renameSync(join(WORKSPACE, `${from}.excalidraw`), join(WORKSPACE, `${to}.excalidraw`));
      if (existsSync(join(WORKSPACE, `${from}.json`))) {
        renameSync(join(WORKSPACE, `${from}.json`), join(WORKSPACE, `${to}.json`));
      }
    } catch (err) {
      return send(res, 500, `rename failed: ${err.message}`);
    }
    return send(res, 200, 'renamed');
  }

  // Duplicate a board: copies both <from>.json and <from>.excalidraw to <to>.*,
  // leaving the original untouched. Validation (slug shape, source exists,
  // target free) lives in the shared duplicateBoard core so the CLI and this
  // endpoint behave identically. Loopback-only + slug guard cover traversal.
  if (req.method === 'POST' && url === '/api/duplicate') {
    const body = await readJsonBody(req);
    const from = body && typeof body.from === 'string' ? body.from : '';
    const to = body && typeof body.to === 'string' ? body.to : '';
    try {
      duplicateBoard(from, to, { workspace: WORKSPACE });
      return send(res, 200, 'duplicated');
    } catch (err) {
      if (err instanceof DuplicateError) {
        // Map the core's error codes onto HTTP statuses (mirrors /api/rename).
        const status = { 'bad-slug': 400, 'same-slug': 400, 'not-found': 404, exists: 409, io: 500 }[err.code] || 500;
        return send(res, status, err.message);
      }
      return send(res, 500, `duplicate failed: ${err.message}`);
    }
  }

  // Delete a board: removes both its render and its spec. Loopback-only + slug
  // guard already protect against traversal / remote access.
  if (req.method === 'DELETE' && url.startsWith('/scene/')) {
    const slug = decodeURIComponent(url.slice('/scene/'.length)).replace(/\.excalidraw$/, '');
    if (!SLUG.test(slug)) return send(res, 400, 'bad slug');
    for (const ext of ['.excalidraw', '.json']) {
      const f = join(WORKSPACE, slug + ext);
      try { if (existsSync(f)) unlinkSync(f); } catch { /* ignore */ }
    }
    return send(res, 200, 'deleted');
  }

  // Persist hand edits: the viewer (in ?edit=1 mode) PUTs the current scene back
  // so manual canvas changes survive a reload. We write the body VERBATIM to
  // <slug>.excalidraw — the viewer already serializes a valid Excalidraw scene.
  // NOTE: a fresh `node lib/build.mjs <spec>` still regenerates this file from
  // the spec and will overwrite these hand edits; a spec/overlay merge is a
  // deeper follow-up (see references/architecture.md).
  if ((req.method === 'PUT' || req.method === 'POST') && url.startsWith('/scene/')) {
    const slug = decodeURIComponent(url.slice('/scene/'.length)).replace(/\.excalidraw$/, '');
    if (!SLUG.test(slug)) return send(res, 400, 'bad slug');
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_SAVE_BYTES) {
        // Too big: stop reading and reject. 413 = Payload Too Large.
        aborted = true;
        send(res, 413, 'scene too large');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const buf = Buffer.concat(chunks);
      // Reject anything that isn't a parseable Excalidraw scene BEFORE writing, so
      // a malformed/truncated PUT can never corrupt the render file (which would
      // then fail JSON.parse in the viewer and blank the board).
      try {
        const scene = JSON.parse(buf.toString('utf8'));
        if (!scene || typeof scene !== 'object' || !Array.isArray(scene.elements)) {
          return send(res, 400, 'not an excalidraw scene');
        }
      } catch {
        return send(res, 400, 'invalid json');
      }
      try {
        writeFileSync(join(WORKSPACE, `${slug}.excalidraw`), buf);
        send(res, 200, 'saved');
      } catch (err) {
        send(res, 500, `save failed: ${err.message}`);
      }
    });
    req.on('error', () => {
      if (!aborted) send(res, 400, 'read error');
    });
    return;
  }

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
  // Bundled static brand assets (the dogfooded wordmark, favicon). Read-only, a
  // strict filename guard (no slashes/dots) keeps this inside the assets dir.
  if (url.startsWith('/assets/')) {
    const name = decodeURIComponent(url.slice('/assets/'.length));
    const ext = name.slice(name.lastIndexOf('.'));
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name) || name.includes('..') || !ASSET_TYPES[ext]) {
      return send(res, 400, 'bad asset');
    }
    const f = join(ASSETS, name);
    return existsSync(f) ? stream(res, f, ASSET_TYPES[ext]) : send(res, 404, 'asset not found');
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
