# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- SKILL.md guidance for agents: when exgram misbehaves in a session, ask the user for approval and,
  if granted, file a **generic, sanitized** issue (no user content) following the repo's bug template
  so problems get fixed.

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
