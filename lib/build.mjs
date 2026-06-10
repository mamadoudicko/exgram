#!/usr/bin/env node
// exgram — build a valid Excalidraw scene from a lightweight spec.
//
// Pure Node built-ins. Auto-layout is layered/Sugiyama-lite (left-to-right).

import { readFileSync, writeFileSync } from 'node:fs';

/**
 * @typedef {Object} SpecNode
 * @property {string} id                       unique node id
 * @property {string} [label]                  text (use \n for multiple lines)
 * @property {('frontend'|'backend'|'datastore'|'external'|'queue'|'service'|'decision')} [role]
 * @property {('rectangle'|'ellipse'|'diamond')} [shape]
 * @property {number} [x]                       absolute x override
 * @property {number} [y]                       absolute y override
 * @property {string} [color]                   per-node fill override (#rrggbb); stroke is derived
 */
/**
 * @typedef {Object} SpecEdge
 * @property {string} from
 * @property {string} to
 * @property {string} [label]
 * @property {boolean} [dashed]
 * @property {('arrow'|'triangle'|'none')} [arrowhead]
 */
/**
 * @typedef {Object} SpecGroup
 * @property {string} [label]
 * @property {string[]} nodeIds
 * @property {string} [color]
 */
/**
 * @typedef {Object} Spec
 * @property {string} [title]
 * @property {boolean} [legend]
 * @property {Record<string,string>} [roleColors]  per-diagram role->fill overrides (legend stays in sync)
 * @property {SpecNode[]} [nodes]
 * @property {SpecEdge[]} [edges]
 * @property {SpecGroup[]} [groups]
 * @property {object[]} [rawElements]
 */

// --- style ----------------------------------------------------------------
// Color tokens by role. Keep in sync with styles/palette.md.
export const PALETTE = {
  frontend:  { bg: '#a5d8ff', stroke: '#1971c2' }, // blue
  backend:   { bg: '#ffec99', stroke: '#f08c00' }, // yellow
  datastore: { bg: '#b2f2bb', stroke: '#2f9e44' }, // green
  external:  { bg: '#dee2e6', stroke: '#495057' }, // gray
  queue:     { bg: '#d0bfff', stroke: '#7048e8' }, // purple
  service:   { bg: '#ffd8a8', stroke: '#e8590c' }, // orange
  decision:  { bg: '#ffc9c9', stroke: '#e03131' }, // red
  default:   { bg: '#f1f3f5', stroke: '#1e1e1e' },
};
const ROLE_LABEL = {
  frontend: 'Frontend', backend: 'Backend', datastore: 'Data store',
  external: 'External', queue: 'Queue', service: 'Service', decision: 'Decision',
};

const BOX_W = 180, BOX_H = 72, HGAP = 120, VGAP = 52;
const FONT = { hand: 1, normal: 2, code: 3 }; // Excalidraw fontFamily ids

// --- helpers --------------------------------------------------------------
const nonce = () => Math.floor(Math.random() * 2 ** 31);

// Deterministic 31-bit hash (FNV-1a). Element ids and seeds are derived from
// stable semantic keys so a rebuild produces the SAME ids/seeds: Excalidraw can
// reconcile elements by id, and the hand-drawn roughness stays put on refresh.
function hash31(key) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 2147483647;
}

// Derive a readable stroke from a fill color (used for per-node `color` overrides
// so the border matches the fill instead of keeping the role's stroke). Issue #4.
function darken(hex, factor = 0.62) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex));
  if (!m) return '#1e1e1e';
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, '0');
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

// Per-build palette lookup that honors spec.roleColors so a one-diagram recolor
// keeps nodes AND the legend swatch in sync. Issue #4.
function makePalette(spec) {
  const overrides = (spec && spec.roleColors) || {};
  return (role) => {
    if (overrides[role]) {
      const bg = overrides[role];
      return { bg, stroke: darken(bg) };
    }
    return PALETTE[role] || PALETTE.default;
  };
}

