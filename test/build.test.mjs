import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScene, PALETTE } from '../lib/build.mjs';

const REQUIRED = [
  'id', 'type', 'x', 'y', 'width', 'height', 'angle', 'strokeColor',
  'backgroundColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness',
  'opacity', 'groupIds', 'seed', 'version', 'versionNonce', 'isDeleted', 'updated',
];

const SAMPLE = {
  title: 'Checkout',
  legend: true,
  nodes: [
    { id: 'web', label: 'Web', role: 'frontend' },
    { id: 'api', label: 'API', role: 'backend' },
    { id: 'db', label: 'DB', role: 'datastore' },
  ],
  edges: [
    { from: 'web', to: 'api', label: 'HTTPS' },
    { from: 'api', to: 'db', dashed: true },
  ],
};

test('produces a valid excalidraw scene envelope', () => {
  const scene = buildScene(SAMPLE);
  assert.equal(scene.type, 'excalidraw');
  assert.equal(scene.version, 2);
  assert.ok(Array.isArray(scene.elements));
  assert.ok(scene.elements.length > 0);
  assert.equal(typeof scene.appState, 'object');
});

test('every element has the required excalidraw fields', () => {
  const scene = buildScene(SAMPLE);
  for (const el of scene.elements) {
    for (const f of REQUIRED) {
      assert.ok(f in el, `element ${el.type} missing field "${f}"`);
    }
    assert.ok(el.id, 'element has an id');
  }
});

test('nodes get a bound text label and palette colors', () => {
  const scene = buildScene(SAMPLE);
  const rects = scene.elements.filter((e) => e.type === 'rectangle');
  const web = rects.find((r) => r.backgroundColor === PALETTE.frontend.bg);
  assert.ok(web, 'frontend node uses the frontend fill');
  assert.equal(web.strokeColor, PALETTE.frontend.stroke);
  // bound text references the container
  const boundText = scene.elements.find((e) => e.type === 'text' && e.containerId === web.id);
  assert.ok(boundText, 'node has a container-bound text label');
  assert.ok(web.boundElements.some((b) => b.type === 'text' && b.id === boundText.id));
});

test('arrows bind to both endpoints and register on the boxes', () => {
  const scene = buildScene(SAMPLE);
  const arrows = scene.elements.filter((e) => e.type === 'arrow');
  assert.equal(arrows.length, 2);
  for (const a of arrows) {
    assert.ok(a.startBinding?.elementId, 'arrow has startBinding');
    assert.ok(a.endBinding?.elementId, 'arrow has endBinding');
    assert.ok(Array.isArray(a.points) && a.points.length === 2);
    const src = scene.elements.find((e) => e.id === a.startBinding.elementId);
    const dst = scene.elements.find((e) => e.id === a.endBinding.elementId);
    assert.ok(src.boundElements.some((b) => b.id === a.id), 'source lists the arrow');
    assert.ok(dst.boundElements.some((b) => b.id === a.id), 'target lists the arrow');
  }
  const dashed = arrows.find((a) => a.strokeStyle === 'dashed');
  assert.ok(dashed, 'dashed edge is rendered dashed');
});

test('legend renders only the roles used', () => {
  const scene = buildScene(SAMPLE);
  const legendTitle = scene.elements.find((e) => e.type === 'text' && e.text === 'Legend');
  assert.ok(legendTitle, 'legend is present when legend:true');
  const labels = scene.elements.filter((e) => e.type === 'text').map((e) => e.text);
  assert.ok(labels.includes('Frontend') && labels.includes('Backend') && labels.includes('Data store'));
});

test('title is rendered when provided', () => {
  const scene = buildScene(SAMPLE);
  assert.ok(scene.elements.some((e) => e.type === 'text' && e.text === 'Checkout'));
});

test('diamond shape and color override are honored', () => {
  const scene = buildScene({
    nodes: [{ id: 'd', label: 'Valid?', shape: 'diamond', role: 'decision', color: '#ff0000' }],
    edges: [],
  });
  const d = scene.elements.find((e) => e.type === 'diamond');
  assert.ok(d, 'diamond shape created');
  assert.equal(d.roundness, null, 'diamond has no roundness');
  assert.equal(d.backgroundColor, '#ff0000', 'color override applied');
});

