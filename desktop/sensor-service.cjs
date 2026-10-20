'use strict';

const ModbusRTU = require('modbus-serial');
const { SerialPort } = require('serialport');
const { normalizeConfig, decodeRegisters, registerCount } = require('./sensor-codec.cjs');

function closeClient(client) {
  return new Promise(resolve => {
    if (!client?.isOpen) return resolve();
    client.close(() => resolve());
  });
}

async function createClient(config) {
  const client = new ModbusRTU();
  await client.connectRTUBuffered(config.path, {
    baudRate: config.baudRate,
    parity: config.parity,
    dataBits: config.dataBits,
    stopBits: config.stopBits
  });
  client.setID(config.slaveId);
  client.setTimeout(config.timeout);
  return client;
}

async function readOnce(client, config) {
  const count = registerCount(config.dataType);
  const result = config.registerType === 'input'
    ? await client.readInputRegisters(config.registerAddress, count)
    : await client.readHoldingRegisters(config.registerAddress, count);
  const registers = Array.from(result.data || []);
  return { registers, value: decodeRegisters(registers, config) };
}

class SensorService {
  constructor({ onReading = () => {}, onStatus = () => {} } = {}) {
    this.client = null;
    this.config = null;
    this.timer = null;
    this.polling = false;
    this.onReading = onReading;
    this.onStatus = onStatus;
  }

  static async listPorts() {
    const ports = await SerialPort.list();
    return ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer || '',
      serialNumber: port.serialNumber || '',
      vendorId: port.vendorId || '',
      productId: port.productId || '',
      pnpId: port.pnpId || ''
    }));
  }

  static async test(rawConfig) {
    const config = normalizeConfig(rawConfig);
    let client;
    try {
      client = await createClient(config);
      const reading = await readOnce(client, config);
      return { ok: true, ...reading, config };
    } finally {
      await closeClient(client);
    }
  }

  async connect(rawConfig) {
    await this.disconnect();
    this.config = normalizeConfig(rawConfig);
    this.onStatus({ state: 'connecting', path: this.config.path, motorId: this.config.motorId });
    this.client = await createClient(this.config);
    this.onStatus({ state: 'connected', path: this.config.path, motorId: this.config.motorId });
    this.schedule(0);
    return { ok: true, config: this.config };
  }

  schedule(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), delay);
  }

  async poll() {
    if (!this.client || this.polling) return;
    this.polling = true;
    try {
      const reading = await readOnce(this.client, this.config);
      this.onReading({
        motorId: this.config.motorId,
        value: reading.value,
        rawRegisters: reading.registers,
        unit: this.config.unit,
        timestamp: new Date().toISOString(),
        source: 'RS485 / Modbus RTU',
        port: this.config.path,
        slaveId: this.config.slaveId
      });
      this.onStatus({ state: 'connected', path: this.config.path, motorId: this.config.motorId });
    } catch (error) {
      this.onStatus({ state: 'read-error', path: this.config.path, motorId: this.config.motorId, message: error.message });
    } finally {
      this.polling = false;
      if (this.client) this.schedule(this.config.pollInterval);
    }
  }

  async disconnect() {
    clearTimeout(this.timer);
    this.timer = null;
    const client = this.client;
    this.client = null;
    this.polling = false;
    await closeClient(client);
    if (this.config) this.onStatus({ state: 'disconnected', path: this.config.path, motorId: this.config.motorId });
  }
}

module.exports = { SensorService };
