import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'serve.mjs');

// Spin up serve.mjs against a temp workspace/port and wait until /health answers.
// Resolves with { port, child, ws } so the caller can hit the API and tear down.
async function startServer(ws, port) {
  const child = spawn(process.execPath, [SERVE], {
    env: { ...process.env, EXGRAM_WORKSPACE: ws, EXGRAM_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  // Poll /health (server picks the preferred port first since it's free).
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return { port, child };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('server did not start');
}

// A real board on disk is a .json spec + a built .excalidraw render.
function makeBoard(ws, slug) {
  writeFileSync(join(ws, `${slug}.json`), JSON.stringify({ title: slug, nodes: [] }));
  writeFileSync(join(ws, `${slug}.excalidraw`), JSON.stringify({ type: 'excalidraw', elements: [] }));
}

const rename = (port, body) =>
  fetch(`http://127.0.0.1:${port}/api/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('POST /api/rename moves both files and rejects bad/dup/missing renames', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-rename-'));
  // A free, non-default port so we never collide with a real running server.
  const port = 38100 + Math.floor(Math.random() * 400);
  let server;
  try {
    makeBoard(ws, 'alpha');
    makeBoard(ws, 'beta');
    server = await startServer(ws, port);

    // happy path: alpha -> gamma moves both files
    let res = await rename(port, { from: 'alpha', to: 'gamma' });
    assert.equal(res.status, 200);
    assert.ok(!existsSync(join(ws, 'alpha.excalidraw')), 'old render gone');
    assert.ok(!existsSync(join(ws, 'alpha.json')), 'old spec gone');
    assert.ok(existsSync(join(ws, 'gamma.excalidraw')), 'new render present');
    assert.ok(existsSync(join(ws, 'gamma.json')), 'new spec present');

    // duplicate target -> 409 (beta still exists)
    res = await rename(port, { from: 'gamma', to: 'beta' });
    assert.equal(res.status, 409);

    // invalid slug -> 400
    res = await rename(port, { from: 'gamma', to: 'bad slug!' });
    assert.equal(res.status, 400);

    // missing source -> 404
    res = await rename(port, { from: 'doesnotexist', to: 'whatever' });
    assert.equal(res.status, 404);

    // hand-made board (render only, no spec) renames fine
    writeFileSync(join(ws, 'handmade.excalidraw'), JSON.stringify({ type: 'excalidraw', elements: [] }));
    res = await rename(port, { from: 'handmade', to: 'crafted' });
    assert.equal(res.status, 200);
    assert.ok(existsSync(join(ws, 'crafted.excalidraw')));
    assert.ok(!existsSync(join(ws, 'crafted.json')), 'no spec is created for a render-only board');
  } finally {
    if (server) server.child.kill();
    rmSync(ws, { recursive: true, force: true });
  }
});
