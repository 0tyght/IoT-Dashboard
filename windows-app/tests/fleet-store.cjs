'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FleetService, normalizeFleet } = require('../electron/fleet-service.cjs');
const { normalizeGroups } = require('../electron/measurement-groups.cjs');
const { DataStore, csvRow, dayKey } = require('../electron/data-store.cjs');
const config = { path: 'COM8', motorId: 'MTR-01', sensorModel: 'vemsee-sn3001-wz3a-n01', slaveId: 1, pollInterval: 250, frequencyByteOrder: 'ABCD' };
const second = { ...config, motorId: 'MTR-02', slaveId: 2 };

async function waitUntil(condition, label, timeout = 4000) {
  const deadline = performance.now() + timeout;
  while (!condition()) {
    assert(performance.now() < deadline, label);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function checkCancelledStartup() {
  let finishRead;
  const blocked = new Promise(resolve => { finishRead = resolve; });
  const opened = [], closed = [], requests = [];
  class StartupClient {
    async connectRTUBuffered(port) { this.port = port; this.isOpen = true; opened.push(port); }
    setID() {}
    setTimeout() {}
    async readHoldingRegisters(address, count) {
      requests.push([this.port, address]);
      if (this.port === 'COM8') await blocked;
      return { data: Array(count).fill(0) };
    }
    close(done) { this.isOpen = false; closed.push(this.port); done(); }
  }
  const service = new FleetService({ clientFactory: () => new StartupClient() });
  const connecting = assert.rejects(service.connect([config, { ...second, path: 'COM9' }]), /หยุดการอ่าน/);
  try {
    await waitUntil(() => requests.some(([port]) => port === 'COM8') && requests.some(([port]) => port === 'COM9'), 'independent ports probe concurrently');
  } finally {
    const stopping = service.disconnect();
    finishRead();
    await Promise.all([stopping, connecting]);
  }
  assert.deepEqual(opened.sort(), ['COM8', 'COM9']);
  assert.deepEqual(closed.sort(), ['COM8', 'COM9']);
  assert.deepEqual(requests.filter(([port]) => port === 'COM8'), [['COM8', 0]], 'canceling startup prevents another register request');
  assert.equal(service.buses.length, 0);
}

async function checkMixedBusTimeoutRecovery() {
  let failFrequency = true, failPrimary = false, failedAt = 0;
  const requests = [], readings = [], powerReadings = [], statuses = [];
  class ThreeDeviceClient {
    async connectRTUBuffered() { this.isOpen = true; }
    setID(id) { this.id = id; }
    setTimeout() {}
    async readHoldingRegisters(address, count) {
      requests.push({ id: this.id, address, at: performance.now() });
      if (this.id === 1 && ((address === 0x21 && failFrequency) || (address === 0 && failPrimary))) {
        failedAt = performance.now();
        throw Object.assign(new Error('Timed out'), { errno: 'ETIMEDOUT' });
      }
      return { data: address === 0x21 ? [0x4248, 0, 0x4248, 0, 0x4248, 0] : Array(count).fill(0) };
    }
    close(done) { this.isOpen = false; done(); }
  }
  const group = normalizeGroups([{ id: 'G1', name: 'Three devices', motorIds: [config.motorId, second.motorId], meters: [
    { id: 'P1', model: 'pm2230', path: 'COM8', slaveId: 3, pollInterval: 250 }
  ] }])[0];
  const fleet = new FleetService({
    clientFactory: () => new ThreeDeviceClient(),
    onReading: reading => readings.push(reading),
    onPower: reading => powerReadings.push(reading),
    onStatus: status => statuses.push(status)
  });
  try {
    const start = await fleet.connect([config, second], group.meters);
    assert.equal(start.readings[0].frequencyStatus, 'read-error');
    assert.match(start.readings[0].frequencyMessage, /COM8 · Slave ID 1 · FC03 · Register 33/);
    assert.equal(start.readings[1].channels.frequencyX, 50);
    assert.equal(start.powerReadings[0].state, 'receiving');
    assert(requests.find(request => request.id === 2).at - failedAt >= 50, 'allow time for a late frame after timeout');
    failFrequency = false;
    await waitUntil(() => readings.some(reading => reading.motorId === config.motorId), 'primary readings continue while Hz is in cooldown');
    assert.equal(requests.filter(request => request.id === 1 && request.address === 0x21).length, 1);

    failPrimary = true;
    await waitUntil(() => statuses.some(status => status.motorId === config.motorId && status.state === 'read-error'), 'primary timeout is reported');
    assert.match(statuses.find(status => status.state === 'read-error').message, /Timeout 1500 ms · COM8 · Slave ID 1 · FC03 · Register 0/);
    failPrimary = false;
    const sensorCount = readings.filter(reading => reading.motorId === second.motorId).length;
    const powerCount = powerReadings.length;
    await waitUntil(() => readings.filter(reading => reading.motorId === second.motorId).length > sensorCount && powerReadings.length > powerCount, 'other devices continue while the failing sensor waits');
    assert(!requests.some(request => request.id === 1 && request.at > failedAt), 'do not immediately retry the failing sensor');
    await waitUntil(() => requests.some(request => request.id === 1 && request.at > failedAt), 'failing sensor is retried automatically');
    const retry = requests.find(request => request.id === 1 && request.at > failedAt);
    assert(retry.at - failedAt >= 990);
    await waitUntil(() => readings.some(reading => reading.motorId === config.motorId && reading.channels.frequencyX === 50), 'frequency reading resumes after cooldown', 6500);
  } finally {
    await fleet.disconnect();
  }
}

(async () => {
  assert.throws(() => normalizeFleet([config, { ...second, slaveId: 1 }]), /Slave ID ซ้ำ/);
  assert.throws(() => normalizeFleet([config, { ...second, baudRate: 19200 }]), /เดียวกัน/);
  assert.throws(() => normalizeFleet([config, { ...second, motorId: 'mtr-01' }]), /รหัสมอเตอร์ซ้ำ/);
  let active = 0, maxConcurrent = 0, minFrameGap = Infinity, opens = 0, failSlave = 0, rejectFrequency = false, frequencyReads = 0;
  class FakeClient {
    async connectRTUBuffered() { this.isOpen = true; opens++; }
    setID(id) { this.id = id; }
    setTimeout() {}
    async readHoldingRegisters(address, count) {
      if (this.lastFinishedAt) minFrameGap = Math.min(minFrameGap, Date.now() - this.lastFinishedAt);
      active++; maxConcurrent = Math.max(active, maxConcurrent);
      try {
        await new Promise(resolve => setTimeout(resolve, 2));
        if (this.id === failSlave) throw new Error('Timed out');
        if (address === 0x21) { frequencyReads++; if (rejectFrequency) throw Object.assign(new Error('Illegal address'), { modbusCode: 2 }); return { data: [0x4248, 0, 0x4270, 0, 0x447a, 0] }; }
        return { data: address === 0 ? [350, 12, 23, 34, 40000, 10, 20] : Array(count).fill(12) };
      } finally { active--; this.lastFinishedAt = Date.now(); }
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
  await assert.rejects(service.testPower(config, {slaveId:3,address:3019}), /หยุดการอ่าน/);
  failSlave = 2;
  await new Promise(resolve => setTimeout(resolve, 350));
  assert(readings.some(reading => reading.motorId === 'MTR-01'));
  assert(readings.some(reading => reading.pollIntervalMs === 250 && reading.actualIntervalMs >= 240), 'measure actual receive period separately from configured request period');
  assert(statuses.some(status => status.motorId === 'MTR-02' && status.state === 'read-error'));
  assert.equal(maxConcurrent, 1, 'shared serial bus must never issue concurrent reads');
  assert(minFrameGap >= 4, 'successive RTU requests leave the required silent interval at 9600 baud');
  await service.disconnect(); const stoppedCount = readings.length;
  const meterCheck = await service.testPower(config, {slaveId:3,address:3019,registerType:'holding'});
  assert.deepEqual(meterCheck.raw, [12,12]); assert.equal(meterCheck.slaveId,3); assert.equal(meterCheck.address,3019);
  await assert.rejects(service.testPower(config, {slaveId:1,address:3019}), /ซ้ำ/);
  const directMeter=await service.testPower({...config,slaveId:4},{slaveId:4,address:3019,meterConfig:true});assert.equal(directMeter.slaveId,4);assert.deepEqual(directMeter.raw,[12,12]);
  await assert.rejects(service.testPower(config, {slaveId:3,address:65535}), /Address/);
  await new Promise(resolve => setTimeout(resolve, 300)); assert.equal(readings.length, stoppedCount, 'no late reading after disconnect');
  const isolated=await service.connect([config,second]);assert.equal(isolated.readings.length,1);assert.equal(isolated.initialFailures[0].motorId,'MTR-02');assert.equal(service.buses.length,1);await service.disconnect();
  const maintenance = await service.connect([config, { ...second, enabled: false }]);
  assert.equal(maintenance.configs.length, 1);
  await service.disconnect();
  failSlave = 0; rejectFrequency = true; const previousFrequencyReads = frequencyReads;
  const partial = await service.connect([config]);
  assert.equal(partial.readings[0].frequencyStatus, 'unsupported'); assert.equal(partial.readings[0].channels.velocityX, 1.2);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(frequencyReads - previousFrequencyReads, 1, 'unsupported supplemental registers do not overload every poll or block primary data');
  await service.disconnect();
  await assert.rejects(service.connect([{ ...config, enabled: false }]), /ไม่มีอุปกรณ์/);
  await checkMixedBusTimeoutRecovery();
  await checkCancelledStartup();

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vectra-store-test-'));
  try {
    const store = new DataStore(directory);
    assert.deepEqual(store.loadProfiles(), []);
    store.saveProfiles([config, second]); assert.equal(store.loadProfiles().length, 2);store.saveProfiles([config,{...second,slaveId:1}]);assert.equal(store.loadProfiles().length,2,'alternative workspaces may reuse port and ID');store.saveProfiles([]);assert.deepEqual(store.loadProfiles(),[]);store.saveProfiles([config,second]);
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
  console.log('PASS: shared-bus serialization, mixed-device timeout recovery, disconnect, atomic profiles, history and CSV');
})().catch(error => { console.error(error); process.exit(1); });