// Shared mutable stamp so every element in one build shares an increasing version.
function makeStamp() {
  const v = Date.now();
  return { version: v, updated: v };
}

function baseElement(stamp, o) {
  return {
    id: o.id,
    type: o.type,
    x: o.x, y: o.y, width: o.width, height: o.height,
    angle: 0,
    strokeColor: o.strokeColor ?? '#1e1e1e',
    backgroundColor: o.backgroundColor ?? 'transparent',
    fillStyle: o.fillStyle ?? 'solid',
    strokeWidth: o.strokeWidth ?? 2,
    strokeStyle: o.strokeStyle ?? 'solid',
    roughness: o.roughness ?? 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: o.roundness ?? null,
    seed: o.seed ?? hash31(String(o.id)),
    version: stamp.version,
    versionNonce: nonce(),
    isDeleted: false,
    boundElements: o.boundElements ?? null,
    updated: stamp.updated,
    link: null,
    locked: false,
    ...o.extra,
  };
}

function textElement(stamp, { id, x, y, width, height, text, containerId, align = 'center', vAlign = 'middle', fontSize = 16, color = '#1e1e1e', fontFamily = FONT.hand }) {
  return baseElement(stamp, {
    id, type: 'text', x, y, width, height,
    strokeColor: color,
    extra: {
      text,
      fontSize,
      fontFamily,
      textAlign: align,
      verticalAlign: vAlign,
      containerId: containerId ?? null,
      originalText: text,
      // bound text is sized by its container; only free text should auto-resize
      autoResize: !containerId,
      lineHeight: 1.25,
    },
  });
}

// Pick the attach points on the edges of two boxes, based on relative position.
function attach(s, t) {
  const sc = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  const tc = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
  if (Math.abs(tc.x - sc.x) >= Math.abs(tc.y - sc.y)) {
    return tc.x >= sc.x
      ? [{ x: s.x + s.width, y: sc.y }, { x: t.x, y: tc.y }]            // left -> right
      : [{ x: s.x, y: sc.y }, { x: t.x + t.width, y: tc.y }];          // right -> left
  }
  return tc.y >= sc.y
    ? [{ x: sc.x, y: s.y + s.height }, { x: tc.x, y: t.y }]            // top -> bottom
    : [{ x: sc.x, y: s.y }, { x: tc.x, y: t.y + t.height }];          // bottom -> top
}

// --- validation (typed spec, clear errors) -- issue #8 --------------------
/** @param {Spec} spec @returns {string[]} hard structural errors (empty = ok) */
export function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['spec must be an object'];
  const nodes = spec.nodes ?? [];
  const edges = spec.edges ?? [];
  if (!Array.isArray(nodes)) errors.push('`nodes` must be an array');
  if (!Array.isArray(edges)) errors.push('`edges` must be an array');
  const ids = new Set();
  (Array.isArray(nodes) ? nodes : []).forEach((n, i) => {
    if (!n || typeof n.id !== 'string' || !n.id) { errors.push(`nodes[${i}] needs a non-empty string id`); return; }
    if (ids.has(n.id)) errors.push(`duplicate node id "${n.id}"`);
    ids.add(n.id);
  });
  (Array.isArray(edges) ? edges : []).forEach((e, i) => {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') errors.push(`edges[${i}] needs string from/to`);
  });
  return errors;
}

