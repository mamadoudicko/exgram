# Color palette & legend rules

Assign every node a `role` so colors stay consistent across diagrams. The build engine
(`lib/build.mjs`) maps each role to a fill + stroke. To rebrand, edit the `PALETTE` object
there and these tokens together.

| role        | meaning                       | fill      | stroke    |
|-------------|-------------------------------|-----------|-----------|
| `frontend`  | UI / client / web / mobile    | `#a5d8ff` (blue)   | `#1971c2` |
| `backend`   | API / app server / business   | `#ffec99` (yellow) | `#f08c00` |
| `datastore` | DB / cache / bucket / storage | `#b2f2bb` (green)  | `#2f9e44` |
| `external`  | 3rd-party / SaaS / outside     | `#dee2e6` (gray)   | `#495057` |
| `queue`     | queue / topic / event bus      | `#d0bfff` (purple) | `#7048e8` |
| `service`   | internal microservice / worker | `#ffd8a8` (orange) | `#e8590c` |
| `decision`  | decision / branch (use diamond)| `#ffc9c9` (red)    | `#e03131` |
| _(none)_    | default / neutral              | `#f1f3f5` (light)  | `#1e1e1e` |

## Rules
- Default to roles; only use a raw `color` hex override when the user asks for a specific color.
- Set `legend: true` whenever colors carry meaning. The legend lists **only the roles actually
  used** in the diagram.
- Keep one concept = one color. Don't mix two roles for the same kind of box.
- A `decision` node should also use `"shape": "diamond"`.
