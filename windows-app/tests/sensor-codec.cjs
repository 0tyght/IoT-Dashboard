'use strict';

const assert = require('node:assert/strict');
const { normalizeConfig, decodeRegisters, registerCount } = require('../electron/sensor-codec.cjs');

const base = normalizeConfig({ path: 'COM3', slaveId: 2, registerAddress: 100, dataType: 'float32', byteOrder: 'ABCD', scale: 1 });
assert.equal(base.baudRate, 9600);
assert.equal(base.pollInterval, 2000);
assert.equal(base.motorId, 'MTR-01');
assert.equal(registerCount('float32'), 2);
assert.equal(registerCount('uint16'), 1);

const float = Buffer.alloc(4);
float.writeFloatBE(12.5);
const registers = [float.readUInt16BE(0), float.readUInt16BE(2)];
assert.equal(decodeRegisters(registers, base), 12.5);
assert.equal(decodeRegisters([0x0002], { ...base, dataType: 'uint16', scale: 0.1 }), 0.2);
assert.equal(decodeRegisters([0x0000, 0x4148], { ...base, byteOrder: 'CDAB' }), 12.5);
assert.throws(() => normalizeConfig({ path: '', slaveId: 1 }), /COM Port/);
assert.throws(() => normalizeConfig({ path: 'COM3', slaveId: 248 }), /Slave ID/);
assert.throws(() => normalizeConfig({ path: 'COM3', scale: 0 }), /Scale/);
assert.throws(() => decodeRegisters([1], base), /ไม่ครบ/);

console.log('PASS: sensor configuration validation and register decoding');
