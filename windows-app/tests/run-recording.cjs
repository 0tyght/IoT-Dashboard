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
const parseFixtureCsv = csv => csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n').map(line => line.split(',').map(cell => cell.slice(1, -1)));

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
    const reports = [];
    const writer = new RecordingService({ settings: { startMode: 'monitor-only',runName:'ทดสอบ',runNote:'โหลด 50%' }, clock,
      onStop: runId => reports.push(store.generateRunReport(runId)) });
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
    assert.equal(first.runName,'ทดสอบ');assert.equal(first.runNote,'โหลด 50%');
    const metadata=JSON.parse(fs.readFileSync(path.join(store.runDataPath(first.runId),'run-metadata.json'),'utf8'));assert.equal(metadata.runName,'ทดสอบ');assert.equal(metadata.runNote,'โหลด 50%');
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
    const extraPoint = { id: 'amps', name: 'กระแสเสริม', unit: 'A', enabled: true, record: true, status: 'ok', value: 0, raw: [54321] };
    await writer.accept(input({ motorId: 'MTR-02', value: 8, channels: { velocityX: 8, frequencyX: null, temperature: 40 } }), store);
    await writer.acceptPower({ meterId: 'MTR-01', name: 'มิเตอร์ 1', model: 'pm2230', timestamp: third.timestamp, values: { currentA: 2.5, activePowerTotal: 0 }, points: [extraPoint] }, store);
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
    assert.notEqual(firstDate, secondDate, 'fixture crosses Bangkok midnight');
    for (const key of identityKeys) assert(CSV_KEYS.includes(key), `CSV exposes ${key}`);
    const [partialReport, completeReport, nextReport] = await Promise.all(reports);
    assert.equal(partialReport.count, 1);
    assert.equal(partialReport.directory, completeReport.directory, 'pause and resume use one report folder');
    assert.equal(completeReport.count, 3);
    assert.equal(path.basename(completeReport.directory), `2026-10-20_23-59-59_${first.runId}`);
    assert.deepEqual(fs.readdirSync(completeReport.directory).sort(), ['meter-MTR-01.csv', 'sensor-MTR-01.csv', 'sensor-MTR-02.csv']);
    assert.notEqual(nextReport.directory, completeReport.directory);
    assert.deepEqual(fs.readdirSync(nextReport.directory), ['sensor-MTR-01.csv']);
    assert(fs.readdirSync(store.dataPath()).every(name => !name.endsWith('.csv')), 'there are no automatic daily time-series CSVs');
    const reportCsv = name => fs.readFileSync(path.join(completeReport.directory, name), 'utf8');
    const sensor = reportCsv('sensor-MTR-01.csv');
    assert(sensor.startsWith('\uFEFF'));
    assert.deepEqual(parseFixtureCsv(sensor), [
      ['เวลา (+07:00)', 'ค่าที่วัด (mm/s)'],
      ['2026-10-20T23:59:59.000+07:00', '1.2'],
      ['2026-10-21T00:00:00.000+07:00', '1.3'],
      ['2026-10-21T00:00:01.000+07:00', '1.4']
    ]);
    assert.deepEqual(parseFixtureCsv(reportCsv('sensor-MTR-02.csv')), [
      ['เวลา (+07:00)', 'ความเร็วการสั่น X (mm/s)', 'ความถี่การสั่น X (Hz)', 'อุณหภูมิ (°C)'],
      ['2026-10-21T00:00:01.000+07:00', '8', '', '40']
    ]);
    const meter = reportCsv('meter-MTR-01.csv');
    const [meterHeader, meterReading, ...extraRows] = parseFixtureCsv(meter);
    assert.equal(extraRows.length, 0, 'meter custom points belong to the same sample');
    assert.equal(meterReading[meterHeader.indexOf('กระแส A (A)')], '2.5');
    assert.equal(meterReading[meterHeader.indexOf('กระแสเสริม [amps] (A)')], '0');
    assert(!meter.includes('54321'), 'decoded exports exclude raw register words');
    assert.equal((await new DataStore(path.join(directory, 'recording')).generateRunReport(first.runId)).directory, completeReport.directory);

    const pointRun = randomUUID();
    const pointRead = { runId: pointRun, runStartedAt: first.timestamp, motorId: 'ENV', timestamp: second.timestamp };
    const tempPoint = { ...extraPoint, id: 'temp', name: 'อุณหภูมิ', unit: '°C', value: 21, timestamp: first.timestamp };
    const rhPoint = { ...extraPoint, id: 'rh', name: 'ความชื้น', unit: '%', value: 50, timestamp: second.timestamp };
    await store.append({ ...pointRead, points: [tempPoint, rhPoint] });
    await store.append({ ...pointRead, timestamp: third.timestamp, points: [
      { ...tempPoint, value: 22, timestamp: third.timestamp }, { ...rhPoint, status: 'read-error', value: 999, timestamp: third.timestamp }
    ] });
    const pointReport = await store.generateRunReport(pointRun);
    assert.deepEqual(parseFixtureCsv(fs.readFileSync(path.join(pointReport.directory, 'sensor-ENV.csv'), 'utf8')), [
      ['เวลา (+07:00)', 'อุณหภูมิ [temp] (°C)', 'ความชื้น [rh] (%)'],
      ['2026-10-21T00:00:00.000+07:00', '21', '50'],
      ['2026-10-21T00:00:01.000+07:00', '22', '']
    ]);
    const savedRows = (await store.history({ date: firstDate, endDate: secondDate })).rows;
    assert.equal(savedRows.length, 5, 'reports do not duplicate history records');
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

    // Reopen an archive after a crash midway through writing the last line.
    const recoveredStore = new DataStore(path.join(directory, 'recovered'));
    fs.mkdirSync(recoveredStore.dataPath(), { recursive: true });
    const recoveredDate = dayKey(new Date(legacy.timestamp));
    const recoveredJournal = path.join(recoveredStore.dataPath(), `readings-${recoveredDate}.ndjson`);
    fs.writeFileSync(recoveredJournal, JSON.stringify(legacy) + '\n{"timestamp":', 'utf8');
    await recoveredStore.append({ ...legacy, value: 10 });
    const recoveredHistory = await recoveredStore.history({ date: recoveredDate });
    assert.equal(recoveredHistory.skipped, 1);
    assert.deepEqual(recoveredHistory.rows.map(row => row.value), [9, 10]);

    const exportFile = path.join(directory, 'history.csv');
    fs.writeFileSync(exportFile, 'previous contents');
    await assert.rejects(recoveredStore.exportHistory({ date: 'invalid' }, exportFile), /วันที่/);
    assert.equal(fs.readFileSync(exportFile, 'utf8'), 'previous contents');
    assert.equal(await recoveredStore.exportHistory({ date: recoveredDate }, exportFile), 2);
    assert.equal(fs.readFileSync(exportFile, 'utf8').trim().split('\r\n').length, 3);
    assert(!fs.readdirSync(directory).some(name => name.startsWith('.vectra-export-')));

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
    console.log('PASS: per-device time-series CSVs, custom point samples, run/recording identities and late-write session races');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), tempRoot);
    assert(path.basename(directory).startsWith('vectra-run-recording-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
