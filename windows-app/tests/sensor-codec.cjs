'use strict';

const assert = require('node:assert/strict');
const { normalizeConfig, decodeRegisters, decodeVemseeSnapshot, registerCount } = require('../electron/sensor-codec.cjs');

const base = normalizeConfig({ path: 'COM3', sensorModel: 'custom', slaveId: 2, registerAddress: 100, dataType: 'float32', byteOrder: 'ABCD', scale: 1 });
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
assert.throws(() => normalizeConfig({ path: 'COM3', sensorModel: 'custom', slaveId: 248 }), /Slave ID/);
assert.throws(() => normalizeConfig({ path: 'COM3', scale: 0 }), /Scale/);
assert.throws(() => decodeRegisters([1], base), /ไม่ครบ/);

const vemsee = normalizeConfig({ path: 'COM4', sensorModel: 'vemsee-sn3001-wz3a-n01', slaveId: 254 });
assert.equal(vemsee.slaveId, 254);
assert.throws(() => normalizeConfig({ path: 'COM4', sensorModel: 'custom', slaveId: 254 }), /Slave ID/);
const snapshot = decodeVemseeSnapshot(
  [0xffc9, 12, 23, 34, 45, 56, 67],
  [0xfff6, 11, 12]
);
assert.deepEqual(snapshot.channels, {
  temperature: -5.5,
  velocityX: 1.2,
  velocityY: 2.3,
  velocityZ: 3.4,
  displacementX: 4.5,
  displacementY: 5.6,
  displacementZ: 6.7,
  accelerationX: -1,
  accelerationY: 1.1,
  accelerationZ: 1.2
});
assert.equal(snapshot.primaryAxis, 'Z');
assert.equal(snapshot.value, 3.4);
assert.throws(() => decodeVemseeSnapshot([1, 2], [1, 2, 3]), /0000H/);

console.log('PASS: sensor configuration validation and register decoding');