// --- layout (layered, left-to-right) -- issue #6 --------------------------
function layout(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    indeg.set(e.to, indeg.get(e.to) + 1);
    out.get(e.from).push(e.to);
  }
  // Longest-path layering; cap iterations so cycles terminate.
  for (let it = 0; it < nodes.length; it++) {
    let changed = false;
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
      const nl = layer.get(e.from) + 1;
      if (nl > layer.get(e.to)) { layer.set(e.to, nl); changed = true; }
    }
    if (!changed) break;
  }
  // #6: a node with no incoming edge but with successors should sit just LEFT of
  // the nearest node it feeds, not be pinned to column 0 (which caused long
  // cross-box edges). Rank such source-less nodes by their successors.
  for (const n of nodes) {
    if (indeg.get(n.id) === 0 && out.get(n.id).length) {
      const minSucc = Math.min(...out.get(n.id).map((s) => layer.get(s)));
      layer.set(n.id, Math.max(0, minSucc - 1));
    }
  }
  const cols = {};
  for (const n of nodes) (cols[layer.get(n.id)] ||= []).push(n);
  const colHeights = Object.values(cols).map((c) => c.length * (BOX_H + VGAP) - VGAP);
  const maxH = Math.max(0, ...colHeights);
  for (const l of Object.keys(cols)) {
    const col = cols[l];
    const colH = col.length * (BOX_H + VGAP) - VGAP;
    const offY = (maxH - colH) / 2;
    col.forEach((n, i) => {
      n._x = n.x ?? Number(l) * (BOX_W + HGAP);
      n._y = n.y ?? offY + i * (BOX_H + VGAP);
    });
  }
}

// --- geometry linter (warn on overlaps / cross-box edges) -- issue #6 -----
function rectsOverlap(a, b, pad = 2) {
  return a.x < b.x + b.w - pad && a.x + a.w - pad > b.x && a.y < b.y + b.h - pad && a.y + a.h - pad > b.y;
}
// Liang–Barsky: does segment p0->p1 pass through rect r's interior?
function segCrossesRect(p0, p1, r) {
  let t0 = 0, t1 = 1;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const p = [-dx, dx, -dy, dy];
  const q = [p0.x - r.x, r.x + r.w - p0.x, p0.y - r.y, r.y + r.h - p0.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return t0 < t1;
}
function lintLayout(boxes, arrows) {
  const warnings = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (rectsOverlap(boxes[i], boxes[j])) warnings.push(`nodes "${boxes[i].id}" and "${boxes[j].id}" overlap`);
    }
  }
  for (const a of arrows) {
    for (const box of boxes) {
      if (box.id === a.from || box.id === a.to) continue;
      const r = { x: box.x + 3, y: box.y + 3, w: box.w - 6, h: box.h - 6 };
      if (r.w > 0 && r.h > 0 && segCrossesRect(a.p0, a.p1, r)) {
        warnings.push(`edge "${a.from}"->"${a.to}" crosses node "${box.id}"`);
      }
    }
  }
  return warnings;
}

