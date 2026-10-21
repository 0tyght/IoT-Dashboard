'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FleetService, normalizeFleet } = require('../electron/fleet-service.cjs');
const { DataStore, csvRow, dayKey } = require('../electron/data-store.cjs');
const config = { path: 'COM8', motorId: 'MTR-01', sensorModel: 'vemsee-sn3001-wz3a-n01', slaveId: 1, pollInterval: 250, frequencyByteOrder: 'ABCD' };
const second = { ...config, motorId: 'MTR-02', slaveId: 2 };

(async () => {
  assert.throws(() => normalizeFleet([config, { ...second, slaveId: 1 }]), /Slave ID ซ้ำ/);
  assert.throws(() => normalizeFleet([config, { ...second, baudRate: 19200 }]), /เดียวกัน/);
  assert.throws(() => normalizeFleet([config, { ...second, motorId: 'mtr-01' }]), /รหัสมอเตอร์ซ้ำ/);
  let active = 0, maxConcurrent = 0, opens = 0, failSlave = 0, rejectFrequency = false, frequencyReads = 0;
  class FakeClient {
    async connectRTUBuffered() { this.isOpen = true; opens++; }
    setID(id) { this.id = id; }
    setTimeout() {}
    async readHoldingRegisters(address, count) {
      active++; maxConcurrent = Math.max(active, maxConcurrent);
      try {
        await new Promise(resolve => setTimeout(resolve, 2));
        if (this.id === failSlave) throw new Error('Timed out');
        if (address === 0x21) { frequencyReads++; if (rejectFrequency) throw Object.assign(new Error('Illegal address'), { modbusCode: 2 }); return { data: [0x4248, 0, 0x4270, 0, 0x447a, 0] }; }
        return { data: address === 0 ? [350, 12, 23, 34, 40000, 10, 20] : Array(count).fill(12) };
      } finally { active--; }
    }
    readInputRegisters(address, count) { return this.readHoldingRegisters(address, count); }
    close(callback) { this.isOpen = false; callback(); }
  }
  const readings = [], statuses = [];
  const service = new FleetService({ clientFactory: () => new FakeClient(), onReading: value => readings.push(value), onStatus: status => statuses.push(status) });
  const result = await service.connect([config, second]);
  assert.equal(result.readings.length, 2); assert.equal(opens, 1); assert.equal(result.readings[0].channels.displacementX, 4000);
  assert.equal(result.readings[0].channels.frequencyX, 50); assert.equal(result.readings[0].rawRegisters.frequency.length, 6);
  await assert.rejects(service.test(config), /หยุดการอ่าน/);
  failSlave = 2;
  await new Promise(resolve => setTimeout(resolve, 350));
  assert(readings.some(reading => reading.motorId === 'MTR-01'));
  assert(readings.some(reading => reading.pollIntervalMs === 250 && reading.actualIntervalMs >= 240), 'measure actual receive period separately from configured request period');
  assert(statuses.some(status => status.motorId === 'MTR-02' && status.state === 'read-error'));
  assert.equal(maxConcurrent, 1, 'shared serial bus must never issue concurrent reads');
  await service.disconnect(); const stoppedCount = readings.length;
  await new Promise(resolve => setTimeout(resolve, 300)); assert.equal(readings.length, stoppedCount, 'no late reading after disconnect');
  await assert.rejects(service.connect([config, second]), /ทดสอบก่อนเริ่ม/); assert.equal(service.buses.length, 0);
  const maintenance = await service.connect([config, { ...second, enabled: false }]);
  assert.equal(maintenance.configs.length, 1);
  await service.disconnect();
  failSlave = 0; rejectFrequency = true; const previousFrequencyReads = frequencyReads;
  const partial = await service.connect([config]);
  assert.equal(partial.readings[0].frequencyStatus, 'unsupported'); assert.equal(partial.readings[0].channels.velocityX, 1.2);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(frequencyReads - previousFrequencyReads, 1, 'unsupported supplemental registers do not overload every poll or block primary data');
  await service.disconnect();
  await assert.rejects(service.connect([{ ...config, enabled: false }]), /ไม่มีมอเตอร์/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vectra-store-test-'));
  try {
    const store = new DataStore(directory);
    assert.deepEqual(store.loadProfiles(), []);
    store.saveProfiles([config, second]); assert.equal(store.loadProfiles().length, 2);
    await Promise.all(result.readings.map(reading => store.append(reading)));
    const date = dayKey(), history = await store.history({ date }); assert.equal(history.total, 2);
    assert.equal((await store.history({ date, motorId: 'MTR-02' })).rows.length, 1);
    await assert.rejects(store.history({ date: '../escape' }), /วันที่/);
    await fs.promises.appendFile(path.join(store.dataPath(), `readings-${date}.ndjson`), 'corrupt line\n');
    assert.equal((await store.history({ date })).skipped, 1);
    fs.writeFileSync(store.profilesPath(), 'corrupt'); assert.throws(() => store.loadProfiles(), /ไฟล์เดิมยังอยู่/);
    assert(csvRow({ motorId: '=WEBSERVICE("bad")' }).includes("'=WEBSERVICE"));
    assert(csvRow({ channels: { displacementX: 4000 } }).includes('4000'));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  console.log('PASS: shared-bus serialization, failure isolation, disconnect, atomic profiles, history and CSV');
})().catch(error => { console.error(error); process.exit(1); });
