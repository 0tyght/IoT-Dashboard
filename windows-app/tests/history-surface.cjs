'use strict';
const assert = require('node:assert/strict');
const Surface = require('../src/history-surface.js');
const base = Date.parse('2026-10-21T00:00:00Z');
const sample = (offset, value = 1, extra = {}) => ({ timestamp: new Date(base + offset).toISOString(), channels: { velocityX: value, velocityY: value + 1, velocityZ: value + 2, accelerationX: -value, displacementX: value * 10 }, pollIntervalMs: 1000, ...extra });

const irregular = Surface.prepare([sample(0), sample(100), sample(10000)]);
assert.equal(irregular.rows[1].x, .01, 'horizontal coordinates follow elapsed time, not sample ordinal');
assert.equal(irregular.rows.at(-1).x, 1);
assert.equal(irregular.rows.at(-1).z[2], .5, 'maximum value is not clipped below the labelled maximum');
assert.equal(irregular.gapCount, 1);
assert.notEqual(irregular.rows[1].segments[0], irregular.rows[2].segments[0]);

const many = Array.from({ length: 121 }, (_, index) => sample(index * 1000, index === 60 ? 5000 : 1));
many[30].channels.accelerationX = -999;
many[70].channels.displacementX = 12345;
const thinned = Surface.prepare(many, { budget: 120 });
assert(thinned.rows.some(row => row.frame === many[60]), 'retain an isolated velocity peak formerly discarded by uniform 120-row sampling');
assert(thinned.rows.some(row => row.frame === many[30]), 'retain extrema in channels other than the selected metric');
assert(thinned.rows.some(row => row.frame === many[70]));
assert.equal(thinned.high, 5002);

const missing = Surface.prepare([sample(0), sample(1000, 1, { channels: { velocityX: null, velocityY: 2, velocityZ: 3 } }), sample(2000)]);
assert.equal(missing.rows[1].values[0], null);
assert.notEqual(missing.rows[0].segments[0], missing.rows[2].segments[0], 'missing values break an axis even when a reduction omits the null row');
assert.equal(missing.rows[0].segments[1], missing.rows[2].segments[1], 'valid neighbouring axes remain continuous');
const reducedGap = Surface.prepare([sample(0), sample(10000)], { reduced: true, gapStarts: [new Date(base + 10000).toISOString()] });
assert.equal(reducedGap.gapCount, 1);
assert.notEqual(reducedGap.rows[0].segments[0], reducedGap.rows[1].segments[0]);
assert.equal(reducedGap.gapsKnown, true);
assert.equal(Surface.prepare([sample(0), sample(10000)], { reduced: true }).gapsKnown, false, 'legacy reduced data does not claim continuity is verified');

const frequencies = [sample(0, 1, { frequencyStatus: 'ok', channels: { frequencyX: 0, frequencyY: 50, frequencyZ: 100 } }), sample(1000, 1, { frequencyStatus: 'unconfirmed', channels: { frequencyX: 45, frequencyY: 50, frequencyZ: 55 } })];
const frequency = Surface.prepare(frequencies, { metric: 'frequency' });
assert.deepEqual(frequency.rows[0].values, [0, 50, 100]);
assert.deepEqual(frequency.rows[1].values, [null, null, null]);
assert.equal(frequency.valueCount, 3);

const single = Surface.prepare([sample(0)]);
assert.equal(single.rows[0].x, .5, 'a single recorded time has a real point at the center');
assert.equal(single.valueCount, 3);
for (const angle of [-.62, .8, 2.1]) {
  const project = Surface.projection(700, 320, angle);
  const target = { ...project(.01, .5, .25), rowIndex: 1, axisIndex: 1 };
  const other = { ...project(.9, 0, 0), rowIndex: 2, axisIndex: 0 };
  assert.equal(Surface.nearestProjected([other, target], target.x, target.y), target, 'hover selects the projected measurement under the pointer after rotation');
  assert.equal(Surface.nearestProjected([target], -1000, -1000), null, 'empty canvas areas do not fabricate a selected sample');
}
assert.equal(Surface.prepare([sample(0), { timestamp: 'broken' }]).sourceCount, 1);
console.log('PASS: historical 3D time coordinates, peak preservation, gap/missing-data provenance, frequency quality and projected picking');
