# Contributing to exgram

Thanks for your interest! exgram is intentionally tiny and dependency-free — please keep it that way.

## Ground rules
- **No runtime dependencies.** The engine (`skills/exgram/lib/*.mjs`) and tests must run on plain
  Node ≥ 18 built-ins. The viewer may load Excalidraw from a CDN, but don't add a build step or
  `node_modules`.
- **Keep it ESM** (`.mjs`, `import`/`export`).
- **Add a test** for any change to `skills/exgram/lib/build.mjs` in `skills/exgram/test/build.test.mjs`.
- Match the existing style: small functions, clear names, comments only where intent isn't obvious.

## Dev loop
The installable skill lives in `skills/exgram/`. Run these from the repo root:
```bash
npm test                 # delegates into skills/exgram; runs node --test, no install needed
node skills/exgram/lib/build.mjs workspace/spec.json workspace/scene.excalidraw
npm run serve            # preview at http://localhost:3737 (or: node skills/exgram/lib/serve.mjs)
```

## Project layout
- `skills/exgram/` — the installable skill (everything below is inside it).
- `skills/exgram/SKILL.md` — agent instructions + spec schema (the contract).
- `skills/exgram/lib/build.mjs` — spec → Excalidraw scene (the only real logic). Tested.
- `skills/exgram/lib/serve.mjs` / `skills/exgram/lib/open.mjs` / `skills/exgram/viewer.html` — the live viewer.
- `skills/exgram/references/*.md` — per-diagram-type guidance loaded on demand.
- `skills/exgram/styles/palette.md` — color tokens (keep in sync with `PALETTE` in `build.mjs`).

## Commits & PRs
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
- Keep PRs focused. Describe the diagram case you're improving and include a sample spec.

## Adding a new diagram type
1. Add `skills/exgram/references/<type>.md` with conventions + an example spec.
2. Route to it from the classification list in `skills/exgram/SKILL.md`.
3. If it needs new engine behavior, extend `skills/exgram/lib/build.mjs` and add tests.

By contributing you agree your contributions are licensed under the project's [MIT License](./LICENSE).