test('rawElements pass through with bookkeeping stamped', () => {
  const scene = buildScene({
    rawElements: [{ type: 'text', x: 0, y: 0, width: 100, height: 20, text: 'hi', fontSize: 16 }],
  });
  const raw = scene.elements.find((e) => e.text === 'hi');
  assert.ok(raw, 'raw element merged');
  assert.equal(typeof raw.version, 'number');
  assert.equal(typeof raw.versionNonce, 'number');
  assert.equal(raw.isDeleted, false);
});

test('handles cycles without hanging', () => {
  const scene = buildScene({
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
  });
  assert.equal(scene.elements.filter((e) => e.type === 'arrow').length, 2);
});

test('edges referencing missing nodes are skipped, not fatal', () => {
  const scene = buildScene({
    nodes: [{ id: 'a', label: 'A' }],
    edges: [{ from: 'a', to: 'ghost' }],
  });
  assert.equal(scene.elements.filter((e) => e.type === 'arrow').length, 0);
});

test('ids and seeds are deterministic across rebuilds', () => {
  const a = buildScene(SAMPLE);
  const b = buildScene(SAMPLE);
  assert.deepEqual(b.elements.map((e) => e.id), a.elements.map((e) => e.id));
  assert.deepEqual(b.elements.map((e) => e.seed), a.elements.map((e) => e.seed));
  // ids are derived from the spec, not random
  assert.ok(a.elements.find((e) => e.id === 'n.web' && e.type === 'rectangle'));
  assert.ok(a.elements.find((e) => e.id === 'n.web.t' && e.type === 'text'));
});

test('arrow geometry adapts to edge direction', () => {
  // target to the LEFT of source -> arrow points leftward
  const left = buildScene({
    nodes: [{ id: 'a', label: 'A', x: 400, y: 0 }, { id: 'b', label: 'B', x: 0, y: 0 }],
    edges: [{ from: 'a', to: 'b' }],
  });
  const arrL = left.elements.find((e) => e.type === 'arrow');
  assert.ok(arrL.points[1][0] < 0, 'dx is negative for a right-to-left edge');
  assert.ok(arrL.width >= 0 && arrL.height >= 0, 'width/height stay absolute');

  // target BELOW source -> arrow points downward, vertical dominant
  const down = buildScene({
    nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }, { id: 'b', label: 'B', x: 0, y: 400 }],
    edges: [{ from: 'a', to: 'b' }],
  });
  const arrD = down.elements.find((e) => e.type === 'arrow');
  assert.ok(arrD.points[1][1] > 0, 'dy is positive for a top-to-bottom edge');
  assert.ok(Math.abs(arrD.points[1][1]) > Math.abs(arrD.points[1][0]), 'vertical component dominates');
});

test('multi-line labels grow the box height', () => {
  const one = buildScene({ nodes: [{ id: 'a', label: 'One' }], edges: [] });
  const three = buildScene({ nodes: [{ id: 'a', label: 'L1\nL2\nL3' }], edges: [] });
  const hOne = one.elements.find((e) => e.id === 'n.a').height;
  const hThree = three.elements.find((e) => e.id === 'n.a').height;
  assert.ok(hThree > hOne, 'a 3-line label produces a taller box than a 1-line label');
});

test('groups render an enclosing dashed box and label', () => {
  const scene = buildScene({
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    edges: [{ from: 'a', to: 'b' }],
    groups: [{ label: 'My group', nodeIds: ['a', 'b'] }],
  });
  const gbox = scene.elements.find((e) => e.id === 'g0' && e.type === 'rectangle');
  assert.ok(gbox, 'group box is present');
  assert.equal(gbox.strokeStyle, 'dashed');
  const glabel = scene.elements.find((e) => e.id === 'g0.t');
  assert.ok(glabel && glabel.text === 'My group', 'group label is present');
  const a = scene.elements.find((e) => e.id === 'n.a');
  assert.ok(gbox.x <= a.x && gbox.y <= a.y, 'group box encloses its members');
});

test('unlabeled group reserves no title row', () => {
  const base = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [] };
  const labeled = buildScene({ ...base, groups: [{ label: 'G', nodeIds: ['a', 'b'] }] });
  const unlabeled = buildScene({ ...base, groups: [{ nodeIds: ['a', 'b'] }] });
  const topY = (s) => s.elements.find((e) => e.id === 'g0').y;
  assert.ok(topY(unlabeled) > topY(labeled), 'unlabeled group top sits lower (no 22px title row)');
});
