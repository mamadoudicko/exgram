import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { get as httpGet, request as httpRequest } from 'node:http';
import { mkdtempSync, rmSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVE = join(HERE, '..', 'lib', 'serve.mjs');
const REAL_VERSION = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).version;

// A stand-in for a previously-running exgram server, so we can simulate version
// skew without shipping an old build. Reports a configurable version (and
// optionally a pid) on /whoami, and either supports graceful /api/shutdown or
// refuses it — letting each test isolate one eviction path.
const STUB = `
const http = require('http');
const ws = process.env.STUB_WS, ver = process.env.STUB_VER, port = Number(process.env.STUB_PORT);
const withPid = process.env.STUB_PID === '1', graceful = process.env.STUB_GRACEFUL === '1';
const srv = http.createServer((req, res) => {
  if (req.url === '/whoami') {
    const p = { workspace: ws, version: ver, port, stub: true };
    if (withPid) p.pid = process.pid;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(p));
  }
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (req.method === 'POST' && req.url === '/api/shutdown') {
    if (graceful) { res.writeHead(200); res.end('bye'); return srv.close(() => process.exit(0)); }
    res.writeHead(404); return res.end('no shutdown');
  }
  res.writeHead(404); res.end('nf');
});
srv.listen(port, '127.0.0.1');
`;

// Poll with raw http (agent: false → no keep-alive) rather than fetch. This
// scenario evicts one process and binds a NEW one on the SAME port; undici
// (Node 18's fetch) pools the keep-alive socket to the dead process and the
// first reuse throws ECONNRESET, which made these tests flake on Node 18. Raw,
// connection-per-request http mirrors what serve.mjs's own probeWhoami uses.
const httpGetText = (port, path) =>
  new Promise((resolve) => {
    const req = httpGet({ host: '127.0.0.1', port, path, timeout: 500, agent: false }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });

// Raw POST returning the status code (agent: false → no pooling). `headers`
// lets a test simulate a browser by sending an Origin.
const httpPostStatus = (port, path, headers = {}) =>
  new Promise((resolve) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'POST', timeout: 500, agent: false, headers },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });

const whoami = async (port) => {
  const body = await httpGetText(port, '/whoami');
  if (body == null) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const waitFor = async (fn, ms = 6000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
};

// Boot the stub on `port` against `ws` and wait until it answers.
async function startStub(ws, port, { version, pid = false, graceful = false }) {
  const child = spawn(process.execPath, ['-e', STUB], {
    env: {
      ...process.env,
      STUB_WS: realpathSync(ws),
      STUB_PORT: String(port),
      STUB_VER: version,
      STUB_PID: pid ? '1' : '0',
      STUB_GRACEFUL: graceful ? '1' : '0',
    },
    stdio: 'ignore',
  });
  const up = await waitFor(async () => (await httpGetText(port, '/health')) === 'ok');
  if (!up) { child.kill(); throw new Error('stub did not start'); }
  return child;
}

function startReal(ws, port) {
  return spawn(process.execPath, [SERVE], {
    env: { ...process.env, EXGRAM_WORKSPACE: ws, EXGRAM_PORT: String(port) },
    stdio: 'ignore',
  });
}

test('a newer server EVICTS a stale same-workspace one via graceful /api/shutdown', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-handoff-'));
  // Disjoint from serve-rename [38100,38499], serve-duplicate [38600,38999],
  // and the other handoff tests (39000/39100) — node --test runs files
  // concurrently and the stub has no port-fallback, so bands must not overlap.
  const port = 39200 + Math.floor(Math.random() * 80);
  let stub, real;
  try {
    // Stale stub: old version, NO pid -> the ONLY way to evict it is /api/shutdown.
    stub = await startStub(ws, port, { version: '0.0.0-stale', pid: false, graceful: true });
    real = startReal(ws, port);
    // The real server should take the port over and now answer with REAL_VERSION.
    const who = await waitFor(async () => {
      const w = await whoami(port);
      return w && w.version === REAL_VERSION && !w.stub ? w : null;
    });
    assert.ok(who, 'real server took over the port and reports its own version');
    assert.equal(who.version, REAL_VERSION);
  } finally {
    if (real) real.kill();
    if (stub) stub.kill();
    rmSync(ws, { recursive: true, force: true });
  }
});

test('a newer server EVICTS a stale one via SIGTERM when graceful shutdown is unavailable', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-handoff-'));
  const port = 39000 + Math.floor(Math.random() * 80);
  let stub, real;
  try {
    // Stale stub: old version, advertises a pid, REFUSES /api/shutdown (404) ->
    // the only way to evict it is SIGTERM-by-pid.
    stub = await startStub(ws, port, { version: '0.0.0-stale', pid: true, graceful: false });
    real = startReal(ws, port);
    const who = await waitFor(async () => {
      const w = await whoami(port);
      return w && w.version === REAL_VERSION && !w.stub ? w : null;
    });
    assert.ok(who, 'real server evicted the stale one via SIGTERM and took the port');
    assert.equal(who.version, REAL_VERSION);
  } finally {
    if (real) real.kill();
    if (stub) stub.kill();
    rmSync(ws, { recursive: true, force: true });
  }
});

test('a same-version same-workspace server is REUSED, not evicted (new process exits 0)', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-handoff-'));
  const port = 39100 + Math.floor(Math.random() * 80);
  let stub, real;
  try {
    // Equivalent server: SAME version, same workspace. The new process must yield.
    stub = await startStub(ws, port, { version: REAL_VERSION, pid: true, graceful: true });
    real = startReal(ws, port);
    const code = await new Promise((resolve) => real.on('exit', resolve));
    real = null;
    assert.equal(code, 0, 'the freshly-spawned server reused the equivalent one and exited 0');
    // The stub is still in charge (was not shut down).
    const w = await whoami(port);
    assert.ok(w && w.stub === true, 'the original (stub) server is still serving the port');
  } finally {
    if (real) real.kill();
    if (stub) stub.kill();
    rmSync(ws, { recursive: true, force: true });
  }
});

test('/api/shutdown ignores browser-originated POSTs (Origin) but obeys same-process callers', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-handoff-'));
  const port = 39300 + Math.floor(Math.random() * 80);
  let real;
  try {
    real = startReal(ws, port);
    const up = await waitFor(async () => {
      const w = await whoami(port);
      return w && w.version === REAL_VERSION ? w : null;
    });
    assert.ok(up, 'real server is up');

    // A cross-origin browser POST (carries Origin) must be refused, and the
    // server must survive it — otherwise any visited site could kill the board.
    assert.equal(await httpPostStatus(port, '/api/shutdown', { origin: 'http://evil.example' }), 403);
    assert.equal(await httpGetText(port, '/health'), 'ok', 'server survived the cross-origin shutdown');

    // A same-process caller (no Origin, as start() sends) shuts it down.
    assert.equal(await httpPostStatus(port, '/api/shutdown', {}), 200);
    const down = await waitFor(async () => ((await httpGetText(port, '/health')) === null ? true : null));
    assert.ok(down, 'server shut down on a no-Origin POST');
  } finally {
    if (real) real.kill();
    rmSync(ws, { recursive: true, force: true });
  }
});
