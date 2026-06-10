#!/usr/bin/env node
// exgram — cross-platform "open this URL/file in the default app".
// usage: node lib/open.mjs <url>

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

const target = process.argv[2];
if (!target) {
  console.error('usage: node lib/open.mjs <url>');
  process.exit(1);
}

const [cmd, args] = (() => {
  switch (platform()) {
    case 'darwin': return ['open', [target]];
    case 'win32': return ['cmd', ['/c', 'start', '', target]];
    default: return ['xdg-open', [target]]; // linux & others
  }
})();

const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
child.on('error', (err) => {
  console.error(`exgram: could not open browser (${err.message}). Open ${target} manually.`);
  process.exit(0);
});
child.unref();
