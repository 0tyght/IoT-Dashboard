'use strict';

const ALLOWED_BAUD_RATES = new Set([1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]);
const ALLOWED_PARITY = new Set(['none', 'even', 'odd']);
const ALLOWED_FUNCTIONS = new Set(['holding', 'input']);
const REGISTER_COUNTS = { uint16: 1, int16: 1, uint32: 2, int32: 2, float32: 2 };
const ALLOWED_ORDERS = new Set(['ABCD', 'CDAB', 'BADC', 'DCBA']);

function numberInRange(value, label, min, max, integer = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`${label} ต้องอยู่ระหว่าง ${min}–${max}`);
  }
  return number;
}

function normalizeConfig(input = {}) {
  const serialPath = String(input.path || '').trim();
  if (!serialPath || serialPath.length > 128) throw new Error('กรุณาเลือก COM Port');
  const dataType = String(input.dataType || 'float32');
  if (!(dataType in REGISTER_COUNTS)) throw new Error('ชนิดข้อมูลไม่รองรับ');
  const byteOrder = String(input.byteOrder || 'ABCD').toUpperCase();
  if (!ALLOWED_ORDERS.has(byteOrder)) throw new Error('Byte order ไม่รองรับ');
  const baudRate = Number(input.baudRate || 9600);
  if (!ALLOWED_BAUD_RATES.has(baudRate)) throw new Error('Baud rate ไม่รองรับ');
  const parity = String(input.parity || 'none').toLowerCase();
  if (!ALLOWED_PARITY.has(parity)) throw new Error('Parity ไม่รองรับ');
  const registerType = String(input.registerType || 'holding');
  if (!ALLOWED_FUNCTIONS.has(registerType)) throw new Error('Modbus function ไม่รองรับ');
  const scale = numberInRange(input.scale ?? 1, 'Scale', -1000000, 1000000);
  if (scale === 0) throw new Error('Scale ต้องไม่เป็น 0');
  return {
    path: serialPath,
    baudRate,
    parity,
    dataBits: 8,
    stopBits: Number(input.stopBits) === 2 ? 2 : 1,
    slaveId: numberInRange(input.slaveId ?? 1, 'Slave ID', 1, 247, true),
    registerType,
    registerAddress: numberInRange(input.registerAddress ?? 0, 'Register address', 0, 65535, true),
    dataType,
    byteOrder,
    scale,
    pollInterval: numberInRange(input.pollInterval ?? 2000, 'รอบอ่านข้อมูล', 250, 3600000, true),
    motorId: String(input.motorId || 'MTR-01').trim().slice(0, 24) || 'MTR-01',
    unit: String(input.unit || 'mm/s RMS').trim().slice(0, 32) || 'mm/s RMS',
    timeout: numberInRange(input.timeout ?? 1500, 'Timeout', 200, 30000, true)
  };
}

function orderedBytes(registers, order) {
  const source = Buffer.alloc(registers.length * 2);
  registers.forEach((value, index) => source.writeUInt16BE(Number(value) & 0xffff, index * 2));
  if (source.length < 4) return source;
  const bytes = [...source.slice(0, 4)];
  const maps = { ABCD: [0, 1, 2, 3], CDAB: [2, 3, 0, 1], BADC: [1, 0, 3, 2], DCBA: [3, 2, 1, 0] };
  return Buffer.from(maps[order].map(index => bytes[index]));
}

function decodeRegisters(registers, config) {
  if (!Array.isArray(registers) || registers.length < REGISTER_COUNTS[config.dataType]) throw new Error('จำนวน Register ที่ได้รับไม่ครบ');
  const buffer = orderedBytes(registers, config.byteOrder);
  let value;
  switch (config.dataType) {
    case 'uint16': value = buffer.readUInt16BE(0); break;
    case 'int16': value = buffer.readInt16BE(0); break;
    case 'uint32': value = buffer.readUInt32BE(0); break;
    case 'int32': value = buffer.readInt32BE(0); break;
    case 'float32': value = buffer.readFloatBE(0); break;
    default: throw new Error('ชนิดข้อมูลไม่รองรับ');
  }
  const scaled = value * config.scale;
  if (!Number.isFinite(scaled)) throw new Error('ค่าที่อ่านได้ไม่ใช่ตัวเลขที่ใช้งานได้');
  return scaled;
}

function registerCount(dataType) {
  return REGISTER_COUNTS[dataType] || 1;
}

module.exports = { normalizeConfig, decodeRegisters, registerCount };
