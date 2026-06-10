# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
