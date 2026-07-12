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

const create = (port, body) =>
  fetch(`http://127.0.0.1:${port}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('POST /api/create writes a blank scene (no .json), rejects bad slug and duplicates', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-create-'));
  const port = 38200 + Math.floor(Math.random() * 400);
  let server;
  try {
    server = await startServer(ws, port);

    // happy path: creates a valid, blank .excalidraw scene and NO .json spec
    let res = await create(port, { slug: 'fresh' });
    assert.equal(res.status, 200);
    assert.ok(existsSync(join(ws, 'fresh.excalidraw')), 'render written');
    assert.ok(!existsSync(join(ws, 'fresh.json')), 'no spec file created');
    const scene = JSON.parse(readFileSync(join(ws, 'fresh.excalidraw'), 'utf8'));
    assert.equal(scene.type, 'excalidraw');
    assert.ok(Array.isArray(scene.elements), 'scene has an elements array');
    assert.equal(scene.elements.length, 0, 'the scene is blank');

    // creating over an existing board -> 409
    res = await create(port, { slug: 'fresh' });
    assert.equal(res.status, 409);

    // 409 also fires when only a spec (no render) exists under the name
    writeFileSync(join(ws, 'specOnly.json'), JSON.stringify({ title: 'specOnly', nodes: [] }));
    res = await create(port, { slug: 'specOnly' });
    assert.equal(res.status, 409);

    // invalid slug -> 400 (and nothing written)
    res = await create(port, { slug: 'bad slug!' });
    assert.equal(res.status, 400);

    // missing/empty slug -> 400
    res = await create(port, {});
    assert.equal(res.status, 400);
  } finally {
    if (server) server.child.kill();
    rmSync(ws, { recursive: true, force: true });
  }
});
