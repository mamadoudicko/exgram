---
name: exgram
description: >-
  Turns a natural-language prompt or an image of a diagram into a live, editable
  Excalidraw board: architecture diagrams, flowcharts, database schemas, state
  machines, sequence diagrams, and mind maps. Renders locally and auto-refreshes
  as the diagram is edited. Use when the user wants to draw, sketch, diagram,
  visualize, or map out a system, flow, schema, or architecture, or to turn a
  screenshot or photo of a diagram into an editable one.
license: MIT
allowed-tools:
  - Bash(node:*)
  - Bash(curl:*)
  - Read
  - Write
  - Edit
metadata:
  version: 1.1.0
  author: Mamadou Dicko
---

# exgram — prompt to live Excalidraw

You turn a description **or an image of a diagram** into an Excalidraw diagram and show it
on a **live local board** that refreshes itself (~0.5s) every time you rebuild. One server
hosts **many boards at once**, one per diagram, addressed by a short `slug`. The user edits
and exports from the board. This runs on whatever agent/subscription is hosting you, no API key.

`SKILL_DIR` below = the directory this `SKILL.md` lives in. Run all commands from there.

## Workflow

1. **Figure out the input.**
   - **Text prompt** (usual case): proceed.
   - **An image** (screenshot, whiteboard photo, exported diagram): look at it, read off the
     components, connections, labels, and grouping, and author a spec from it. You re-create it
     as a clean exgram diagram (this re-interprets it tidily, it is not a pixel copy). Capture
     what you can; the user corrects any misread by prompting.
   - **Editing an existing exgram diagram**: reuse its `slug` (step 3). Read its saved
     `workspace/<slug>.json`, modify that spec, and rebuild. The spec is the source of truth.

2. **Classify the diagram type** and read the matching reference (only the one you need):
   - architecture / services / infra → `references/architecture.md`
   - database / ER / tables → `references/database.md`
   - flowchart / process / state machine → `references/flow.md`
   - sequence / mind map / anything the box-and-arrow layout can't place →
     `references/sequence.md` (the raw-elements escape hatch)
   Always also read `styles/palette.md` for the color roles.

3. **Pick a slug** for this diagram: short, kebab-case, from its topic (e.g. `auth-flow`,
   `orders-db`). **Reuse the same slug to update an existing diagram**; use a new slug for a new one.

4. **Write the spec** to `SKILL_DIR/workspace/<slug>.json` (schema below). Apply the style system
   by default: give each node a `role` so colors stay consistent, set a `title`, and set
   `legend: true` when colors carry meaning. This file persists, so the diagram stays editable.

5. **Build the scene:**
   ```bash
   node "$SKILL_DIR/lib/build.mjs" "$SKILL_DIR/workspace/<slug>.json" "$SKILL_DIR/workspace/<slug>.excalidraw"
   ```

