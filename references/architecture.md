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

## Icons
Give a node an `icon` to draw a recognizable glyph inside its box (embedded as an
Excalidraw image element). Icons resolve OFFLINE — the build is synchronous and
zero-dependency, so only the bundled GENERIC category icons (and `data:` URLs)
work today.

Supported generic categories (case-insensitive):
`gateway`, `api`, `database`, `cache`, `queue` (alias `bus`), `identity`, `pim`,
`dam`, `cdn`, `load-balancer` (aliases `lb`, `loadbalancer`), `agent`, `model`,
`observability`, `service`, `server`, `user`, `cloud`.

You can also pass a `data:` URL (e.g. an inline SVG/PNG) and it's embedded as-is.

```json
{ "id": "db", "label": "Postgres", "role": "datastore", "icon": "database" }
```

Anything else — brand slugs (`apachekafka`), namespaced cloud ids (`aws:rds`,
`gcp:vertex-ai`), and remote `http(s)` URLs — is a documented follow-up: it needs
fetching/licensed packs which a synchronous offline build can't do. Those values
fall back GRACEFULLY to the role color (no icon) and the build prints a warning
so you know the glyph was skipped.
