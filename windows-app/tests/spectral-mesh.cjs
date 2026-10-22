'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Mesh = require('../src/spectral-mesh.js');
const frequencies = Array.from({ length: 1025 }, (_, bin) => bin);
const frames = Array.from({ length: 511 }, (_, fi) => ({ timeSeconds: .125 + fi * .25, amplitudes: Array(1025).fill(0), psd: Array(1025).fill(0) }));
frames[123].amplitudes[777] = 100; frames[123].psd[777] = 1000;
frames[252].amplitudes[1001] = 80; frames[252].psd[1001] = 640;
const spectrum = { frequencies, frames }, before = JSON.stringify(spectrum);
const prepared = Mesh.prepare(spectrum, { selectedFrame: 252, maxFrames: 20, maxBins: 40 });
assert.equal(JSON.stringify(spectrum), before, 'mesh creation never mutates FFT data');
assert.equal(prepared.totalFrames, 511); assert.equal(prepared.totalBins, 1025);
assert.equal(prepared.timeStart, .125); assert.equal(prepared.timeEnd, 127.625);
assert.equal(prepared.maxValue, 100);
assert(prepared.displayedFrames <= 22 && prepared.displayedBins <= 80, 'display budgets stay bounded');
assert(prepared.rows.some(row => row.fi === 123), 'a narrow high-amplitude transient survives frame selection');
assert(prepared.rows.some(row => row.fi === 252), 'the currently selected frame is never discarded');
assert.equal(prepared.rows[0].fi, 0); assert.equal(prepared.rows.at(-1).fi, 510);
const bins = prepared.rows[0].vertices.map(vertex => vertex.bin);
assert(bins.includes(777) && bins.includes(1001), 'global and selected-frame narrow spectral peaks survive');
assert.equal(bins[0], 0); assert.equal(bins.at(-1), 1024);
for (const row of prepared.rows) {
  assert.deepEqual(row.vertices.map(vertex => vertex.bin), bins, 'every frame uses the same actual frequency bins');
  for (const vertex of row.vertices) {
    assert.equal(vertex.frequencyHz, frequencies[vertex.bin]);
    assert.equal(vertex.timeSeconds, frames[vertex.fi].timeSeconds);
    assert.equal(vertex.value, frames[vertex.fi].amplitudes[vertex.bin]);
    assert.equal(vertex.x, vertex.frequencyHz / 1024);
    assert.equal(vertex.y, (vertex.timeSeconds - .125) / 127.5);
    assert.equal(vertex.z, vertex.value / 100 - .5);
  }
}
const psd = Mesh.prepare(spectrum, { metric: 'psd', selectedFrame: 123 });
assert.equal(psd.maxValue, 1000);
assert.equal(psd.rows.find(row => row.fi === 123).vertices.find(vertex => vertex.bin === 777).value, 1000);
const cropped = Mesh.prepare(spectrum, { maxFrequencyHz: 10.3 });
assert.equal(cropped.frequencyMaxHz, 10); assert.equal(cropped.totalBins, 11); assert.equal(cropped.sourceBins, 1025);
assert.equal(cropped.maxValue, 0); assert(cropped.rows.every(row => row.vertices.every(vertex => vertex.z === -.5)));
const single = Mesh.prepare({ frequencies: [0, 10], frames: [{ timeSeconds: .5, amplitudes: [0, 1], psd: [0, 2] }] });
assert.equal(single.timeStart, .5); assert.equal(single.timeEnd, .5);
assert(single.rows[0].vertices.every(vertex => vertex.y === .5), 'one frame does not invent a time extent');
assert.equal(Mesh.prepare({ frequencies: [], frames: [] }).rows.length, 0);
assert.throws(() => Mesh.prepare(spectrum, { metric: 'wrong' }), /Metric/);
assert.throws(() => Mesh.prepare(spectrum, { maxBins: 0 }), /maxBins/);
assert.throws(() => Mesh.prepare(spectrum, { maxFrequencyHz: NaN }), /maxFrequencyHz/);
assert.throws(() => Mesh.prepare({ frequencies: [0, 10], frames: [{ timeSeconds: 0, amplitudes: [0, NaN] }] }), /spectrum/);
assert.throws(() => Mesh.prepare({ frequencies: [0, 0], frames: [] }), /Frequency/);

