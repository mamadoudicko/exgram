#!/usr/bin/env node
// exgram — duplicate a board (fork a diagram) under a new slug.
//
// A board on disk is up to two files in the workspace:
//   <slug>.json        the spec (absent for hand-made/render-only boards)
//   <slug>.excalidraw  the built render (source of truth for "a board exists")
//
// Duplicating copies BOTH files to a new, free slug, leaving the original
// untouched — so you can fork a diagram and iterate on the copy. The same core
// (duplicateBoard) backs the server's POST /api/duplicate and this CLI, so the
// validation rules stay identical in both places.
//
// As a module:  import { duplicateBoard } from './duplicate.mjs'
// As a CLI:     node lib/duplicate.mjs <slug> <new-slug>

import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveWorkspace } from './workspace.mjs';
import { isMain } from './cli.mjs';

// Same slug rule the server (lib/serve.mjs SLUG) and viewer (SLUG_RE) enforce:
// no slashes, no dots, no traversal. Keep these three in sync.
export const SLUG = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * Error thrown by duplicateBoard, carrying a machine-readable `code` so callers
 * (the server) can map it to an HTTP status without string-matching messages.
 * code ∈ { 'bad-slug', 'same-slug', 'not-found', 'exists', 'io' }
 */
export class DuplicateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DuplicateError';
    this.code = code;
  }
}

/**
 * Copy a board's spec + render from `from` to `to` within `workspace`.
 * Validates that the slugs are well-formed, the source exists, and the target
 * is free. Leaves the original untouched. Throws DuplicateError on any failure.
 *
 * @param {string} from  source slug
 * @param {string} to    target slug (must be free)
 * @param {{ workspace?: string }} [opts]
 * @returns {{ from: string, to: string, copiedSpec: boolean }}
 */
export function duplicateBoard(from, to, { workspace = resolveWorkspace() } = {}) {
  if (!SLUG.test(from) || !SLUG.test(to)) {
    throw new DuplicateError('bad-slug', 'slugs must be letters, digits, dashes or underscores');
  }
  if (from === to) {
    throw new DuplicateError('same-slug', 'source and target slug are the same');
  }
  const srcRender = join(workspace, `${from}.excalidraw`);
  const srcSpec = join(workspace, `${from}.json`);
  // The render is the source of truth for "a board exists"; the .json may be
  // absent for hand-made boards.
  if (!existsSync(srcRender)) {
    throw new DuplicateError('not-found', `no such board: ${from}`);
  }
  // Refuse to clobber an existing board under the target name (either file).
  if (existsSync(join(workspace, `${to}.excalidraw`)) || existsSync(join(workspace, `${to}.json`))) {
    throw new DuplicateError('exists', `target board already exists: ${to}`);
  }
  try {
    copyFileSync(srcRender, join(workspace, `${to}.excalidraw`));
    let copiedSpec = false;
    if (existsSync(srcSpec)) {
      copyFileSync(srcSpec, join(workspace, `${to}.json`));
      copiedSpec = true;
    }
    return { from, to, copiedSpec };
  } catch (err) {
    throw new DuplicateError('io', `copy failed: ${err.message}`);
  }
}

if (isMain(import.meta.url)) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) {
    console.error('usage: node lib/duplicate.mjs <slug> <new-slug>');
    process.exit(1);
  }
  try {
    const { to: newSlug, copiedSpec } = duplicateBoard(from, to);
    console.error(
      `exgram: duplicated "${from}" -> "${newSlug}"` +
        (copiedSpec ? ' (spec + render)' : ' (render only)'),
    );
    process.stdout.write(newSlug + '\n');
  } catch (err) {
    console.error(`exgram: ${err.message}`);
    process.exit(1);
  }
}
