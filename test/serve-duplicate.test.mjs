import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'serve.mjs');

// Spin up serve.mjs against a temp workspace/port and wait until /health answers.
async function startServer(ws, port) {
  const child = spawn(process.execPath, [SERVE], {
    env: { ...process.env, EXGRAM_WORKSPACE: ws, EXGRAM_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
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

const duplicate = (port, body) =>
  fetch(`http://127.0.0.1:${port}/api/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('POST /api/duplicate copies both files, leaves the original, rejects bad/dup/missing', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-dup-'));
  const port = 38600 + Math.floor(Math.random() * 400);
  let server;
  try {
    makeBoard(ws, 'alpha');
    makeBoard(ws, 'beta');
    server = await startServer(ws, port);

    // happy path: alpha -> alpha-copy copies both files AND keeps the original
    let res = await duplicate(port, { from: 'alpha', to: 'alpha-copy' });
    assert.equal(res.status, 200);
    assert.ok(existsSync(join(ws, 'alpha.excalidraw')), 'original render untouched');
    assert.ok(existsSync(join(ws, 'alpha.json')), 'original spec untouched');
    assert.ok(existsSync(join(ws, 'alpha-copy.excalidraw')), 'copy render present');
    assert.ok(existsSync(join(ws, 'alpha-copy.json')), 'copy spec present');
    // byte-for-byte copy of the spec
    assert.equal(
      readFileSync(join(ws, 'alpha-copy.json'), 'utf8'),
      readFileSync(join(ws, 'alpha.json'), 'utf8'),
    );

    // duplicate target -> 409 (beta still exists)
    res = await duplicate(port, { from: 'alpha', to: 'beta' });
    assert.equal(res.status, 409);

    // same source and target -> 400
    res = await duplicate(port, { from: 'alpha', to: 'alpha' });
    assert.equal(res.status, 400);

    // invalid slug -> 400
    res = await duplicate(port, { from: 'alpha', to: 'bad slug!' });
    assert.equal(res.status, 400);

    // missing source -> 404
    res = await duplicate(port, { from: 'doesnotexist', to: 'whatever' });
    assert.equal(res.status, 404);

    // hand-made board (render only, no spec) duplicates the render only
    writeFileSync(join(ws, 'handmade.excalidraw'), JSON.stringify({ type: 'excalidraw', elements: [] }));
    res = await duplicate(port, { from: 'handmade', to: 'handmade-copy' });
    assert.equal(res.status, 200);
    assert.ok(existsSync(join(ws, 'handmade-copy.excalidraw')));
    assert.ok(!existsSync(join(ws, 'handmade-copy.json')), 'no spec is created for a render-only board');
  } finally {
    if (server) server.child.kill();
    rmSync(ws, { recursive: true, force: true });
  }
});
