# Contributing to exgram

Thanks for your interest! exgram is intentionally tiny and dependency-free — please keep it that way.

## Ground rules
- **No runtime dependencies.** The engine (`lib/*.mjs`) and tests must run on plain Node ≥ 18
  built-ins. The viewer may load Excalidraw from a CDN, but don't add a build step or `node_modules`.
- **Keep it ESM** (`.mjs`, `import`/`export`).
- **Add a test** for any change to `lib/build.mjs` in `test/build.test.mjs`.
- Match the existing style: small functions, clear names, comments only where intent isn't obvious.

## Dev loop
```bash
npm test                 # runs node --test, no install needed
node lib/build.mjs workspace/spec.json workspace/scene.excalidraw
node lib/serve.mjs        # preview at http://localhost:3737
```

## Project layout
- `SKILL.md` — agent instructions + spec schema (the contract).
- `lib/build.mjs` — spec → Excalidraw scene (the only real logic). Tested.
- `lib/serve.mjs` / `lib/open.mjs` / `viewer.html` — the live viewer.
- `references/*.md` — per-diagram-type guidance loaded on demand.
- `styles/palette.md` — color tokens (keep in sync with `PALETTE` in `build.mjs`).

## Commits & PRs
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
- Keep PRs focused. Describe the diagram case you're improving and include a sample spec.

## Adding a new diagram type
1. Add `references/<type>.md` with conventions + an example spec.
2. Route to it from the classification list in `SKILL.md`.
3. If it needs new engine behavior, extend `build.mjs` and add tests.

By contributing you agree your contributions are licensed under the project's [MIT License](./LICENSE).
