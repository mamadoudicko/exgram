# Security Policy

## Reporting a vulnerability

If you find a security issue in exgram, please report it privately rather than opening a public
issue. Use GitHub's **"Report a vulnerability"** (Security advisories) on this repository, or email
the maintainer. We aim to acknowledge reports within a few days.

Please include: what the issue is, how to reproduce it, and the potential impact.

## Scope and design notes

exgram is a local-only developer tool. A few properties are intentional and worth knowing:

- **The local server binds to `127.0.0.1` only.** Your diagrams (which may describe private
  architecture) are not exposed to other machines on the network.
- **No data leaves your machine.** Only the Excalidraw *library* is loaded from a public CDN
  (esm.sh) by the viewer. Your spec and scene files never leave localhost.
- **The skill runs code.** As an agent skill, exgram has the agent run bundled Node scripts
  (`lib/build.mjs`, `lib/serve.mjs`, `lib/open.mjs`). These use only Node built-ins and take no
  untrusted network input. The skill's `allowed-tools` are scoped to `node`/`curl` plus file
  read/write. Review the scripts before installing if your environment is sensitive.
- **Scene file serving is path-guarded.** `serve.mjs` only serves `<slug>.excalidraw` files whose
  slug matches `^[a-z0-9][a-z0-9_-]*$`, so it cannot read arbitrary files via path traversal.

## Supported versions

Fixes are applied to the latest release on the default branch.
