# Database / ER diagrams

For relational schemas and entity relationships.

## Conventions
- One node per table. Use `role: "datastore"` for all tables so they share the green family
  (or give core/lookup tables different roles if the user wants to distinguish them).
- Put the table name and key columns in the `label` using line breaks, e.g.
  `"users\n— id (PK)\n— email\n— created_at"`. Mark `(PK)` and `(FK)`.
- Edges = foreign-key relationships, pointing **from the child (FK) to the parent (PK)**.
  Label with the FK column (`user_id`). Use `arrowhead: "triangle"` to read as "references".
- Set `title` and usually `legend: false` (colors don't carry extra meaning here unless you
  split tables into roles).

## Example spec
```json
{
  "title": "Orders schema",
  "nodes": [
    { "id": "users",  "label": "users\n— id (PK)\n— email\n— name",        "role": "datastore" },
    { "id": "orders", "label": "orders\n— id (PK)\n— user_id (FK)\n— total","role": "datastore" },
    { "id": "items",  "label": "order_items\n— id (PK)\n— order_id (FK)\n— sku","role": "datastore" }
  ],
  "edges": [
    { "from": "orders", "to": "users",  "label": "user_id",  "arrowhead": "triangle" },
    { "from": "items",  "to": "orders", "label": "order_id", "arrowhead": "triangle" }
  ]
}
```

Tip: long multi-line labels make boxes taller than the default — that's fine, Excalidraw wraps
the bound text. If a schema is large, lay tables out by dependency (referenced tables to the right).