6. **Ensure the server is up** and, the first time you create this slug, **open its tab.** `serve.mjs`
   picks a port that is free or already serving THIS workspace (so a stale server from another install
   can't hijack it) and records the real base URL in `workspace/.exgram-url`:
   ```bash
   node "$SKILL_DIR/lib/serve.mjs" >/dev/null 2>&1 &                 # starts, or exits if already served
   for i in $(seq 1 50); do [ -f "$SKILL_DIR/workspace/.exgram-url" ] && break; sleep 0.1; done
   BASE="$(cat "$SKILL_DIR/workspace/.exgram-url" 2>/dev/null || echo http://localhost:3737)"
   node "$SKILL_DIR/lib/open.mjs" "$BASE/?d=<slug>"                  # first time for this slug only
   ```
   Keep `serve.mjs` in the background so it survives across turns. Read `$BASE` from the file rather
   than assuming port 3737. On later edits to the same slug, don't reopen, the tab refreshes itself.

7. **Tell the user** it's live at `$BASE/?d=<slug>` (the bare `$BASE` lists all boards), then **ask
   smart follow-ups** (next section). On each follow-up, edit `workspace/<slug>.json` and rebuild, the
   board updates in place, keeping their zoom/pan. The board opens **read-only** (view mode); to let
   them tweak before exporting, point them at `$BASE/?d=<slug>&edit=1`.

## Ask smart follow-ups (important)

Draw a **first version fast**, then proactively offer to refine it. Don't dump a generic
"anything else?" — propose 2–4 **specific, relevant** options based on what you just drew.
Pick the ones that actually apply:

- **Colors / roles** — "Right now frontend is blue and the DB is green — want a different
  scheme, or should I recolor any of these?"
- **Detail level** — "Should I expand the `payments` service into its sub-components, or
  keep it as one box?"
- **Icons** — "Want official AWS/GCP icons on the infra boxes instead of plain rectangles?"
  (Icons are a near-term feature; if not available yet, say so and offer colored shapes.)
- **Layout / orientation** — "Flip to top-down? Group these into swimlanes?"
- **Labels & legend** — "Add edge labels (protocols, payloads)? Add a legend?"
- **Scope** — "Add the error/retry paths, or keep the happy path only?"

Then apply their answer by editing the spec and rebuilding. Keep iterating — this is a
live board, so cheap edits are the whole point.

## Spec schema (`workspace/<slug>.json`)

```jsonc
{
  "title": "Checkout flow",            // optional, drawn above the diagram
  "legend": true,                       // optional, shows role color key
  "roleColors": { "frontend": "#ff8787" }, // optional: recolor a role for THIS diagram only
                                           // (nodes + legend swatch stay in sync; doesn't touch others)
  "nodes": [
    { "id": "web", "label": "Web app", "role": "frontend" },
    { "id": "api", "label": "API",     "role": "backend" },
    { "id": "db",  "label": "Postgres","role": "datastore", "shape": "rectangle" }
    // role: frontend|backend|datastore|external|queue|service|decision  (see styles/palette.md)
    // shape: rectangle|ellipse|diamond  (diamond = decision)
    // x/y: optional absolute override; color: per-node fill override (stroke is derived to match)
  ],
  "edges": [
    { "from": "web", "to": "api", "label": "POST /checkout" },
    { "from": "api", "to": "db",  "dashed": true }
    // arrowhead: "arrow" (default) | "triangle" | "none"
  ],
  "groups": [
    { "label": "AWS", "nodeIds": ["api", "db"] }   // optional dashed grouping box
  ]
}
```

Layout is automatic (layered, left-to-right). Only set `x`/`y` when you need precise
placement. For diagrams the box-and-arrow model can't express (sequence lifelines, radial
mind maps, exact mockups), use `rawElements`, see `references/sequence.md`.

## Keep diagrams clean (do this every time)

The auto-layout is a simple layered flow. It produces clean results **only if you author the
spec to flow cleanly**. Before building, shape the spec by these rules, then sanity-check the
rendered board and fix it if it looks crowded:

- **Flow one direction.** Model the diagram as a forward DAG so edges mostly point left to right.
  Avoid cycles: a back-edge (B points to an earlier A) makes the layout double back and crowd.
  If a feedback/loop is essential, use **one** clearly labeled `dashed` back-edge, not several.
- **Keep groups contiguous.** Only group nodes that are adjacent in the flow. Grouping scattered
  nodes makes the group boxes overlap each other and the arrows. If members are not adjacent,
  drop the group or reorder so they are.
- **Short labels.** Node labels: 1 line ideally, 2 at most (use `\n`). Edge labels: a few words.
  Long labels collide with neighbors.
- **No long-distance edges.** An edge that skips several layers gets drawn straight through the
  boxes in between. Reorder nodes so connected ones sit next to each other.
- **Don't overcrowd.** Aim for ~12 nodes max per diagram. For a bigger system, split it into
  several focused diagrams (e.g. one per subsystem) rather than one dense one.
- **Verify.** `build.mjs` prints **layout warnings** to stderr on each build (overlapping nodes,
  edges crossing through boxes). If you see any, simplify: fewer nodes, shorter labels, remove
  cycles, or split the diagram, then rebuild (it refreshes in place). Also glance at the board for
  overlapping labels or group boxes.

Known engine limits to design around: no crossing-minimization, no edge routing around boxes,
and groups are simple bounding boxes (so contiguity matters). Authoring to the rules above keeps
output clean despite these.

## Notes
- **Many boards at once.** Each diagram is its own `workspace/<slug>.json` (spec) +
  `workspace/<slug>.excalidraw` (render), served at `/?d=<slug>`. The bare URL lists them all.
- The viewer loads Excalidraw from a CDN, so the board needs internet the first time.
- Keep `serve.mjs` running in the background; never block the turn waiting on it.
- Save = the user exports from Excalidraw (`.excalidraw` / PNG / SVG) via the canvas menu.
- The spec (`workspace/<slug>.json`) is the persisted source of truth, so a diagram stays editable
  across turns: reuse its slug, change the spec, rebuild. A user's manual edits on the canvas are
  transient (each build replaces the render); fold anything worth keeping back into the spec, or
  have them export. Zoom/pan is preserved across rebuilds.
