import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { get as httpGet, request as httpRequest } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'serve.mjs');

// Boot serve.mjs on a fresh temp workspace + a high port, and wait until it
// answers /health. Returns { proc, port, workspace, stop() }.
function startServer() {
  const workspace = mkdtempSync(join(tmpdir(), 'exgram-serve-'));
  // A non-default port so we never collide with a real running exgram.
  const port = 3900 + Math.floor(Math.random() * 80);
  const proc = spawn(process.execPath, [SERVE], {
    env: { ...process.env, EXGRAM_WORKSPACE: workspace, EXGRAM_PORT: String(port) },
    stdio: 'ignore',
  });
  return { proc, port, workspace, stop() { try { proc.kill(); } catch {} rmSync(workspace, { recursive: true, force: true }); } };
}

const waitForHealth = (port, tries = 40) =>
  new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = httpGet({ host: '127.0.0.1', port, path: '/health', timeout: 300 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry(n);
      });
      req.on('error', () => retry(n));
      req.on('timeout', () => { req.destroy(); retry(n); });
    };
    const retry = (n) => {
      if (n <= 0) return reject(new Error('server never became healthy'));
      setTimeout(() => attempt(n - 1), 100);
    };
    attempt(tries);
  });

// Tiny PUT/GET helpers over loopback (built-ins only, mirrors serve.mjs style).
const putScene = (port, slug, body) =>
  new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: `/scene/${slug}.excalidraw`, method: 'PUT', timeout: 1000,
        headers: { 'Content-Type': 'application/json' } },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); },
    );
    req.on('error', reject);
    req.end(body);
  });

const getScene = (port, slug) =>
  new Promise((resolve, reject) => {
    const req = httpGet({ host: '127.0.0.1', port, path: `/scene/${slug}.excalidraw?t=${Date.now()}`, timeout: 1000 }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
  });

test('PUT /scene/<slug>.excalidraw persists the scene and GET reads it back', async () => {
  const srv = startServer();
  try {
    await waitForHealth(srv.port);
    const scene = JSON.stringify({
      type: 'excalidraw', version: 2, source: 'test',
      elements: [{ id: 'hand-edited-rect', type: 'rectangle' }],
      appState: { viewBackgroundColor: '#ffffff' }, files: {},
    });
    const code = await putScene(srv.port, 'persist-demo', scene);
    assert.equal(code, 200);

    const got = await getScene(srv.port, 'persist-demo');
    assert.equal(got.status, 200);
    const parsed = JSON.parse(got.body);
    // The hand-edited element survived the round trip verbatim.
    assert.equal(parsed.elements[0].id, 'hand-edited-rect');
  } finally {
    srv.stop();
  }
});

test('PUT with a bad slug is rejected (400)', async () => {
  const srv = startServer();
  try {
    await waitForHealth(srv.port);
    // A leading dot fails the SLUG regex (no traversal / dotfiles).
    const code = await putScene(srv.port, '.hidden', '{}');
    assert.equal(code, 400);
  } finally {
    srv.stop();
  }
});

test('PUT with malformed JSON is rejected (400) and never corrupts a good render', async () => {
  const srv = startServer();
  try {
    await waitForHealth(srv.port);
    const good = JSON.stringify({
      type: 'excalidraw', version: 2, source: 'test',
      elements: [{ id: 'keep-me', type: 'rectangle' }],
      appState: { viewBackgroundColor: '#ffffff' }, files: {},
    });
    assert.equal(await putScene(srv.port, 'guard', good), 200);

    // A truncated/garbage body must be refused before it can overwrite the file.
    assert.equal(await putScene(srv.port, 'guard', '{ "elements": ['), 400);
    // Valid JSON but not a scene (no elements array) is also refused.
    assert.equal(await putScene(srv.port, 'guard', '{"hello":"world"}'), 400);

    // The previously-saved good scene is still intact and parseable.
    const got = await getScene(srv.port, 'guard');
    assert.equal(got.status, 200);
    assert.equal(JSON.parse(got.body).elements[0].id, 'keep-me');
  } finally {
    srv.stop();
  }
});
