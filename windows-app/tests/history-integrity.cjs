'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DataStore, dayKey } = require('../electron/data-store.cjs');
const { normalizeConfig } = require('../electron/sensor-codec.cjs');

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vectra-history-integrity-'));
  const base = Date.parse('2026-10-20T00:00:00.000Z');
  const timestamp = seconds => new Date(base + seconds * 1000).toISOString();
  const range = { from: timestamp(0), to: timestamp(86400), motorId: 'MTR-01' };
  const profile = normalizeConfig({ motorId: 'MTR-01', path: 'COM3', slaveId: 1, sensorModel: 'custom', registerType: 'holding', registerAddress: 200, dataType: 'uint16', byteOrder: 'ABCD', scale: .1, unit: 'mm/s', pollInterval: 1000 });
  const decodeConfig = config => Object.fromEntries(['sensorModel', 'registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale', 'unit'].map(key => [key, config[key]]));
  const reading = (seconds, value, changes = {}) => ({ motorId: profile.motorId, timestamp: timestamp(seconds), value, unit: profile.unit, port: profile.path, slaveId: profile.slaveId, sensorModel: profile.sensorModel, source: 'RS485 / Modbus RTU', pollIntervalMs: 1000, rawRegisters: [Math.round(value * 10)], decodeConfig: decodeConfig(profile), ...changes });
  let scenario = 0;
  const fixture = records => {
    const store = new DataStore(path.join(temporary, `case-${++scenario}`));
    fs.mkdirSync(store.dataPath(), { recursive: true });
    const days = new Map();
    for (const record of records) {
      const day = dayKey(new Date(record.timestamp));
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(record);
    }
    for (const [day, rows] of days) fs.writeFileSync(path.join(store.dataPath(), `readings-${day}.ndjson`), rows.map(record => JSON.stringify(record)).join('\n') + '\n', 'utf8');
    return store;
  };

  try {
    // Legacy custom records cannot establish the address, type/order or scale.
    const legacy = reading(1, 123, { decodeConfig: undefined, sensorModel: undefined });
    const legacyStore = fixture([legacy]);
    const strictLegacy = await legacyStore.chartRange({ ...range, profile });
    assert.equal(strictLegacy.total, 0, 'automatic restore must reject custom data without original decoding metadata');
    assert.equal(strictLegacy.rows.length, 0);
    const explicitLegacy = await legacyStore.chartRange(range);
    assert.equal(explicitLegacy.total, 1, 'explicit history can still inspect legacy data without an automatic-restore profile filter');
    assert.equal(explicitLegacy.rows[0].value, 123);

    // Identity filtering must precede the extrema reducer, not follow it.
    const previousConfig = { ...decodeConfig(profile), registerAddress: 100 };
    const mixedStore = fixture([
      reading(1, 0, { decodeConfig: previousConfig }),
      reading(2, 5),
      reading(3, 6),
      reading(4, 10, { decodeConfig: previousConfig })
    ]);
    const compatible = await mixedStore.chartRange({ ...range, profile });
    assert.equal(compatible.total, 2, 'count includes only the compatible acquisition identity');
    assert.deepEqual(compatible.rows.map(record => record.value), [5, 6], 'compatible non-extreme samples survive incompatible extrema in the same bucket');
    assert(compatible.rows.every(record => record.decodeConfig.registerAddress === 200));

    // Legacy preset rows have a recognizable channel structure and fixed conversion.
    const presetProfile = normalizeConfig({ ...profile, sensorModel: 'vemsee-sn3001-wz3a-n01', registerAddress: 0, dataType: 'int16', scale: .1, unit: 'mm/s' });
    const presetRow = reading(1, 2.4, {
      sensorModel: undefined, decodeConfig: undefined,
      channels: { velocityX: 1.2, velocityY: 2.4, velocityZ: 1.8, displacementX: 10, displacementY: 20, displacementZ: 30, accelerationX: .8, accelerationY: 1.2, accelerationZ: .9, temperature: 30 },
      rawRegisters: { primary: [300, 12, 24, 18, 100, 200, 300], acceleration: [8, 12, 9] }
    });
    const presetStore = fixture([presetRow]);
    const presetRange = await presetStore.chartRange({ ...range, profile: presetProfile });
    assert.equal(presetRange.total, 1, 'recognizable legacy preset channels remain restorable');
    assert.equal((await presetStore.chartRange({ ...range, profile })).total, 0, 'preset raw objects must not be restored as a custom register profile');
    assert.equal((await fixture([{ ...presetRow, channels: { temperature: 30 } }]).chartRange({ ...range, profile: presetProfile })).total, 0, 'an arbitrary channels object cannot identify the nine-channel preset');

    const mismatchStore = fixture([
      reading(1, 1),
      reading(2, 2, { port: 'COM4' }),
      reading(3, 3, { slaveId: 2 }),
      reading(4, 4, { unit: 'µm', decodeConfig: { ...decodeConfig(profile), unit: 'µm' } }),
      reading(5, 5, { source: 'SIMULATION' }),
      reading(6, 6, { decodeConfig: { ...decodeConfig(profile), scale: 10 } }),
      reading(7, 7, { decodeConfig: { ...decodeConfig(profile), registerType: 'input' } })
    ]);
    const matching = await mismatchStore.chartRange({ ...range, profile });
    assert.equal(matching.total, 1, 'port, slave, unit, source and decoding changes cannot leak into automatic restoration');
    assert.deepEqual(matching.rows.map(record => record.value), [1]);

    // Explicit history chooses one compatible series, never one unit for all data.
    const micrometreConfig = { ...decodeConfig(profile), unit: 'µm' };
    const unitsStore = fixture([
      reading(1, 5),
      reading(2, 1000, { unit: 'µm', decodeConfig: micrometreConfig }),
      reading(3, 6),
      reading(4, 2000, { unit: 'µm', decodeConfig: micrometreConfig })
    ]);
    const latestUnits = await unitsStore.chartRange(range);
    assert.equal(latestUnits.rangeTotal, 4, 'range count includes every schema/unit group');
    assert.equal(latestUnits.total, 2, 'chart count includes only its selected series');
    assert.equal(latestUnits.series.length, 2);
    assert(latestUnits.series.every(series => typeof series.key === 'string' && series.key.length));
    assert.equal(latestUnits.series.find(series => series.key === latestUnits.seriesKey).unit, 'µm', 'default series is the one with the latest timestamp');
    assert.deepEqual(latestUnits.rows.map(record => record.value), [1000, 2000]);
    assert(latestUnits.rows.every(record => record.unit === 'µm'));
    const velocitySeries = latestUnits.series.find(series => series.unit === 'mm/s');
    assert.equal(velocitySeries.sensorModel, 'custom');
    assert.equal(velocitySeries.port, profile.path);
    assert.equal(velocitySeries.slaveId, profile.slaveId);
    assert.equal(velocitySeries.total, 2);
    const selectedUnits = await unitsStore.chartRange({ ...range, seriesKey: velocitySeries.key });
    assert.equal(selectedUnits.seriesKey, velocitySeries.key);
    assert.equal(selectedUnits.rangeTotal, 4);
    assert.equal(selectedUnits.total, 2);
    assert.deepEqual(selectedUnits.rows.map(record => record.value), [5, 6], 'series filtering happens before incompatible-unit extrema reduction');
    assert(selectedUnits.rows.every(record => record.unit === 'mm/s'));

    const legacyMixedStore = fixture([legacy, reading(2, 9)]);
    const modernDefault = await legacyMixedStore.chartRange(range);
    assert.equal(modernDefault.series.length, 2, 'custom records with unknown original conversion stay separate from known metadata');
    assert.equal(modernDefault.rangeTotal, 2);
    assert.equal(modernDefault.total, 1);
    assert.equal(modernDefault.rows[0].value, 9);
    const legacySeries = modernDefault.series.find(series => series.key !== modernDefault.seriesKey);
    const selectedLegacy = await legacyMixedStore.chartRange({ ...range, seriesKey: legacySeries.key });
    assert.equal(selectedLegacy.total, 1, 'a user can explicitly select the legacy custom series');
    assert.equal(selectedLegacy.rows[0].value, 123);
    assert.equal(selectedLegacy.rows[0].decodeConfig, undefined);

    const schemaStore = fixture([presetRow, reading(2, 9)]);
    const latestSchema = await schemaStore.chartRange(range);
    assert.equal(latestSchema.series.length, 2, 'preset and scalar custom records remain separate even when their units match');
    assert.equal(latestSchema.rangeTotal, 2);
    assert.equal(latestSchema.total, 1);
    assert.equal(latestSchema.rows[0].value, 9);
    assert.equal(latestSchema.rows[0].channels, undefined);
    const presetSeries = latestSchema.series.find(series => series.sensorModel === presetProfile.sensorModel);
    assert(presetSeries, 'legacy channel structure identifies its preset series');
    const selectedPreset = await schemaStore.chartRange({ ...range, seriesKey: presetSeries.key });
    assert.equal(selectedPreset.total, 1);
    assert.equal(selectedPreset.rows[0].channels.velocityX, 1.2);

    const presetOrdersStore = fixture([
      { ...presetRow, frequencyByteOrder: 'unconfirmed', frequencyStatus: 'unconfirmed' },
      { ...presetRow, timestamp: timestamp(2), frequencyByteOrder: 'ABCD', frequencyStatus: 'ok', channels: { ...presetRow.channels, frequencyX: 50, frequencyY: 50, frequencyZ: 50 } }
    ]);
    const presetOrders = await presetOrdersStore.chartRange(range);
    assert.equal(presetOrders.series.length, 1, 'frequency format confirmation does not split an otherwise compatible preset schema');
    assert.equal(presetOrders.total, 2);

    const sourcesStore = fixture([reading(1, 7), reading(2, 8, { source: 'SIMULATION' })]);
    const sourceGroups = await sourcesStore.chartRange(range);
    assert.equal(sourceGroups.series.length, 2, 'simulation is a separate explicit-history series from real acquisition');
    assert.equal(sourceGroups.total, 1);
    assert.equal(sourceGroups.rows[0].source, 'SIMULATION');
    const realSeries = sourceGroups.series.find(series => series.key !== sourceGroups.seriesKey);
    const selectedReal = await sourcesStore.chartRange({ ...range, seriesKey: realSeries.key });
    assert.equal(selectedReal.rows[0].value, 7);
    assert.equal(selectedReal.rows[0].source, 'RS485 / Modbus RTU');

    // Catalog is derived before filtering the selected motor, including deleted IDs.
    const catalogStore = fixture([reading(1, 1), reading(2, 2, { motorId: 'MTR-02' }), reading(3, 3, { motorId: 'DELETED-01' })]);
    const catalog = await catalogStore.history({ date: dayKey(new Date(base)), motorId: profile.motorId });
    assert.equal(catalog.total, 1);
    assert.deepEqual([...catalog.motorIds].sort(), ['DELETED-01', 'MTR-01', 'MTR-02']);

    // Both gap boundaries are non-extrema inside a single 24-hour reducer bucket.
    const continuous = Array.from({ length: 100 }, (_, index) => reading(index < 50 ? index + 1 : index + 31, index));
    const gapStore = fixture(continuous), gaps = await gapStore.chartRange({ ...range, profile });
    const beforeGap = continuous[49].timestamp, afterGap = continuous[50].timestamp;
    assert.equal(gaps.total, 100);
    assert.equal(gaps.reduced, true);
    assert.deepEqual(gaps.gapStarts, [afterGap], 'gap markers come from original compatible samples, before display reduction');
    assert(gaps.rows.some(record => record.timestamp === beforeGap), 'the last sample before a missing period is retained');
    assert(gaps.rows.some(record => record.timestamp === afterGap), 'the first sample after a missing period is retained');

    // A single missing axis is not a time gap and must survive display reduction.
    const partialAxisRows = Array.from({ length: 201 }, (_, index) => {
      const velocityX = index === 50 ? null : 1 + index / 100;
      return { ...presetRow, sensorModel: presetProfile.sensorModel, timestamp: timestamp(index + 1), value: Math.max(velocityX ?? 0, 2.4), pollIntervalMs: 1000, rawRegisters: undefined, channels: { ...presetRow.channels, velocityX } };
    });
    const partialAxisStore = fixture(partialAxisRows);
    const partialAxis = await partialAxisStore.chartRange({ ...range, profile: presetProfile });
    assert.equal(partialAxis.total, 201);
    assert.equal(partialAxis.reduced, true, 'more than 160 samples in one reducer bucket produce a reduced display');
    assert.deepEqual(partialAxis.gapStarts, [], 'a missing X reading does not invent a communication time gap');
    const nullTimestamp = partialAxisRows[50].timestamp;
    const nullIndex = partialAxis.rows.findIndex(record => record.timestamp === nullTimestamp);
    assert(nullIndex > 0 && nullIndex < partialAxis.rows.length - 1, 'the null axis sample survives as an interior continuity marker');
    assert.equal(partialAxis.rows[nullIndex].channels.velocityX, null);
    assert.equal(partialAxis.rows[nullIndex - 1].timestamp, partialAxisRows[49].timestamp, 'the finite X sample immediately before missing data is retained');
    assert.equal(partialAxis.rows[nullIndex + 1].timestamp, partialAxisRows[51].timestamp, 'the finite X sample immediately after missing data is retained');
    assert(Number.isFinite(partialAxis.rows[nullIndex].channels.velocityY), 'other measured axes remain available at the same timestamp');

    console.log('PASS: strict history identity, explicit schema/unit/source series, legacy inspection, pre-reduction filtering/counts, motor catalog, time gaps and missing-axis continuity');
  } finally {
    const resolved = path.resolve(temporary), root = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolved), root);
    assert(path.basename(resolved).startsWith('vectra-history-integrity-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
