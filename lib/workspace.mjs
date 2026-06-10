#!/usr/bin/env node
// exgram — resolve the directory where user boards (specs + renders) live.
//
// Boards must NOT live inside the package directory. `npx skills update` (and
// most skill installers) mirror the source repo into the installed package and
// DELETE anything not tracked in git. The workspace holds only an untracked
// `.gitkeep`, so every user-created board there is wiped on update. Storing
// boards in a per-user data directory OUTSIDE the package keeps them safe.
//
// Resolution order:
//   1. $EXGRAM_WORKSPACE  (explicit override — point it at XDG/APPDATA, a repo
//      checkout for local dev, a shared folder, etc.)
//   2. ~/.exgram/workspace  (default: simple, predictable, survives updates)
//
// As a module:  import { resolveWorkspace } from './workspace.mjs'
// As a CLI:     node lib/workspace.mjs   # prints the resolved absolute path
//               (so shell snippets can capture it: WS="$(node lib/workspace.mjs)")

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isMain } from './cli.mjs';

// Per-user data dir, deliberately outside any package install. Override with
// $EXGRAM_WORKSPACE if you prefer XDG (~/.local/share) or APPDATA conventions.
export const DEFAULT_WORKSPACE = join(homedir(), '.exgram', 'workspace');

/**
 * Resolve the workspace directory, creating it if needed.
 * @param {{ ensure?: boolean }} [opts] ensure: mkdir -p the dir (default true)
 * @returns {string} absolute workspace path
 */
export function resolveWorkspace({ ensure = true } = {}) {
  const dir = process.env.EXGRAM_WORKSPACE || DEFAULT_WORKSPACE;
  if (ensure) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      /* best effort: the caller still gets a usable path */
    }
  }
  return dir;
}

// CLI mode: print the resolved path so the SKILL.md workflow can capture it.
// isMain() (not a raw string compare) so this still fires under symlinked installs.
if (isMain(import.meta.url)) {
  process.stdout.write(resolveWorkspace() + '\n');
}
