'use strict';

// Offsets are supplied by the user. The meaning of 3019 as a wire offset and
// the 32-bit word order still require validation against the actual meter.
const { decodeRegisters } = require('./sensor-codec.cjs');
const REGISTERS = Object.freeze([
  { key:'currentUnbalanceWorst', label:'Current unbalance worst', address:3017, unit:'%' },
  { key:'voltageAB', label:'Voltage A-B', address:3019, unit:'V' },
  { key:'voltageBC', label:'Voltage B-C', address:3021, unit:'V' },
  { key:'voltageCA', label:'Voltage C-A', address:3023, unit:'V' },
  { key:'voltageLLAvg', label:'Voltage L-L average', address:3025, unit:'V' },
  { key:'voltageAN', label:'Voltage A-N', address:3027, unit:'V' },
  { key:'voltageBN', label:'Voltage B-N', address:3029, unit:'V' },
  { key:'voltageCN', label:'Voltage C-N', address:3031, unit:'V' },
  { key:'voltageLNAvg', label:'Voltage L-N average', address:3035, unit:'V' }
]);
const ORDERS = new Set(['ABCD','CDAB','BADC','DCBA']);
function decodePowerMeter(blocks, byteOrder = 'unconfirmed') {
  const first = blocks?.first, last = blocks?.last;
  if (!Array.isArray(first) || first.length !== 16 || !Array.isArray(last) || last.length !== 2 || [...first, ...last].some(word => !Number.isInteger(word) || word < 0 || word > 65535)) throw new Error('ข้อมูล Power Meter ไม่ครบหรือไม่ถูกต้อง');
  if (byteOrder !== 'unconfirmed' && !ORDERS.has(byteOrder)) throw new Error('ลำดับข้อมูล Float ไม่ถูกต้อง');
  const values = {}, raw = {};
  for (const field of REGISTERS) {
    const pair = field.address === 3035 ? last.slice() : first.slice(field.address - 3017, field.address - 3017 + 2);
    raw[field.key] = pair;
    if (byteOrder === 'unconfirmed') values[field.key] = null;
    else {
      try { values[field.key] = decodeRegisters(pair, {dataType:'float32', byteOrder, scale:1}); }
      catch { values[field.key] = null; }
    }
  }
  return { values, raw, byteOrder, quality:byteOrder === 'unconfirmed' ? 'unconfirmed' : 'decoded' };
}
module.exports = { REGISTERS, decodePowerMeter };
