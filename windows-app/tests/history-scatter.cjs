'use strict';
const assert = require('node:assert/strict');
const Scatter = require('../src/history-scatter.js');
const origin = Date.parse('2026-10-22T00:00:00Z');
const sample = (offset, values, extra = {}) => ({ timestamp: new Date(origin + offset).toISOString(), channels: Object.fromEntries(values.map((value, index) => [`velocity${Scatter.axes[index]}`, value])), ...extra });

const input = [sample(1000, [4, 5, 6]), sample(0, [1, 2, 3]), sample(2000, [7, null, 9]), { timestamp: 'broken', channels: {} }];
const serialized = JSON.stringify(input), result = Scatter.prepare(input);
for (const index of [null, undefined, false, -1, 99, NaN, .5]) assert.equal(Scatter.selectedRow(result, index), null, 'empty or stale selection is always null, never the boolean false');
assert.equal(Scatter.selectedRow(null, 0), null); assert.equal(Scatter.selectedRow(Scatter.prepare([]), 0), null);
assert.equal(Scatter.selectedRow(result, 0), result.rows[0]);
assert.equal(Scatter.selectedRow(Scatter.prepare(input, { metric: 'displacement' }), 0), null, 'changing metric to an empty one cannot retain an old velocity selection');
assert.equal(JSON.stringify(input), serialized, 'preparing a scatter never mutates the loaded history');
assert.equal(result.rows.length, 2); assert.equal(result.completeCount, 2); assert.equal(result.excludedCount, 1); assert.equal(result.invalidTimeCount, 1);
assert.deepEqual(result.rows[0].values, [1, 2, 3]); assert.deepEqual(result.rows[1].values, [4, 5, 6]);
assert.equal(result.rows[0].stamp, origin); assert.equal(result.rows[1].stamp, origin + 1000);
assert.equal(result.rows[0].timeFraction, 0); assert.equal(result.rows[1].timeFraction, 1);
assert.equal(result.unit, 'mm/s');
assert(Math.abs((result.rows[0].y - result.rows[0].x) - (result.rows[0].z - result.rows[0].y)) < 1e-12, 'equal physical distances use one common axis scale');
for (const row of result.rows) for (const axis of ['x', 'y', 'z']) assert(row[axis] > 0 && row[axis] < 1);

const flat = Scatter.prepare([sample(0, [0, 0, 0])]);
assert.deepEqual([flat.rows[0].x, flat.rows[0].y, flat.rows[0].z], [.5, .5, .5]);
assert.equal(flat.rows[0].timeFraction, .5); assert.equal(flat.start, flat.end);
const constant = Scatter.prepare(Array.from({ length: 4 }, (_, i) => sample(i, [5, 5, 5])));
assert(constant.rows.every(row => row.x === constant.rows[0].x && row.y === row.x && row.z === row.x), 'constant values stay one location instead of inventing a spread');
const acceleration = Scatter.prepare([{ timestamp: new Date(origin).toISOString(), channels: { accelerationX: -2, accelerationY: 0, accelerationZ: 4 } }], { metric: 'acceleration' });
assert.equal(acceleration.unit, 'm/s²'); assert(acceleration.low < -2 && acceleration.high > 4);
const displacement = Scatter.prepare([{ timestamp: new Date(origin).toISOString(), displacementX: 10, displacementY: 20, displacementZ: 30 }], { metric: 'displacement' });
assert.deepEqual(displacement.rows[0].values, [10, 20, 30]); assert.equal(displacement.unit, 'µm');
assert.equal(Scatter.prepare([{ timestamp: new Date(origin).toISOString(), value: 4 }]).rows.length, 0, 'a custom scalar cannot invent three axes');
assert.equal(Scatter.prepare([sample(0, [1, Infinity, 3]), sample(1, [1, undefined, 3])]).rows.length, 0);
assert.throws(() => Scatter.prepare([], { metric: 'frequency' }), /ความเร็ว/);
assert.throws(() => Scatter.prepare([], { budget: 1 }), /8–10000/);

const many = Array.from({ length: 10001 }, (_, i) => sample(i, [Math.sin(i), Math.cos(i), i === 1234 ? 1000 : 3]));
const thinned = Scatter.prepare(many, { budget: 120 });
assert(thinned.rows.length <= 120); assert(thinned.rows.some(row => row.frame === many[1234]), 'time-bucket extrema retain an isolated peak');
assert.equal(thinned.rows[0].frame, many[0]); assert.equal(thinned.rows.at(-1).frame, many.at(-1)); assert.equal(thinned.completeCount, many.length); assert(thinned.reduced);
const uniform = Scatter.prepare(many, { budget: 120, sampling: 'uniform-record-sample' });
assert.equal(uniform.rows.length, 120); assert.equal(uniform.rows[0].frame, many[0]); assert.equal(uniform.rows.at(-1).frame, many.at(-1));
assert(!uniform.rows.some(row => row.frame === many[1234]), 'uniform backend samples must not be reshaped by a second extrema-biased selection');
assert(Scatter.prepare([sample(0, [1, 2, 3])], { reduced: true }).reduced, 'backend display reduction remains explicit even when no extra points are thinned');
assert.equal(Scatter.colorFor(0), 'rgb(0,123,141)'); assert.equal(Scatter.colorFor(1), 'rgb(103,80,197)'); assert.equal(Scatter.colorFor(-1), Scatter.colorFor(0)); assert.equal(Scatter.colorFor(2), Scatter.colorFor(1));

