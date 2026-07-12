import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { duplicateBoard, DuplicateError } from '../lib/duplicate.mjs';

const DUP = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'duplicate.mjs');

function makeBoard(ws, slug) {
  writeFileSync(join(ws, `${slug}.json`), JSON.stringify({ title: slug, nodes: [] }));
  writeFileSync(join(ws, `${slug}.excalidraw`), JSON.stringify({ type: 'excalidraw', elements: [] }));
}

test('duplicateBoard copies spec + render and leaves the original intact', () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-dup-lib-'));
  try {
    makeBoard(ws, 'src');
    const out = duplicateBoard('src', 'dst', { workspace: ws });
    assert.deepEqual(out, { from: 'src', to: 'dst', copiedSpec: true });
    assert.ok(existsSync(join(ws, 'src.excalidraw')) && existsSync(join(ws, 'src.json')), 'original kept');
    assert.equal(
      readFileSync(join(ws, 'dst.json'), 'utf8'),
      readFileSync(join(ws, 'src.json'), 'utf8'),
    );
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('duplicateBoard throws coded errors for bad/same/missing/existing slugs', () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-dup-lib-'));
  try {
    makeBoard(ws, 'src');
    makeBoard(ws, 'taken');
    const code = (from, to) => {
      try { duplicateBoard(from, to, { workspace: ws }); return null; }
      catch (e) { assert.ok(e instanceof DuplicateError); return e.code; }
    };
    assert.equal(code('src', 'bad slug!'), 'bad-slug');
    assert.equal(code('src', 'src'), 'same-slug');
    assert.equal(code('nope', 'dst'), 'not-found');
    assert.equal(code('src', 'taken'), 'exists');
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('render-only board duplicates the render without inventing a spec', () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-dup-lib-'));
  try {
    writeFileSync(join(ws, 'hand.excalidraw'), JSON.stringify({ type: 'excalidraw', elements: [] }));
    const out = duplicateBoard('hand', 'hand2', { workspace: ws });
    assert.equal(out.copiedSpec, false);
    assert.ok(existsSync(join(ws, 'hand2.excalidraw')));
    assert.ok(!existsSync(join(ws, 'hand2.json')));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('CLI: node lib/duplicate.mjs <slug> <new-slug> prints the new slug', () => {
  const ws = mkdtempSync(join(tmpdir(), 'exgram-dup-cli-'));
  try {
    makeBoard(ws, 'one');
    const ok = spawnSync(process.execPath, [DUP, 'one', 'two'], {
      env: { ...process.env, EXGRAM_WORKSPACE: ws }, encoding: 'utf8',
    });
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout.trim(), 'two');
    assert.ok(existsSync(join(ws, 'two.excalidraw')) && existsSync(join(ws, 'two.json')));

    // collision exits non-zero
    const bad = spawnSync(process.execPath, [DUP, 'one', 'two'], {
      env: { ...process.env, EXGRAM_WORKSPACE: ws }, encoding: 'utf8',
    });
    assert.notEqual(bad.status, 0);

    // missing args -> usage, non-zero
    const usage = spawnSync(process.execPath, [DUP, 'one'], {
      env: { ...process.env, EXGRAM_WORKSPACE: ws }, encoding: 'utf8',
    });
    assert.notEqual(usage.status, 0);
    assert.match(usage.stderr, /usage:/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});
