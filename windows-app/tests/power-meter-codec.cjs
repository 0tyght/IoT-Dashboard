'use strict';
const assert = require('node:assert/strict');
const { REGISTERS, decodePowerMeter } = require('../electron/power-meter-codec.cjs');
const words = Array(20).fill(0);
for (const field of REGISTERS) {
  const buffer = Buffer.alloc(4); buffer.writeFloatBE(field.address === 3017 ? 2.5 : 220.5);
  const index = field.address - 3017; words[index] = buffer.readUInt16BE(0); words[index + 1] = buffer.readUInt16BE(2);
}
const blocks = {first:words.slice(0,16),last:words.slice(18,20)};
const unknown = decodePowerMeter(blocks);
assert.equal(unknown.quality, 'unconfirmed'); assert.equal(unknown.values.voltageAB, null);
assert.deepEqual(unknown.raw.voltageAB, words.slice(2,4));
const decoded = decodePowerMeter(blocks, 'ABCD');
assert.equal(decoded.values.voltageAB, 220.5); assert.equal(decoded.values.currentUnbalanceWorst, 2.5);
assert.equal(decoded.values.voltageLNAvg, 220.5); assert.throws(() => decodePowerMeter({first:words.slice(1),last:blocks.last}), /ไม่ครบ/);
assert.throws(() => decodePowerMeter(blocks, 'incorrect'), /ลำดับ/);
console.log('PASS: supplied meter offsets, guarded Float order, values and raw register words');