for (const rotation of [-.65, .8, 2.1, 4.2]) for (const elevation of [.2, .55, 1.3]) {
  const project = Scatter.projection(700, 350, rotation, elevation);
  const points = result.rows.map((row, rowIndex) => ({ ...project(row.x, row.y, row.z), rowIndex, radius: 4 }));
  for (const point of points) assert(['x', 'y', 'depth'].every(key => Number.isFinite(point[key])));
  assert.equal(Scatter.nearestVisible(points, points[0].x, points[0].y), points[0]);
  assert.equal(Scatter.nearestVisible(points, -1000, -1000), null);
}
const back = { x: 20, y: 20, depth: 0, rowIndex: 0, radius: 4 }, front = { x: 22, y: 20, depth: 1, rowIndex: 1, radius: 4 };
assert.equal(Scatter.nearestVisible([back, front], 20, 20), front, 'a front marker covering the pointer wins over a closer hidden center');
assert.equal(Scatter.nearestVisible([front, back], 20, 20), front, 'selection does not depend on caller ordering');
assert.equal(Scatter.nearestVisible([back, { ...front, x: 100 }], 20, 20), back);
assert.equal(Scatter.nearestVisible([back, front], NaN, 20), null);

// Exercise the actual renderer's state transitions with a small detached DOM.
// This catches null/boolean selection failures that pure coordinate tests cannot.
const vm = require('node:vm'), fs = require('node:fs');
class Element {
  constructor(tag, text = '') { this.tagName = tag; this.textContent = text || ''; this.children = []; this.dataset = {}; this.attributes = {}; this.options = []; this.value = ''; this.hidden = false; this.listeners = {}; }
  append(...items) { this.children.push(...items); }
  after(item) { this.afterElement = item; }
  add(option) { this.options.push(option); if (!this.value) this.value = option.value; }
  get selectedOptions() { return this.options.filter(option => option.value === this.value); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  getBoundingClientRect() { return { width: 640, height: 320, left: 0, top: 0 }; }
  getContext() { return { setTransform() {}, clearRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} }; }
}
const context = vm.createContext({
  module: { exports: {} }, node: (tag, text) => new Element(tag, text),
  Option: function (text, value) { return { textContent: text, value }; },
  controlLabel: (element, text) => { element.textContent = text; },
  document: { createElement: tag => new Element(tag), addEventListener() {} },
  window: { devicePixelRatio: 1 }, ResizeObserver: class { observe() {} },
  requestAnimationFrame: callback => { callback(); }, timestamp: value => new Date(value).toISOString()
});
vm.runInContext(fs.readFileSync(require.resolve('../src/history-scatter.js'), 'utf8') + '\nglobalThis.makeScatter = createHistoryScatter;', context);
let loaded = [], selectedProfile = { sensorModel: 'vemsee-sn3001-wz3a-n01', motorId: 'A' }, sampleKind = '', wasReduced = false;
const scatter = context.makeScatter(new Element('div'), { frames: () => loaded, profile: () => selectedProfile, reduced: () => wasReduced, sampling: () => sampleKind, total: () => 100 });
scatter.view.hidden = false;
assert.doesNotThrow(() => scatter.draw(), 'an empty scatter renders without reading false.frame.timestamp');
assert.equal(scatter.canvas.dataset.selectedTimestamp, ''); assert.equal(scatter.slider.disabled, true);
loaded = [sample(0, [1, 2, 3], { motorId: 'A' }), sample(1000, [4, 5, 6], { motorId: 'A' })]; scatter.draw();
assert.equal(scatter.canvas.dataset.recordCount, '2'); assert.equal(scatter.canvas.dataset.selectedTimestamp, '');
scatter.slider.value = '1'; scatter.slider.oninput(); assert.equal(scatter.canvas.dataset.selectedTimestamp, loaded[1].timestamp);
scatter.select.value = 'displacement'; assert.doesNotThrow(() => scatter.select.onchange());
assert.equal(scatter.canvas.dataset.recordCount, '0'); assert.equal(scatter.canvas.dataset.selectedTimestamp, ''); assert.equal(scatter.slider.disabled, true);
scatter.select.value = 'velocity'; scatter.select.onchange(); assert.equal(scatter.canvas.dataset.recordCount, '2');
selectedProfile = { sensorModel: 'custom', motorId: 'A' }; scatter.draw(); assert.equal(scatter.canvas.dataset.recordCount, '0');
selectedProfile = { sensorModel: 'vemsee-sn3001-wz3a-n01', motorId: 'B' }; scatter.draw(); assert.equal(scatter.canvas.dataset.recordCount, '0', 'motor identity changes cannot retain points from another motor');
loaded = [sample(2000, [7, 8, 9], { motorId: 'B' })]; scatter.draw(); assert.equal(scatter.canvas.dataset.recordCount, '1');
loaded.push(sample(3000, [10, 11, 12], { motorId: 'B' })); scatter.draw(); assert.equal(scatter.canvas.dataset.recordCount, '2', 'in-place append invalidates the prepared frame cache');
sampleKind = 'uniform-record-sample'; wasReduced = true; scatter.draw();
const caption = scatter.view.children.find(element => element.id === 'history-scatter-caption');
assert(caption.textContent.includes('จาก 100 รายการ')); assert.equal(scatter.canvas.dataset.selectedTimestamp, '');
loaded = []; scatter.draw(); assert.equal(scatter.canvas.dataset.recordCount, '0'); assert.equal(scatter.canvas.dataset.selectedTimestamp, '');
console.log('PASS: XYZ scatter physical axes/units, complete-record filtering, constant/negative domains, peak-preserving reduction, temporal colors and visible-point picking');