const vertex = (fi, bin, y, value, z) => ({ fi, bin, frequencyHz: bin * 10, timeSeconds: fi, value, x: bin, y, z });
const row = (fi, y, value, z) => ({ fi, timeSeconds: fi, vertices: [vertex(fi, 0, y, value, z), vertex(fi, 1, y, value, z)] });
const project = (x, y, z) => ({ x: 1 + x * 6, y: 1 + y * 6, depth: z });
const raster = Mesh.rasterize({ rows: [row(0, 0, 1, 1), row(1, 1, 1, 1), row(2, 0, .2, 0), row(3, 1, .2, 0)], maxValue: 1 }, { width: 8, height: 8, project });
assert.equal(raster.pixels.length, 8 * 8 * 4); assert.equal(raster.depths.length, 64); assert.equal(raster.picks.length, 64);
assert.equal(raster.picks[0], 0, 'outside geometry has no picked sample');
for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) {
  const index = y * 8 + x;
  assert.equal(raster.depths[index], 1, 'later rear triangles cannot overwrite a near surface');
  assert(raster.vertices[raster.picks[index] - 1].fi < 2, 'picking follows the visible, nearest surface');
  assert.deepEqual([...raster.pixels.slice(index * 4, index * 4 + 4)], [255, 0, 255, 255]);
}
assert.equal(raster.vertices[raster.picks[9] - 1].bin, 0, 'readout snaps to an actual nearby vertex');
const zeros = Mesh.rasterize({ rows: [row(0, 0, 0, -.5), row(1, 1, 0, -.5)], maxValue: 0 }, { width: 8, height: 8, project });
assert.deepEqual([...zeros.pixels.slice(9 * 4, 9 * 4 + 4)], [0, 0, 255, 255]);
for (const [value, rgb] of [[0, [0, 0, 255]], [.2, [0, 255, 255]], [.4, [0, 255, 0]], [.6, [255, 255, 0]], [.8, [255, 0, 0]], [1, [255, 0, 255]]]) {
  const colored = Mesh.rasterize({ rows: [row(0, 0, value, 0), row(1, 1, value, 0)], maxValue: 1 }, { width: 8, height: 8, project });
  assert.deepEqual([...colored.pixels.slice(9 * 4, 9 * 4 + 4)], [...rgb, 255], 'palette lookup retains the documented color-scale stops');
}
const one = Mesh.rasterize(single, { width: 8, height: 8, project });
assert(one.picks.every(value => value === 0) && one.pixels.every(value => value === 0), 'one row cannot create fabricated surface triangles');
const degenerate = Mesh.rasterize({ rows: [row(0, 0, 0, 0), row(1, 0, 0, 0)], maxValue: 0 }, { width: 8, height: 8, project });
assert(degenerate.picks.every(value => value === 0));
assert.throws(() => Mesh.rasterize(single, { width: 0, height: 8, project }), /ขนาดภาพ/);
assert.throws(() => Mesh.rasterize(single, { width: 4096, height: 4096, project }), /ขนาดภาพ/);
assert.throws(() => Mesh.rasterize(single, { width: 8, height: 8, project: () => ({ x: NaN, y: 0, depth: 0 }) }), /Projection/);
const browser = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/spectral-mesh.js'), 'utf8'), browser);
assert.equal(typeof browser.SpectralMesh.prepare, 'function'); assert.equal(typeof browser.SpectralMesh.rasterize, 'function');
console.log('PASS: shared-frequency surface mesh, peak-preserving display bounds, real sample picks, depth occlusion, PSD, zero/single-frame handling and browser/CommonJS exports');