// --- main build -----------------------------------------------------------
/** @param {Spec} spec */
export function buildScene(spec = {}) {
  const stamp = makeStamp();
  const pal = makePalette(spec);
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  const groups = Array.isArray(spec.groups) ? spec.groups : [];

  layout(nodes, edges);

  const elements = [];
  const byId = new Map(); // node id -> rectangle element
  const boxes = [];       // for the geometry linter
  const arrowGeo = [];

  // 1. group backgrounds (drawn first = behind)
  groups.forEach((g, gi) => {
    const members = (g.nodeIds || []).map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
    if (!members.length) return;
    const pad = 28;
    const labelPad = g.label ? 22 : 0;
    const minX = Math.min(...members.map((m) => m._x)) - pad;
    const minY = Math.min(...members.map((m) => m._y)) - pad - labelPad;
    const maxX = Math.max(...members.map((m) => m._x + BOX_W)) + pad;
    const maxY = Math.max(...members.map((m) => m._y + BOX_H)) + pad;
    elements.push(baseElement(stamp, {
      id: `g${gi}`, type: 'rectangle', x: minX, y: minY, width: maxX - minX, height: maxY - minY,
      strokeColor: g.color ?? '#adb5bd', backgroundColor: 'transparent',
      strokeStyle: 'dashed', roughness: 0, roundness: { type: 3 },
    }));
    if (g.label) {
      elements.push(textElement(stamp, {
        id: `g${gi}.t`, x: minX + 10, y: minY + 6, width: maxX - minX - 20, height: 22,
        text: g.label, align: 'left', vAlign: 'top', fontSize: 14, color: g.color ?? '#868e96',
      }));
    }
  });

  // 2. nodes (rectangle + bound label)
  const usedRoles = new Set();
  for (const n of nodes) {
    const role = n.role && (PALETTE[n.role] || (spec.roleColors && spec.roleColors[n.role])) ? n.role : null;
    if (role) usedRoles.add(role);
    const col = pal(role || 'default');
    const shape = n.shape === 'ellipse' || n.shape === 'diamond' ? n.shape : 'rectangle';
    const recId = `n.${n.id}`;
    const txtId = `n.${n.id}.t`;
    const label = String(n.label ?? n.id);
    const lines = label.split('\n').length;
    const textH = lines * 20;
    const boxH = Math.max(BOX_H, textH + 28);
    const rect = baseElement(stamp, {
      id: recId, type: shape, x: n._x, y: n._y, width: BOX_W, height: boxH,
      // #4: a per-node color override now sets a matching stroke too
      strokeColor: n.color ? darken(n.color) : col.stroke,
      backgroundColor: n.color ?? col.bg,
      roundness: shape === 'rectangle' ? { type: 3 } : null,
      boundElements: [{ type: 'text', id: txtId }],
    });
    byId.set(n.id, rect);
    boxes.push({ id: n.id, x: n._x, y: n._y, w: BOX_W, h: boxH });
    elements.push(rect);
    elements.push(textElement(stamp, {
      id: txtId, x: n._x + 8, y: n._y + boxH / 2 - textH / 2, width: BOX_W - 16, height: textH,
      text: label, containerId: recId, color: '#1e1e1e',
    }));
  }

  // 3. edges (arrow + optional bound label)
  edges.forEach((e, ei) => {
    const s = byId.get(e.from);
    const t = byId.get(e.to);
    if (!s || !t) return;
    const [p0, p1] = attach(s, t);
    arrowGeo.push({ from: e.from, to: e.to, p0, p1 });
    const aid = `e${ei}`;
    const head = e.arrowhead === 'none' ? null : (e.arrowhead || 'arrow');
    const labelId = e.label ? `e${ei}.t` : null;
    const arrow = baseElement(stamp, {
      id: aid, type: 'arrow', x: p0.x, y: p0.y,
      width: Math.abs(p1.x - p0.x), height: Math.abs(p1.y - p0.y),
      strokeColor: '#1e1e1e',
      strokeStyle: e.dashed ? 'dashed' : 'solid',
      roundness: null,
      boundElements: labelId ? [{ type: 'text', id: labelId }] : null,
      extra: {
        points: [[0, 0], [p1.x - p0.x, p1.y - p0.y]],
        lastCommittedPoint: null,
        startBinding: { elementId: s.id, focus: 0, gap: 4 },
        endBinding: { elementId: t.id, focus: 0, gap: 4 },
        startArrowhead: null,
        endArrowhead: head,
        elbowed: false,
      },
    });
    elements.push(arrow);
    for (const box of [s, t]) {
      box.boundElements = [...(box.boundElements || []), { type: 'arrow', id: aid }];
    }
    if (labelId) {
      // #6: bias the label toward the SOURCE (~0.38 along the edge) so labels on
      // edges that converge on one node fan out instead of stacking in one spot.
      const f = 0.38;
      const cx = p0.x + (p1.x - p0.x) * f;
      const cy = p0.y + (p1.y - p0.y) * f;
      const lw = Math.max(60, String(e.label).length * 8.5);
      elements.push(textElement(stamp, {
        id: labelId, x: cx - lw / 2, y: cy - 12, width: lw, height: 24,
        text: e.label, containerId: aid, fontSize: 14, color: '#495057',
      }));
    }
  });

  // 4. raw elements escape hatch (merged verbatim, version-stamped if missing)
  if (Array.isArray(spec.rawElements)) {
    for (const raw of spec.rawElements) {
      elements.push({
        version: stamp.version, versionNonce: nonce(), updated: stamp.updated,
        seed: nonce(), groupIds: [], frameId: null, isDeleted: false,
        boundElements: null, link: null, locked: false, angle: 0, opacity: 100,
        ...raw,
      });
    }
  }

  // overall bounding box of placed shapes
  const placed = elements.filter((el) => typeof el.x === 'number' && el.type !== 'text');
  const bbox = placed.length ? {
    minX: Math.min(...placed.map((e) => e.x)),
    minY: Math.min(...placed.map((e) => e.y)),
    maxX: Math.max(...placed.map((e) => e.x + (e.width || 0))),
    maxY: Math.max(...placed.map((e) => e.y + (e.height || 0))),
  } : { minX: 0, minY: 0, maxX: BOX_W, maxY: BOX_H };

  // 5. title
  if (spec.title) {
    elements.push(textElement(stamp, {
      id: 'title', x: bbox.minX, y: bbox.minY - 60, width: bbox.maxX - bbox.minX, height: 36,
      text: String(spec.title), align: 'center', vAlign: 'top', fontSize: 28, color: '#1e1e1e',
    }));
  }

  // 6. legend (only roles actually used; honors roleColors)
  if (spec.legend && usedRoles.size) {
    const roles = [...usedRoles];
    const ly = bbox.maxY + 48;
    const lx = bbox.minX;
    elements.push(textElement(stamp, {
      id: 'legend', x: lx, y: ly - 30, width: 120, height: 24,
      text: 'Legend', align: 'left', vAlign: 'top', fontSize: 18, color: '#1e1e1e',
    }));
    roles.forEach((role, i) => {
      const col = pal(role);
      const y = ly + i * 32;
      elements.push(baseElement(stamp, {
        id: `legend.${role}.s`, type: 'rectangle', x: lx, y, width: 24, height: 24,
        strokeColor: col.stroke, backgroundColor: col.bg, roundness: { type: 3 },
      }));
      elements.push(textElement(stamp, {
        id: `legend.${role}.t`, x: lx + 34, y: y + 2, width: 200, height: 20,
        text: ROLE_LABEL[role] || role, align: 'left', vAlign: 'top', fontSize: 16,
      }));
    });
  }

  const scene = {
    type: 'excalidraw',
    version: 2,
    source: 'https://github.com/mamadoudicko/exgram',
    elements,
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
  // non-Excalidraw advisory field; stripped before writing to disk (see main)
  Object.defineProperty(scene, '_warnings', { value: lintLayout(boxes, arrowGeo), enumerable: false });
  return scene;
}

// --- CLI ------------------------------------------------------------------
function main(argv) {
  const inPath = argv[2];
  if (!inPath) {
    console.error('usage: node lib/build.mjs <spec.json> [out.excalidraw]');
    process.exit(1);
  }
  const outPath = argv[3] || inPath.replace(/\.json$/, '') + '.excalidraw';
  const spec = JSON.parse(readFileSync(inPath, 'utf8'));
  const errors = validateSpec(spec);
  if (errors.length) {
    console.error('exgram: invalid spec:\n  - ' + errors.join('\n  - '));
    process.exit(1);
  }
  const scene = buildScene(spec);
  writeFileSync(outPath, JSON.stringify(scene, null, 2));
  const warnings = scene._warnings || [];
  if (warnings.length) {
    console.error(`exgram: ${warnings.length} layout warning(s) (consider simplifying the spec):`);
    for (const w of warnings) console.error('  ! ' + w);
  }
  console.error(`exgram: wrote ${scene.elements.length} elements -> ${outPath}`);
}

// run only when invoked directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
