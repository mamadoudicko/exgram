// exgram — bundled generic-category icons (MVP, issue #24).
//
// The build is SYNCHRONOUS and ZERO-dependency: it can't fetch licensed brand
// packs (simple-icons, AWS/GCP) at build time. So we ship a tiny set of inline,
// monochrome SVGs for GENERIC architecture categories that resolve OFFLINE.
// Brand slugs / aws:/gcp: namespaced ids / remote URLs are a documented
// follow-up (they need fetching) and resolve to null -> graceful fallback.

// Single-color paths on a 24x24 viewBox. `currentColor` lets the embedded
// SVG inherit a sensible stroke; Excalidraw renders the SVG as an image.
const STROKE = '#1e1e1e';

// Wrap a body in a standard <svg> envelope so each entry below stays terse.
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${STROKE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// Generic category -> inline SVG. Keep these simple and recognizable.
const ICONS = {
  gateway: svg('<path d="M3 12h18"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/>'),
  api: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9l-2 3 2 3"/><path d="M17 9l2 3-2 3"/><path d="M13 9l-2 6"/>'),
  database: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  cache: svg('<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3 2"/><path d="M16 3l5 0 0 5"/><path d="M21 3l-6 6"/>'),
  queue: svg('<rect x="3" y="8" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="8" rx="1"/><rect x="17" y="8" width="4" height="8" rx="1"/>'),
  identity: svg('<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/>'),
  pim: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M8 17h3"/>'),
  dam: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 17l-5-5-4 4-2-2-7 7"/>'),
  cdn: svg('<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/><path d="M5 7h14"/><path d="M5 17h14"/>'),
  'load-balancer': svg('<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="12" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4"/><path d="M12 11.5L5 16.5"/><path d="M12 11.5v5"/><path d="M12 11.5l7 5"/>'),
  agent: svg('<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/><path d="M3 12v3"/><path d="M21 12v3"/>'),
  model: svg('<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 6.5l8 4.5"/><path d="M8 17.5l8-4.5"/>'),
  observability: svg('<path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="3"/>'),
  service: svg('<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M5.6 5.6l2.1 2.1"/><path d="M16.3 16.3l2.1 2.1"/><path d="M5.6 18.4l2.1-2.1"/><path d="M16.3 7.7l2.1-2.1"/>'),
  server: svg('<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01"/><path d="M7 16.5h.01"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/>'),
  cloud: svg('<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 17.5 18Z"/>'),
};

// Aliases -> canonical key, so `bus` and `lb` resolve too.
const ALIASES = {
  bus: 'queue',
  lb: 'load-balancer',
  loadbalancer: 'load-balancer',
};

/**
 * Resolve an icon name to embeddable SVG bytes, OFFLINE and synchronously.
 *
 * @param {string} name a generic category (case-insensitive), an alias, or a
 *   `data:` URL passed straight through.
 * @returns {{svg:string, mimeType:string}|null} null when not bundled
 *   (brand slugs, aws:/gcp: ids, http(s) URLs) -> caller falls back to color.
 */
export function resolveIcon(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const raw = name.trim();
  // A data: URL is already embeddable; hand it back verbatim. We sniff the
  // mime type from the URL so the build can reuse the same files entry shape.
  if (/^data:/i.test(raw)) {
    const m = /^data:([^;,]+)/i.exec(raw);
    return { svg: raw, mimeType: m ? m[1] : 'image/svg+xml' };
  }
  const key = raw.toLowerCase();
  const canonical = ALIASES[key] || key;
  if (Object.prototype.hasOwnProperty.call(ICONS, canonical)) {
    return { svg: ICONS[canonical], mimeType: 'image/svg+xml' };
  }
  // Brand slugs ("apachekafka"), namespaced cloud ids ("aws:rds"), remote URLs
  // need fetching/licensed packs — not bundled today.
  return null;
}

// Exposed so docs/tests can enumerate exactly what ships.
export const ICON_CATEGORIES = Object.keys(ICONS);
export const ICON_ALIASES = ALIASES;
