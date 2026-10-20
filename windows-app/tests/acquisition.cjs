'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RecordingService, normalizeRecording } = require('../electron/recording-service.cjs');
const { DataStore, CSV_KEYS, dayKey } = require('../electron/data-store.cjs');
const Measurements = require('../src/measurements.js');

(async () => {
  let now = Date.parse('2026-10-20T00:00:00Z'); const clock = () => now;
  assert.equal(normalizeRecording().startMode, 'on-connect', 'the main Start action records by default');
  assert.equal(normalizeRecording({ startMode: 'manual' }).startMode, 'on-connect', 'legacy separate manual start follows the new combined Start action');
  const automatic = new RecordingService({ clock }); automatic.connect(); assert(automatic.active);
  assert.equal((await automatic.accept({ timestamp: new Date(now - 1).toISOString() }, { append: async () => { throw new Error('must not save verification'); } })).recordingState, 'before-start');
  automatic.disconnect();
  const manual = new RecordingService({ clock, settings: { startMode: 'monitor-only' } });
  assert.throws(() => manual.start(), /เริ่มอ่าน/); manual.connect(); assert.equal(manual.shouldRecord(), false);
  manual.start(); assert.equal(manual.shouldRecord(), true); assert.equal(manual.shouldRecord(now - 1), false, 'do not backfill pre-start verification samples'); manual.stop(); assert.equal(manual.shouldRecord(), false);
  assert.throws(() => manual.configure({ startMode: 'on-connect' }), /หยุดอ่าน/);
  manual.disconnect(); manual.configure({ startMode: 'on-connect', durationMinutes: 1 }); manual.connect();
  assert.equal(manual.shouldRecord(), true); now += 60000; assert.equal(manual.shouldRecord(), false, 'duration stops before accepting another reading');
  assert.equal(manual.snapshot().stopReason, 'duration'); assert(manual.snapshot().connected, 'a recording duration does not silently disconnect acquisition');
  manual.disconnect(); manual.configure({ startMode: 'scheduled', startAt: new Date(now + 60000).toISOString(), durationMinutes: 1 });
  manual.connect(); assert.equal(manual.shouldRecord(), false); now += 60000; manual.tick(); assert.equal(manual.shouldRecord(), true);
  manual.disconnect(); assert.equal(manual.shouldRecord(), false, 'scheduled recording never resumes after disconnect');
  manual.connect(); assert.equal(manual.snapshot().scheduleMissed, true); assert.equal(manual.shouldRecord(), false, 'expired schedule must not backfill or block monitoring'); manual.disconnect();
  assert.throws(() => normalizeRecording({ durationMinutes: -1 }), /ระยะเวลา/);
  assert.throws(() => normalizeRecording({ startMode: 'x' }), /รูปแบบ/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vectra-acquisition-'));
  try {
    const store = new DataStore(directory); store.saveRecording({ startMode: 'on-connect', durationMinutes: 20 }); assert.equal(store.loadRecording().durationMinutes, 20);
    const autoStore = new DataStore(path.join(directory, 'combined-start'));
    const autoWriter = new RecordingService({ clock }); autoWriter.connect();
    const autoReading = { motorId: 'AUTO', timestamp: new Date(now).toISOString(), value: 1.2, unit: 'mm/s' };
    assert.equal((await autoWriter.accept(autoReading, autoStore)).recorded, true, 'a successful default connection saves without a second start command');
    autoWriter.disconnect(); await autoStore.queue;
    assert.equal(autoWriter.snapshot().count, 1); assert.equal(autoWriter.snapshot().connected, false);
    assert(fs.readdirSync(autoStore.dataPath()).some(name => name.endsWith('.csv')));
    const frames = Array.from({ length: 600 }, (_, index) => ({ timestamp: new Date(Date.parse('2026-10-20T16:55:00Z') + index * 1000).toISOString(), motorId: 'MTR-01', value: 2, unit: 'mm/s', channels: Object.fromEntries([...Measurements.keys, 'temperature'].map(key => [key, key === 'accelerationX' && index === 350 ? -99 : key === 'displacementZ' && index === 351 ? 4999 : 2])), pollIntervalMs: 1000, actualIntervalMs: 1004 }));
    const errors = [], writer = new RecordingService({ settings: { startMode: 'monitor-only' }, clock: () => Date.parse(frames[0].timestamp), onError: (_id, error) => errors.push(error) });
    writer.connect();
    assert.equal((await writer.accept(frames[0], store)).recordingState, 'monitor-only');
    assert(!fs.existsSync(store.dataPath()), 'monitoring alone creates no measurement files');
    writer.start(); assert.equal((await writer.accept(frames[0], store)).recorded, true);
    writer.stop(); assert.equal((await writer.accept(frames[1], store)).recordingState, 'monitor-only');
    writer.start(); assert.equal((await writer.accept(frames[1], { append: async () => { throw new Error('Disk full'); } })).recordingState, 'error');
    assert.deepEqual(errors, ['Disk full']); assert.equal(writer.snapshot().lastError, 'Disk full');
    assert.equal(writer.snapshot().count, 0, 'failed writes never count as saved');
    await writer.accept(frames[1], { append: async () => {} });
    assert.equal(writer.snapshot().lastError, ''); assert.equal(writer.snapshot().lastSavedAt, frames[0].timestamp); writer.disconnect();
    await Promise.all(frames.slice(1).map(frame => store.append(frame)));
    const firstDay = dayKey(new Date(frames[0].timestamp)), lastDay = dayKey(new Date(frames.at(-1).timestamp));
    assert.notEqual(firstDay, lastDay, 'fixture crosses Bangkok midnight');
    for (const date of [firstDay, lastDay]) {
      const csv = fs.readFileSync(path.join(store.dataPath(), `readings-${date}-v2.csv`), 'utf8');
      assert.equal(csv.split(CSV_KEYS.join(',')).length - 1, 1, 'one header per daily file despite concurrent appends');
      assert(csv.includes('+07:00')); assert(csv.includes('"1004"'));
    }
    const range = await store.chartRange({ from: frames[0].timestamp, to: frames.at(-1).timestamp, motorId: 'MTR-01' });
    assert.equal(range.total, 600); assert(range.rows.some(frame => frame.channels.accelerationX === -99)); assert(range.rows.some(frame => frame.channels.displacementZ === 4999));
    assert.equal((await store.history({ date: firstDay, endDate: lastDay })).total, 600);
    await assert.rejects(store.chartRange({ from: frames[0].timestamp, to: frames.at(-1).timestamp, motorId: '' }), /เลือกมอเตอร์/);
    const thin = Measurements.thinFrames(frames, 120);
    assert(thin.length <= 120); assert(thin.some(frame => frame.channels.accelerationX === -99)); assert(thin.some(frame => frame.channels.displacementZ === 4999));
    assert.equal(Measurements.windowFrames(frames, 'session').length, 600);
    assert.equal(Measurements.windowFrames(frames, 'custom', 500).length, 500);
    assert.equal(Measurements.windowFrames(frames, '60s').length, 61);
    assert.equal(Measurements.nearest(frames, Date.parse(frames[300].timestamp)), 300);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  console.log('PASS: manual/automatic/scheduled recording, timed stop, daily CSV rotation, timestamps, nine-channel peaks and arbitrary history ranges');
})().catch(error => { console.error(error); process.exit(1); });
