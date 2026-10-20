'use strict';

const ModbusRTU = require('modbus-serial');
const { normalizeConfig, decodeRegisters, decodeVemseeSnapshot, registerCount } = require('./sensor-codec.cjs');

function normalizeFleet(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 64) throw new Error('เลือกมอเตอร์ 1–64 ตัว');
  const configs = raw.map(normalizeConfig);
  const ids = new Set(), addresses = new Set(), buses = new Map();
  for (const config of configs) {
    const id = config.motorId.toUpperCase();
    const address = `${config.path.toUpperCase()}:${config.slaveId}`;
    const bus = JSON.stringify([config.baudRate, config.parity, config.stopBits]);
    if (ids.has(id)) throw new Error(`รหัสมอเตอร์ซ้ำ: ${config.motorId}`);
    if (addresses.has(address)) throw new Error(`พอร์ตและ Slave ID ซ้ำ: ${address}`);
    if (buses.has(config.path.toUpperCase()) && buses.get(config.path.toUpperCase()) !== bus) throw new Error(`มอเตอร์บน ${config.path} ต้องใช้ Baud / Parity / Stop bits เดียวกัน`);
    ids.add(id); addresses.add(address); buses.set(config.path.toUpperCase(), bus);
  }
  return configs;
}

async function closeClient(client) {
  if (!client?.isOpen) return;
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 2000);
    client.close(() => { clearTimeout(timer); resolve(); });
  });
}

async function readSnapshot(client, config) {
  client.setID(config.slaveId);
  client.setTimeout(config.timeout);
  const read = async (address, count) => {
    const reply = config.registerType === 'input'
      ? await client.readInputRegisters(address, count)
      : await client.readHoldingRegisters(address, count);
    if (!Array.isArray(reply.data) || reply.data.length !== count || reply.data.some(value => !Number.isInteger(value) || value < 0 || value > 65535)) throw new Error('ข้อมูล Register ตอบกลับไม่ครบหรือไม่ถูกต้อง');
    return reply.data;
  };
  if (config.sensorModel === 'vemsee-sn3001-wz3a-n01') {
    const primary = await read(0, 7);
    const acceleration = await read(10, 3);
    return { ...decodeVemseeSnapshot(primary, acceleration), rawRegisters: { primary, acceleration } };
  }
  const registers = await read(config.registerAddress, registerCount(config.dataType));
  return { value: decodeRegisters(registers, config), unit: config.unit, rawRegisters: registers, channels: null };
}

class FleetService {
  constructor({ onReading = () => {}, onStatus = () => {}, clientFactory = () => new ModbusRTU() } = {}) {
    this.onReading = onReading; this.onStatus = onStatus; this.clientFactory = clientFactory;
    this.buses = []; this.generation = 0;
  }

  async open(config) {
    const client = this.clientFactory();
    try {
      await client.connectRTUBuffered(config.path, { baudRate: config.baudRate, parity: config.parity, dataBits: 8, stopBits: config.stopBits });
      return client;
    } catch (error) { await closeClient(client); throw error; }
  }

  async test(rawConfig) {
    if (this.buses.length) throw new Error('หยุดการอ่านก่อนทดสอบการเชื่อมต่อใหม่');
    const config = normalizeConfig(rawConfig);
    let client;
    try {
      client = await this.open(config);
      return { ok: true, config, ...await readSnapshot(client, config) };
    } finally { await closeClient(client); }
  }

  async connect(rawConfigs) {
    const configs = normalizeFleet(rawConfigs).filter(config => config.enabled);
    if (!configs.length) throw new Error('ไม่มีมอเตอร์ที่เปิดใช้งาน');
    await this.disconnect();
    const generation = this.generation;
    const groups = new Map();
    for (const config of configs) {
      const key = config.path.toUpperCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(config);
    }
    const initialReadings = [];
    try {
      for (const entries of groups.values()) {
        const bus = { configs: entries, client: null, timer: null, work: null, nextDue: new Map() };
        this.buses.push(bus);
        bus.client = await this.open(entries[0]);
        for (const config of entries) {
          const started = Date.now();
          this.onStatus({ state: 'testing', motorId: config.motorId, path: config.path });
          let snapshot;
          try { snapshot = await readSnapshot(bus.client, config); }
          catch (error) { throw new Error(`${config.motorId} (${config.path} / Slave ${config.slaveId}): ${error.message}`); }
          initialReadings.push(this.reading(config, snapshot, Date.now() - started));
          bus.nextDue.set(config.motorId, Date.now() + config.pollInterval);
        }
      }
      for (const bus of this.buses) this.schedule(bus, generation, 10);
      return { ok: true, configs, readings: initialReadings };
    } catch (error) {
      await this.disconnect();
      throw new Error(`ทดสอบก่อนเริ่มอ่านไม่สำเร็จ: ${error.message}`);
    }
  }

  reading(config, snapshot, elapsedMs) {
    return { ...snapshot, schemaVersion: 1, sensorModel: config.sensorModel, motorId: config.motorId, timestamp: new Date().toISOString(), source: 'RS485 / Modbus RTU', port: config.path, slaveId: config.slaveId, elapsedMs };
  }

  schedule(bus, generation, delay) {
    if (generation !== this.generation) return;
    bus.timer = setTimeout(() => {
      bus.work = this.poll(bus, generation).catch(error => this.onStatus({ state: 'read-error', message: error.message }));
    }, delay);
  }

  async poll(bus, generation) {
    for (const config of bus.configs) {
      if (generation !== this.generation) return;
      if ((bus.nextDue.get(config.motorId) || 0) > Date.now()) continue;
      const started = Date.now();
      try {
        if (!bus.client?.isOpen) bus.client = await this.open(config);
        const snapshot = await readSnapshot(bus.client, config);
        if (generation !== this.generation) return;
        this.onReading(this.reading(config, snapshot, Date.now() - started));
        this.onStatus({ state: 'receiving', motorId: config.motorId, path: config.path });
      } catch (error) {
        if (generation !== this.generation) return;
        this.onStatus({ state: 'read-error', motorId: config.motorId, path: config.path, message: error.message });
      }
      bus.nextDue.set(config.motorId, Date.now() + config.pollInterval);
    }
    const delay = Math.max(20, Math.min(...bus.configs.map(config => (bus.nextDue.get(config.motorId) || 0) - Date.now())));
    this.schedule(bus, generation, delay);
  }

  async disconnect() {
    this.generation += 1;
    const buses = this.buses; this.buses = [];
    for (const bus of buses) clearTimeout(bus.timer);
    await Promise.all(buses.map(async bus => {
      if (bus.work) await bus.work;
      await closeClient(bus.client);
    }));
  }
}

module.exports = { FleetService, normalizeFleet, readSnapshot };
