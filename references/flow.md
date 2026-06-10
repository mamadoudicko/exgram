# Flowcharts / processes / state machines

For step-by-step processes, decision logic, and state transitions.

## Conventions
- Start/end nodes: `shape: "ellipse"`, neutral or `role: "service"`.
- Steps / actions: `shape: "rectangle"`.
- Decisions: `shape: "diamond"` with `role: "decision"` (red). Label outgoing edges with the
  branch condition (`yes` / `no`, `valid` / `invalid`).
- Edges follow the flow direction. Use `dashed: true` for fallback / error transitions.
- State machines: nodes = states (ellipses), edges = transitions labeled with the event/trigger.
- Set `title`; `legend: true` only if you use roles meaningfully.

## Example spec
```json
{
  "title": "Login flow",
  "nodes": [
    { "id": "start", "label": "Start",        "shape": "ellipse" },
    { "id": "form",  "label": "Show login",   "role": "service" },
    { "id": "check", "label": "Valid creds?", "shape": "diamond", "role": "decision" },
    { "id": "home",  "label": "Dashboard",    "role": "service" },
    { "id": "err",   "label": "Show error",   "role": "service" },
    { "id": "end",   "label": "End",          "shape": "ellipse" }
  ],
  "edges": [
    { "from": "start", "to": "form" },
    { "from": "form",  "to": "check" },
    { "from": "check", "to": "home", "label": "yes" },
    { "from": "check", "to": "err",  "label": "no", "dashed": true },
    { "from": "err",   "to": "form" },
    { "from": "home",  "to": "end" }
  ]
}
```

## Swimlanes
Group nodes by actor/system with `groups` (one group per lane). For strict left-to-right lanes,
set explicit `x` per node (lane = column) and let `y` auto-stack, or hand-place both.
