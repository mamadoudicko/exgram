import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWorkspace, DEFAULT_WORKSPACE } from '../lib/workspace.mjs';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Run with EXGRAM_WORKSPACE unset, restoring whatever was there.
function withEnv(value, fn) {
  const prev = process.env.EXGRAM_WORKSPACE;
  if (value === undefined) delete process.env.EXGRAM_WORKSPACE;
  else process.env.EXGRAM_WORKSPACE = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.EXGRAM_WORKSPACE;
    else process.env.EXGRAM_WORKSPACE = prev;
  }
}

test('resolveWorkspace honors $EXGRAM_WORKSPACE', () => {
  withEnv('/tmp/custom-exgram-ws', () => {
    assert.equal(resolveWorkspace({ ensure: false }), '/tmp/custom-exgram-ws');
  });
});

test('default workspace is ~/.exgram/workspace', () => {
  withEnv(undefined, () => {
    const ws = resolveWorkspace({ ensure: false });
    assert.equal(ws, DEFAULT_WORKSPACE);
    assert.equal(ws, join(homedir(), '.exgram', 'workspace'));
  });
});

test('default workspace lives OUTSIDE the package dir (so updates cannot wipe boards)', () => {
  withEnv(undefined, () => {
    const ws = resolveWorkspace({ ensure: false });
    assert.ok(
      !ws.startsWith(PKG_ROOT + '/'),
      `workspace ${ws} must not be inside the package dir ${PKG_ROOT}`,
    );
  });
});
