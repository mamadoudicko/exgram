// exgram — detect whether a module is the process entry point, robustly across
// symlinked installs.
//
// `npx skills` installs skills by SYMLINK by default, so a script's real path
// (`import.meta.url`, which Node resolves through symlinks) and the invocation
// path (`process.argv[1]`, the symlink) differ by exactly that symlink. The
// naive guard `import.meta.url === \`file://${process.argv[1]}\`` then never
// matches, so the CLI body silently doesn't run (e.g. `node lib/workspace.mjs`
// prints nothing, `node lib/build.mjs` does nothing). Comparing REAL paths fixes
// it: a symlinked invocation still resolves to the same target.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * True when `importMetaUrl` is the module Node was launched with.
 * @param {string} importMetaUrl  the caller's `import.meta.url`
 * @returns {boolean}
 */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(importMetaUrl);
  try {
    return realpathSync(self) === realpathSync(entry);
  } catch {
    // realpath can throw if a path no longer exists; fall back to raw compare.
    return self === entry;
  }
}
