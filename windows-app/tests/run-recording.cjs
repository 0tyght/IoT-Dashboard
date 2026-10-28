'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { RecordingService } = require('../electron/recording-service.cjs');
const { DataStore, CSV_KEYS, csvRow, dayKey } = require('../electron/data-store.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identityKeys = ['schemaVersion', 'runId', 'runStartedAt', 'recordingId', 'recordingStartedAt'];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

(async () => {
  const scientific = csvRow({ value: -1e-7, motorId: '=1+1', unit: '-1e-7' });
  assert(scientific.includes('"-1e-7"'), 'negative scientific measurements remain numeric in CSV');
  assert(scientific.includes('"\'=1+1"') && scientific.includes('"\'-1e-7"'), 'user-provided text remains protected from spreadsheet formulas');
  const tempRoot = path.resolve(__dirname, '..', '.test-tmp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(tempRoot, 'vectra-run-recording-'));
  let now = Date.parse('2026-10-20T16:59:59.000Z');
  const base = now, clock = () => now;
  const input = (changes = {}) => ({ motorId: 'MTR-01', timestamp: new Date(now).toISOString(), value: 1.2, unit: 'mm/s', port: 'COM987', slaveId: 1, sensorModel: 'custom', source: 'RS485 / Modbus RTU', pollIntervalMs: 1000, rawRegisters: [12], decodeConfig: { sensorModel: 'custom', registerType: 'holding', registerAddress: 200, dataType: 'uint16', byteOrder: 'ABCD', scale: .1, unit: 'mm/s' }, ...changes });
  try {
    const store = new DataStore(path.join(directory, 'recording'));
    assert.deepEqual(await store.recordedDays(), [], 'no journal gives an empty date list');
    const writer = new RecordingService({ settings: { startMode: 'monitor-only' }, clock });
    const monitoring = writer.connect();
    assert.match(monitoring.runId, UUID, 'even read-only acquisition has a stable run identity');
    assert.equal(monitoring.runStartedAt, new Date(now).toISOString());
    assert(!monitoring.recordingId, 'a read-only run has no recording segment');
    const monitorInput = input(), monitorValue = await writer.accept(monitorInput, store);
    assert.equal(monitorValue.runId, monitoring.runId);
    assert.equal(monitorValue.runStartedAt, monitoring.runStartedAt);
    assert.equal(monitorValue.schemaVersion, 4);
    assert.equal(monitorValue.recorded, false);
    assert.equal(monitorValue.recordingState, 'monitor-only');
    assert(!fs.existsSync(store.dataPath()), 'monitoring assigns IDs without creating measurement files');
    assert.equal(monitorInput.runId, undefined, 'tagging never mutates the sensor input');

    const firstRecording = writer.start();
    assert.equal(firstRecording.runId, monitoring.runId);
    assert.match(firstRecording.recordingId, UUID);
    assert.equal(firstRecording.recordingStartedAt, new Date(now).toISOString());
    assert.equal(firstRecording.startedAt, firstRecording.recordingStartedAt, 'existing startedAt remains the current recording start');
    assert.equal(writer.start().recordingId, firstRecording.recordingId, 'starting an active recording does not silently allocate another segment');
    const first = await writer.accept(input(), store);
    for (const key of identityKeys) assert.equal(first[key], key === 'schemaVersion' ? 4 : firstRecording[key]);
    now += 1000;
    const second = await writer.accept(input({ value: 1.3 }), store);
    assert.equal(writer.snapshot().count, 2);
    writer.stop();
    now += 1000;
    const resumed = writer.start();
    assert.equal(resumed.runId, firstRecording.runId, 'resume stays in the same acquisition run');
    assert.notEqual(resumed.recordingId, firstRecording.recordingId, 'resume starts a separately identifiable recording segment');
    assert.equal(resumed.recordingStartedAt, new Date(now).toISOString());
    const third = await writer.accept(input({ value: 1.4 }), store);
    writer.disconnect();
    now += 1000;
    const restarted = writer.connect();
    assert.match(restarted.runId, UUID);
    assert.notEqual(restarted.runId, monitoring.runId, 'a new connection starts a new run');
    assert.equal(restarted.runStartedAt, new Date(now).toISOString());
    assert(!restarted.recordingId);
    writer.start();
    const fourth = await writer.accept(input({ value: 1.5 }), store);
    assert.notEqual(fourth.recordingId, third.recordingId);
    writer.disconnect();
    await store.queue;

    const firstDate = dayKey(new Date(first.timestamp)), secondDate = dayKey(new Date(fourth.timestamp));
    assert.deepEqual(await store.recordedDays(), [secondDate, firstDate], 'saved journal days are listed newest first');
    assert.notEqual(firstDate, secondDate, 'fixture tests per-run and daily Bangkok midnight rotation');
    for (const key of identityKeys) assert(CSV_KEYS.includes(key), `CSV exposes ${key}`);
    for (const date of [firstDate, secondDate]) {
      const daily = fs.readFileSync(path.join(store.dataPath(), `readings-${date}-v4.csv`), 'utf8');
      assert.equal(daily.split(CSV_KEYS.join(',')).length - 1, 1, 'daily file has exactly one v4 header');
      assert(daily.includes('"4"') && daily.includes(`"${first.runId}"`));
      assert(daily.includes('+07:00'));
      const runCsv = fs.readFileSync(path.join(store.dataPath(), 'runs', first.runId, `readings-${date}-v4.csv`), 'utf8');
      assert.equal(runCsv.split(CSV_KEYS.join(',')).length - 1, 1, 'per-run file has exactly one header');
      assert(runCsv.includes(`"${first.runId}"`));
      assert(!runCsv.includes(`"${fourth.runId}"`), 'per-run files cannot contain another run');
    }
    const resumedCsv = fs.readFileSync(path.join(store.dataPath(), 'runs', third.runId, `readings-${secondDate}-v4.csv`), 'utf8');
    assert(resumedCsv.includes(`"${first.recordingId}"`) && resumedCsv.includes(`"${third.recordingId}"`), 'separate recording segments retain their IDs inside a shared run file');
    assert(fs.existsSync(path.join(store.dataPath(), 'runs', fourth.runId, `readings-${secondDate}-v4.csv`)));
    for (const runId of [first.runId, fourth.runId]) assert(fs.readdirSync(path.join(store.dataPath(), 'runs', runId)).every(name => name.endsWith('-v4.csv')), 'NDJSON remains stored only in the daily archive');
    const savedRows = (await store.history({ date: firstDate, endDate: secondDate })).rows;
    assert.equal(savedRows.length, 4, 'per-run copies do not duplicate history records');
    assert(savedRows.every(row => row.schemaVersion === 4 && UUID.test(row.runId) && UUID.test(row.recordingId)), 'identities are persisted before append rather than only added to UI readings');

    // A date/motor scoped catalog remains complete when one run is selected.
    const legacy = input({ timestamp: new Date(base - 1000).toISOString(), value: 9 });
    const otherRun = randomUUID();
    await store.append(legacy);
    await store.append({ ...input({ motorId: 'MTR-02', value: 99 }), runId: otherRun, runStartedAt: new Date(now).toISOString(), recordingId: randomUUID(), recordingStartedAt: new Date(now).toISOString(), schemaVersion: 4 });
    const filter = { date: firstDate, endDate: secondDate, motorId: 'MTR-01' };
    const firstRun = await store.history({ ...filter, runId: first.runId });
    assert.equal(firstRun.total, 3);
    assert(firstRun.rows.every(row => row.runId === first.runId));
    assert.deepEqual(new Set(firstRun.runs.map(run => run.runId)), new Set([first.runId, fourth.runId, '__legacy__']), 'catalog is collected before run filtering and after motor filtering');
    assert(!firstRun.runs.some(run => run.runId === otherRun));
    const firstMeta = firstRun.runs.find(run => run.runId === first.runId);
    assert.equal(firstMeta.runStartedAt, first.runStartedAt);
    assert.equal(firstMeta.total, 3);
    assert.equal(firstMeta.firstTimestamp, first.timestamp);
    assert.equal(firstMeta.lastTimestamp, third.timestamp);
    assert.deepEqual(new Set(firstMeta.recordingIds), new Set([first.recordingId, third.recordingId]));
    assert.deepEqual(firstMeta.motorIds, ['MTR-01']);
    assert.equal(firstRun.runs[0].runId, fourth.runId, 'catalog sorts the newest sample first');
    const legacyHistory = await store.history({ ...filter, runId: '__legacy__' });
    assert.equal(legacyHistory.total, 1);
    assert.equal(legacyHistory.rows[0].value, 9);
    assert.equal(legacyHistory.rows[0].runId, undefined, 'legacy records stay unchanged on disk');
    const firstDayOnly = await store.history({ date: firstDate, motorId: 'MTR-01' });
    assert(!firstDayOnly.runs.some(run => run.runId === fourth.runId), 'catalog obeys the selected dates');

    const rangeFilter = { from: new Date(base - 2000).toISOString(), to: new Date(now + 2000).toISOString(), motorId: 'MTR-01' };
    const latestRange = await store.chartRange(rangeFilter);
    assert.equal(latestRange.series.length, 3, 'identical sensor schema in different runs is never merged');
    assert.equal(latestRange.rangeTotal, 5);
    assert.equal(latestRange.total, 1, 'default graph chooses the newest run rather than joining sessions');
    assert(latestRange.rows.every(row => row.runId === fourth.runId));
    const selectedSeries = latestRange.series.find(series => series.key === latestRange.seriesKey);
    assert.equal(selectedSeries.runId, fourth.runId);
    assert.equal(selectedSeries.runStartedAt, fourth.runStartedAt);
    const firstRange = await store.chartRange({ ...rangeFilter, runId: first.runId });
    assert.equal(firstRange.total, 3);
    assert.equal(firstRange.rangeTotal, 3, 'run filtering precedes grouping and extrema reduction');
    assert.equal(firstRange.series.length, 1);
    assert(firstRange.rows.every(row => row.runId === first.runId));
    const legacyRange = await store.chartRange({ ...rangeFilter, runId: '__legacy__' });
    assert.equal(legacyRange.total, 1);
    assert.equal(legacyRange.series[0].runId, '__legacy__');
    assert.equal(legacyRange.rows[0].value, 9);

    // Reject path-shaped/reserved IDs before even creating the daily archive.
    const unsafeStore = new DataStore(path.join(directory, 'unsafe'));
    for (const runId of ['../escape', '..\\escape', 'C:\\outside', '/absolute', 'a/b', 'CON', '__legacy__']) {
      await assert.rejects(async () => unsafeStore.append({ ...input(), runId }), /run|รอบ|รหัส|ไม่ถูกต้อง/i);
      assert(!fs.existsSync(unsafeStore.dataPath()), `invalid runId ${runId} must create no files`);
    }

    // Delayed completion belongs to the identity captured before awaiting disk I/O.
    for (const transition of ['reconnect', 'resume']) for (const fails of [false, true]) {
      const changes = [], service = new RecordingService({ clock, onChange: state => changes.push(state) });
      const old = service.connect(), pending = deferred();
      let submitted;
      const saving = service.accept(input(), { append: record => { submitted = record; return pending.promise; } });
      assert.equal(submitted.runId, old.runId);
      assert.equal(submitted.recordingId, old.recordingId, 'append receives captured identity immediately');
      now += 1000;
      if (transition === 'reconnect') { service.disconnect(); service.connect(); }
      else { service.stop(); service.start(); }
      const current = service.snapshot(), emitted = changes.length;
      assert.notEqual(current.recordingId, old.recordingId);
      if (transition === 'reconnect') assert.notEqual(current.runId, old.runId);
      else assert.equal(current.runId, old.runId);
      if (fails) pending.reject(new Error('late old-session error')); else pending.resolve();
      const completed = await saving;
      assert.equal(completed.runId, old.runId);
      assert.equal(completed.recordingId, old.recordingId);
      assert.equal(completed.recorded, !fails);
      assert.equal(service.snapshot().count, 0, `${transition}: old writes cannot increment the new counter`);
      assert.equal(service.snapshot().lastSavedAt, '');
      assert.equal(service.snapshot().lastError, '', `${transition}: old write failures cannot poison the new recording`);
      assert.equal(changes.length, emitted, 'late I/O must not emit a misleading update for the current run');
      const currentValue = await service.accept(input(), { append: async () => {} });
      assert.equal(currentValue.runId, current.runId);
      assert.equal(currentValue.recordingId, current.recordingId);
      assert.equal(service.snapshot().count, 1);
      service.disconnect();
    }
    console.log('PASS: run/recording identities, isolated v4 CSVs, legacy/run history filters and late-write session races');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), tempRoot);
    assert(path.basename(directory).startsWith('vectra-run-recording-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
