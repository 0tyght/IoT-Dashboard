'use strict';

const { decodeRegisters } = require('./sensor-codec.cjs');
const { preset } = require('../src/power-registers.js');
const REGISTERS = preset('pm2200').fields;
const ORDERS = new Set(['ABCD','CDAB','BADC','DCBA']);

function decodePowerMeter(blocks, byteOrder = 'unconfirmed', model = 'pm2200') {
  const { fields, blocks: ranges } = preset(model);
  const entries = Object.entries(ranges);
  for (const [key, [,count]] of entries) {
    const words = blocks?.[key];
    if (!Array.isArray(words) || words.length !== count || words.some(word => !Number.isInteger(word) || word < 0 || word > 65535)) {
      throw new Error('ข้อมูล Power Meter ไม่ครบหรือไม่ถูกต้อง');
    }
  }
  if (byteOrder !== 'unconfirmed' && !ORDERS.has(byteOrder)) throw new Error('ลำดับข้อมูล Float ไม่ถูกต้อง');
  const values = {}, raw = {};
  for (const { key, address } of fields) {
    const [block, [start]] = entries.find(([, [offset,count]]) => address >= offset && address + 1 < offset + count);
    const pair = blocks[block].slice(address - start, address - start + 2);
    raw[key] = pair;
    try { values[key] = byteOrder === 'unconfirmed' ? null : decodeRegisters(pair, {dataType:'float32', byteOrder, scale:1}); }
    catch { values[key] = null; }
  }
  return { values, raw, byteOrder, quality:byteOrder === 'unconfirmed' ? 'unconfirmed' : 'decoded' };
}
module.exports = { REGISTERS, decodePowerMeter };
