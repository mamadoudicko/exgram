# Full coverage: sequence diagrams, mind maps, precise layouts (raw elements)

The box-and-arrow `nodes`/`edges` model with auto-layout covers most diagrams. When it can't
faithfully place things — **sequence diagrams** (time axis + lifelines), **radial mind maps**,
**precise mockups**, **anything you want pixel-positioned** — use the `rawElements` escape hatch.

`rawElements` is an array of full Excalidraw element objects merged verbatim into the scene.
The build engine auto-stamps the bookkeeping fields (`version`, `versionNonce`, `seed`, `updated`,
`groupIds`, `isDeleted`, `locked`, …), so you only provide the meaningful fields below. You can
mix `rawElements` with normal `nodes`/`edges` in the same spec.

## Minimal fields per element type
- **rectangle / ellipse / diamond**: `{ type, x, y, width, height, strokeColor, backgroundColor,
  roundness }` (`roundness: { type: 3 }` for rounded rects, `null` otherwise).
- **text**: `{ type:"text", x, y, width, height, text, fontSize, fontFamily, textAlign,
  verticalAlign }` (`fontFamily`: 1 hand-drawn, 2 normal, 3 code).
- **line / arrow**: `{ type, x, y, width, height, points:[[0,0],[dx,dy]], strokeColor,
  strokeStyle, endArrowhead, startArrowhead }`. `x,y` is the start point; `points` are relative.
- To **bind a label to an arrow**, you'd normally use `nodes`/`edges` — for raw, just place a
  separate `text` element near the midpoint.
- **Standalone (unbound) text ignores `verticalAlign:"middle"`** — Excalidraw only vertically
  centers text that's bound to a container. When hand-placing a label inside a box via
  `rawElements`, compute its `y` to center it (e.g. `box.y + box.height/2 - fontSize*0.6`).

## Sequence diagram pattern
Lay it out yourself: actors across the top, vertical dashed lifelines going down, horizontal
arrows for messages (top = earliest), labels above each message.

```json
{
  "title": "Checkout sequence",
  "rawElements": [
    { "type": "rectangle", "x": 40,  "y": 40, "width": 120, "height": 44, "backgroundColor": "#a5d8ff", "strokeColor": "#1971c2", "roundness": { "type": 3 } },
    { "type": "text", "x": 50, "y": 54, "width": 100, "height": 20, "text": "User", "fontSize": 16, "fontFamily": 1, "textAlign": "center", "verticalAlign": "middle" },
    { "type": "rectangle", "x": 320, "y": 40, "width": 120, "height": 44, "backgroundColor": "#ffec99", "strokeColor": "#f08c00", "roundness": { "type": 3 } },
    { "type": "text", "x": 330, "y": 54, "width": 100, "height": 20, "text": "API", "fontSize": 16, "fontFamily": 1, "textAlign": "center", "verticalAlign": "middle" },

    { "type": "line", "x": 100, "y": 84, "width": 0, "height": 300, "points": [[0,0],[0,300]], "strokeColor": "#adb5bd", "strokeStyle": "dashed" },
    { "type": "line", "x": 380, "y": 84, "width": 0, "height": 300, "points": [[0,0],[0,300]], "strokeColor": "#adb5bd", "strokeStyle": "dashed" },

    { "type": "text", "x": 130, "y": 120, "width": 220, "height": 18, "text": "POST /checkout", "fontSize": 13, "fontFamily": 1, "textAlign": "center", "verticalAlign": "top" },
    { "type": "arrow", "x": 100, "y": 140, "width": 280, "height": 0, "points": [[0,0],[280,0]], "strokeColor": "#1e1e1e", "endArrowhead": "arrow" },

    { "type": "text", "x": 130, "y": 190, "width": 220, "height": 18, "text": "200 OK", "fontSize": 13, "fontFamily": 1, "textAlign": "center", "verticalAlign": "top" },
    { "type": "arrow", "x": 380, "y": 210, "width": 280, "height": 0, "points": [[0,0],[-280,0]], "strokeColor": "#1e1e1e", "endArrowhead": "arrow", "strokeStyle": "dashed" }
  ]
}
```

## Mind maps
Place a central node, then position children radially with explicit `x`/`y` (use `nodes` with
`x`/`y` set, or `rawElements`). Connect with arrows. There's no auto radial layout yet, so compute
positions on a circle around the center.
