import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib');

// Reproduces how `npx skills` installs the skill: the script is reached through a
// symlink, so process.argv[1] (the link) differs from import.meta.url (the real
// path). A raw-string entry-point guard fails here; isMain() must still fire.
test('workspace.mjs CLI runs when invoked via a symlink (npx skills install case)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exgram-symlink-'));
  try {
    const link = join(dir, 'workspace.mjs');
    symlinkSync(realpathSync(join(LIB, 'workspace.mjs')), link);
    const out = execFileSync(process.execPath, [link], {
      encoding: 'utf8',
      env: { ...process.env, EXGRAM_WORKSPACE: '/tmp/exgram-symlink-probe' },
    }).trim();
    assert.equal(out, '/tmp/exgram-symlink-probe');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// And it still runs the normal (non-symlinked) way.
test('workspace.mjs CLI runs when invoked directly', () => {
  const out = execFileSync(process.execPath, [join(LIB, 'workspace.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, EXGRAM_WORKSPACE: '/tmp/exgram-direct-probe' },
  }).trim();
  assert.equal(out, '/tmp/exgram-direct-probe');
});
