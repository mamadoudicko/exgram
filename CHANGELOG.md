# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Version-aware server handoff** (#54): a long-running `serve.mjs` no longer keeps
  stale routes alive after an update. Previously `start()` reused any server on the same
  workspace regardless of version, so the freshly-spawned (correct-version) process exited
  and left the old build in charge — making a newly-added action (e.g. Duplicate) 404 even
  though the on-disk viewer advertised it. `start()` now requires the **version** to match
  too; on a mismatch the new server evicts the stale one (graceful loopback `POST
  /api/shutdown`, falling back to `SIGTERM` via a new `pid` field in `/whoami`) and takes
  over the port, so the skew self-heals on the next respawn. If the stale server is too old
  to evict (pre-handoff: no shutdown route, no `pid`), the new server relocates to the next
  free port and re-points `.exgram-url` instead of hanging.

### Added
- `POST /api/shutdown` (loopback-only) and a `pid` field in `/whoami`, supporting the
  version-aware handoff above.

## [1.5.0] - 2026-06-24

### Added
- **Duplicate a board** (#50): fork a diagram under a new slug, keeping the original
  intact. New `POST /api/duplicate` endpoint and a `node lib/duplicate.mjs <slug> <new-slug>`
  CLI/lib helper, both backed by a shared `duplicateBoard` core (slug validation, source
  exists, target free; copies the `.json` spec when present plus the `.excalidraw` render).
  A **Duplicate** action sits beside Rename/Delete in the board view and each boards-list
  row; it prompts for a new slug (default `<slug>-copy`, then `-copy2`…) and opens the copy.

### Changed
- **Icon-only boards-list row actions** (#52): the per-row Rename/Duplicate/Delete buttons
  are now compact, always-visible icon buttons (`✎` / `⧉` / `🗑`) with a per-board
  `aria-label` + `title`, instead of three full-width text buttons. Reduces row crowding and
  scales as actions grow; keeps one-click Delete (with its red destructive styling) and tab
  order. Chosen over an overflow/kebab menu deliberately — for three actions, design-system
  guidance keeps them inline. The board-view top bar keeps its roomier text+icon buttons.

## [1.4.0] - 2026-06-11

### Added
- **Per-board dates in the boards list** (#30): `GET /api/diagrams` now returns
  `[{ slug, created, updated }]` (timestamps from `fs.statSync`, zero deps, with a
  birthtime→mtime fallback and a `created ≤ updated` clamp; resilient to stat failures
  and render-only boards). Each row shows a muted `created … · edited …` line with
  relative times (`Intl.RelativeTimeFormat`) and absolute short dates past ~7 days; each
  is a `<time datetime>` with a full-timestamp tooltip.
- **Sort the boards list** (#31): Last edited (default, desc) / Created / Name, toggling
  asc/desc, persisted in `localStorage`, combined with the search filter. Null timestamps
  sort last; Name sort is natural + case-insensitive.
- **Type-ahead search** (#34): typing any printable character on the boards index focuses
  the filter box and captures that first keystroke (cross-browser: the character is taken
  over explicitly so Firefox/Safari don't drop it). Ignores modifier/navigation keys and
  active text fields; Esc clears.
- **Handwritten `exgram` wordmark** (#32), drawn BY exgram itself: `assets/wordmark.exgram.json`
  is a spec built by `lib/build.mjs` and exported to a self-contained `assets/wordmark.svg`
  (hand font embedded as base64 — fully offline). Shown on the boards index header, in each
  board's action bar, as the favicon, and leading the README (with a light/dark `<picture>`
  variant). A read-only `GET /assets/<file>` route serves it.

### Changed
- **Boards-index tagline** (#33): now "Your agent's diagrams, live and editable — open one
  or ask for a new one."

## [1.3.0] - 2026-06-11

### Added
- **Node icons** (#24): a `node.icon` field embeds a recognizable glyph inside the box as
  an Excalidraw image element. Resolves OFFLINE (zero-dependency, synchronous build): bundled
  generic category icons (`gateway`, `api`, `database`, `cache`, `queue`/`bus`, `identity`,
  `pim`, `dam`, `cdn`, `load-balancer`, `agent`, `model`, `observability`, `service`, `server`,
  `user`, `cloud`) and `data:` URLs. Brand slugs (`apachekafka`), namespaced cloud ids
  (`aws:rds`, `gcp:vertex-ai`), and remote URLs fall back gracefully to the role color with a
  build warning (a documented follow-up). New `lib/icons.mjs`.
- **Persist hand edits** (#23): open a board with `?edit=1` and manual canvas changes are
  auto-saved (debounced) and survive reloads, via a new `PUT /scene/<slug>.excalidraw` endpoint
  plus a Save bar with a saved/dirty indicator. The live-poll stops re-applying remote scenes
  while editing so it can't clobber in-progress work. (Tradeoff: a fresh build from the spec
  still regenerates the render — a spec/overlay merge is a follow-up.)
- **Boards list search/filter** (#21): a client-side filter box on the index (autofocus + clear).
- **Rename a board** (#20): from the boards list and the board action pad, backed by a new
  `POST /api/rename` endpoint (slug-validated; refuses to clobber an existing board).

### Changed
- **Redesigned board action pad** (#25): a spaced toolbar with the navigation group (`← boards`)
  visually separated from board actions (Rename / Edit / Delete), the destructive Delete styled
  in red and routed through a confirmation, clear of Excalidraw's top-left menu.
- **Delete now asks first** (#22): a styled in-app confirmation dialog replaces `window.confirm`
  at both the index and board-view delete sites.

### Fixed
- **`rawElements` rendered a blank board** (#19): raw elements received no `id` and no render
  defaults, so a `rawElements`-only spec crashed Excalidraw hit-testing (`Cannot read properties
  of undefined (reading 'length')`) and blanked the canvas. They are now normalized through the
  same defaults as `nodes`/`edges` (stable `id`, `seed`, shape/text/arrow fields), and the viewer
  runs every scene through Excalidraw `restoreElements` before `updateScene` as defense-in-depth.
- The viewer now registers embedded image bytes via `api.addFiles()` before `updateScene`, so node
  icons render instead of showing a broken-image placeholder.
- The `PUT /scene/<slug>.excalidraw` save endpoint rejects a body that isn't a parseable Excalidraw
  scene (`400`) before writing, so a malformed/truncated save can't corrupt the render file; and the
  viewer skips no-op saves (pure pan/zoom no longer triggers a write).

## [1.2.2] - 2026-06-10

### Fixed
- CLI entry points (`build.mjs`, `workspace.mjs`) now run when the skill is installed
  by symlink (the `npx skills` default). The previous guard compared `import.meta.url`
  (real path) to `process.argv[1]` (the symlink) as raw strings, so it never matched
  under a symlinked install: `node lib/workspace.mjs` printed nothing and the SKILL.md
  workflow's `$EXGRAM_WS` came back empty. New `lib/cli.mjs#isMain()` compares real paths.

## [1.2.1] - 2026-06-10

### Changed
- Boards now persist in a per-user data directory (`~/.exgram/workspace` by default,
  override with `$EXGRAM_WORKSPACE`) instead of inside the package. `npx skills update`
  mirrors the package directory and prunes untracked files, which previously deleted every
  user-created board on update. Storing boards outside the package keeps them safe.
- Boards are now **per-user, not per-install**: every install resolves the same default
  workspace, so projects share `~/.exgram/workspace` unless `$EXGRAM_WORKSPACE` is set per
  project. (Side benefit: one canonical server is reused via `/whoami` matching.)

### Added
- `lib/workspace.mjs` — `resolveWorkspace()` helper (and a CLI that prints the resolved
  path) so the server and the SKILL.md workflow agree on a single, update-safe location.

## [1.2.0] - 2026-06-10

### Added
- Delete a board from the index list (per row) or from a board's bar; a `DELETE
  /scene/<slug>.excalidraw` endpoint removes the board's spec + render.
- "← boards" back link on the board view to return to the index.
- SKILL.md guidance for agents: when exgram misbehaves in a session, ask the user for approval and,
  if granted, file a **generic, sanitized** issue (no user content) following the repo's bug template.

### Changed
- README rewritten to be use-focused and Claude-first; added a "raw notes to clean diagram" use case
  and an `npx skills update exgram` command.
- package.json/About note broad agent support (Claude Code, Cursor, Codex, Copilot & 70+ agents).

## [1.1.1] - 2026-06-10

### Fixed
- Index page (`/`, no slug) showed a blank screen: the empty full-height `#app` pushed the board
  list below the fold. The viewer now hides `#app` in index mode so the list renders at the top.

## [1.1.0] - 2026-06-10

### Added
- Per-diagram `roleColors` override so a role can be recolored on one board with the nodes **and**
  the legend swatch staying in sync (#4).
- Viewer **view mode** (read-only) by default, with a `?d=<slug>&edit=1` opt-out (#7).
- Empty-state panel in the viewer: when a board 404s, it shows the server's workspace (`/whoami`)
  and links to the boards that do exist, instead of a silent blank canvas (#5).
- `/whoami` server endpoint and smart port selection: a server only reuses a port that serves the
  same workspace, otherwise it picks the next free port and records the real URL in
  `workspace/.exgram-url` (fixes stale-server-opens-wrong-board) (#3).
- Layout linter: `build.mjs` warns on overlapping nodes and edges crossing through boxes (#6).
- JSDoc-typed spec plus a `validateSpec()` runtime check with clear errors (typed source of truth;
  partial of #8, full TypeScript migration deferred).

### Changed
- Per-node `color` override now also derives a matching **stroke**, so an overridden box no longer
  shows a mismatched border (#4).
- Auto-layout ranks **source-less nodes** by their successors instead of pinning them to column 0,
  reducing long cross-box edges; edge labels are biased toward the source so converging labels
  fan out instead of stacking (#6).
- Viewer fits with margin on load (`viewportZoomFactor`) so the title and legend no longer hide
  behind the toolbar and status pill (#10).

## [1.0.0] - 2026-06-10

### Added
- Initial release: an agent skill that turns a natural-language prompt **or an image of a
  diagram** into a live, editable Excalidraw board, with no API key (runs on the host agent).
- `lib/build.mjs` spec-to-Excalidraw engine: layered auto-layout, color-by-role palette, legend,
  groups, container-bound labels, bound arrows, stable element ids/seeds, and a `rawElements`
  escape hatch for full coverage (sequence diagrams, mind maps, precise layouts).
- Live local viewer with **multi-board** support: one loopback-only server (`lib/serve.mjs`) hosts
  many diagrams, each at `/?d=<slug>`, auto-refreshing ~0.5s in place and preserving zoom/pan.
- Per-slug spec persistence, so diagrams stay editable across turns.
- References for architecture, database, flow, and sequence diagrams; a color palette guide; and a
  "keep diagrams clean" authoring ruleset.
- Tests (`node --test`, 15 cases), CI across Node 18/20/22, and standard OSS docs
  (README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY).

[Unreleased]: https://github.com/mamadoudicko/exgram/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mamadoudicko/exgram/releases/tag/v1.0.0
