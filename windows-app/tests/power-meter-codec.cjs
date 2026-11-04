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

const pm2230 = require('../src/power-registers.js').preset('pm2230');
assert.deepEqual(pm2230.blocks, {first:[2999,34],last:[3035,2],power:[3053,24],frequency:[3109,2]});
const pmBlocks = Object.fromEntries(Object.entries(pm2230.blocks).map(([key, [, count]]) => [key, Array(count).fill(0)]));
const currents = Buffer.alloc(4), frequency = Buffer.alloc(4), activePower = Buffer.alloc(4);
currents.writeFloatBE(7.5);
frequency.writeFloatBE(50);
activePower.writeFloatBE(4.25);
pmBlocks.first.splice(0, 2, currents.readUInt16BE(0), currents.readUInt16BE(2));
pmBlocks.frequency.splice(0, 2, frequency.readUInt16BE(0), frequency.readUInt16BE(2));
pmBlocks.power.splice(6, 2, activePower.readUInt16BE(0), activePower.readUInt16BE(2));
assert.equal(decodePowerMeter(pmBlocks, 'unconfirmed', 'pm2230').values.currentA, null);
const pmResult = decodePowerMeter(pmBlocks, 'ABCD', 'pm2230');
assert.equal(pmResult.values.currentA, 7.5);
assert.equal(pmResult.values.frequency, 50);
assert.equal(pmResult.values.activePowerTotal, 4.25);
assert.deepEqual(pmResult.raw.frequency, [0x4248, 0]);
console.log('PASS: PM2230 RTU addressing, Float32 and confirmed/read-only raw modes');
