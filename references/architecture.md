# Architecture / system diagrams

For software architecture, infrastructure, and service maps.

## Conventions
- One box per component. Pick the `role` that matches its job:
  `frontend` (clients/UI), `backend` (APIs/app servers), `service` (internal workers),
  `datastore` (DBs/caches/buckets), `queue` (event buses/topics), `external` (3rd-party SaaS).
- Edges = dependencies or data flow, pointing in the direction data/requests travel.
  Label edges with the protocol or payload when useful (`gRPC`, `POST /pay`, `events`).
- Use `dashed: true` for async / event-driven edges; solid for synchronous calls.
- Group co-located components with `groups` (e.g. an "AWS" / "VPC" / "k8s cluster" box).
- Set `title` and `legend: true`.

## Layout
Auto-layout flows left-to-right by dependency depth (clients on the left, stores on the right).
That's usually what you want — only set `x`/`y` for hand-tuning.

## Example spec
```json
{
  "title": "Checkout architecture",
  "legend": true,
  "nodes": [
    { "id": "web",   "label": "Web app",     "role": "frontend" },
    { "id": "mobile","label": "Mobile app",  "role": "frontend" },
    { "id": "api",   "label": "API gateway", "role": "backend" },
    { "id": "pay",   "label": "Payments svc","role": "service" },
    { "id": "queue", "label": "Events bus",  "role": "queue" },
    { "id": "db",    "label": "Postgres",    "role": "datastore" },
    { "id": "stripe","label": "Stripe",      "role": "external" }
  ],
  "edges": [
    { "from": "web",   "to": "api", "label": "HTTPS" },
    { "from": "mobile","to": "api", "label": "HTTPS" },
    { "from": "api",   "to": "pay", "label": "gRPC" },
    { "from": "pay",   "to": "stripe", "label": "charge" },
    { "from": "pay",   "to": "db" },
    { "from": "pay",   "to": "queue", "dashed": true, "label": "payment.succeeded" }
  ],
  "groups": [
    { "label": "Our infra", "nodeIds": ["api", "pay", "queue", "db"] }
  ]
}
```

## Persisting hand edits
Open a board with `?edit=1` to unlock editing. While editing, the viewer treats
the local canvas as the source of truth: changes are auto-saved (debounced) back
to the server via `PUT /scene/<slug>.excalidraw`, which writes them verbatim to
the board's `.excalidraw` file, and the live-poll stops re-applying the served
scene so it can't clobber in-progress edits. A "Save" button forces an immediate
flush. These hand edits persist across reloads.

Honest tradeoff: a fresh build from the spec (`node lib/build.mjs <slug>.json`)
still regenerates `<slug>.excalidraw` and WILL overwrite hand edits — the spec
remains the canonical source for rebuilds. A spec/overlay merge (preserving hand
edits across rebuilds) is a deeper follow-up, not part of this MVP.

## Icons (phase 2)
Official cloud/tech icons (AWS, GCP, Azure, simple-icons) are a planned enhancement: they'll
embed as Excalidraw image elements. Until then, offer colored shapes and mention icons are coming.
