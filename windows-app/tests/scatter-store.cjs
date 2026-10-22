'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DataStore, dayKey } = require('../electron/data-store.cjs');
const { normalizeConfig } = require('../electron/sensor-codec.cjs');

(async () => {
  const project = path.resolve(__dirname, '..'), root = path.join(project, '.test-tmp');
  fs.mkdirSync(root, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(root, 'scatter-store-'));
  const start = Date.parse('2026-10-20T00:00:00.000Z'), stamp = seconds => new Date(start + seconds * 1000).toISOString();
  const runA = '11111111-1111-4111-8111-111111111111', runB = '22222222-2222-4222-8222-222222222222';
  const profile = normalizeConfig({ motorId: 'MTR-01', path: 'COM3', slaveId: 1, sensorModel: 'vemsee-sn3001-wz3a-n01', registerType: 'holding', registerAddress: 0, dataType: 'int16', byteOrder: 'ABCD', frequencyByteOrder: 'ABCD', scale: .1, unit: 'mm/s', pollInterval: 1000 });
  const decodeConfig = Object.fromEntries(['sensorModel', 'registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale', 'unit'].map(key => [key, profile[key]]));
  const channels = index => ({ velocityX: index, velocityY: index * 2, velocityZ: index * 3, displacementX: index * 10, displacementY: index * 20, displacementZ: index * 30, accelerationX: index / 10, accelerationY: index / 20, accelerationZ: index / 30 });
  const record = (seconds, index, changes = {}) => ({ timestamp: stamp(seconds), motorId: profile.motorId, value: index * 3, port: profile.path, slaveId: profile.slaveId, unit: profile.unit, source: 'RS485 / Modbus RTU', sensorModel: profile.sensorModel, decodeConfig, runId: runA, runStartedAt: stamp(0), rawRegisters: { primary: [0, index, index * 2, index * 3] }, channels: channels(index), ...changes });
  const range = { from: stamp(0), to: stamp(20000), motorId: profile.motorId };
  let scenario = 0;
  const fixture = records => {
    const store = new DataStore(path.join(temporary, `case-${++scenario}`)), days = new Map();
    fs.mkdirSync(store.dataPath(), { recursive: true });
    for (const row of records) {
      const day = dayKey(new Date(row.timestamp));
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(row);
    }
    for (const [day, rows] of days) fs.writeFileSync(path.join(store.dataPath(), `readings-${day}.ndjson`), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    return store;
  };
  try {
    const population = Array.from({ length: 10000 }, (_, index) => record(index + 1, index));
    const store = fixture(population);
    const sampled = await store.scatterRange({ ...range, metric: 'velocity', limit: 200 });
    assert.equal(sampled.total, population.length);
    assert.equal(sampled.completeTotal, population.length);
    assert.equal(sampled.incompleteTotal, 0);
    assert.equal(sampled.rows.length, 200);
    assert.equal(sampled.sampling, 'uniform-record-sample');
    assert.equal(sampled.reduced, true);
    assert.deepEqual((await store.scatterRange({ ...range, metric: 'velocity', limit: 200 })).rows, sampled.rows, 'same journal and filters reproduce exactly the same uniform sample');
    assert(sampled.rows.every((row, index, rows) => !index || Date.parse(row.timestamp) >= Date.parse(rows[index - 1].timestamp)));
    const bins = Array(10).fill(0);
    sampled.rows.forEach(row => bins[Math.floor(row.channels.velocityX / 1000)]++);
    assert(bins.every(count => count >= 5 && count <= 40), `sample covers the full record population rather than time extrema: ${bins}`);
    assert(sampled.rows.every(row => population.find(original => original.timestamp === row.timestamp)?.rawRegisters.primary[1] === row.rawRegisters.primary[1]), 'original records and raw provenance are preserved');
    assert.equal(sampled.series[0].completeTotal, 10000);

    const incomplete = [record(1, 1), record(2, 2, { channels: { ...channels(2), velocityY: null } }), record(3, 3, { channels: { ...channels(3), velocityZ: undefined } }), record(4, 0)];
    const missingStore = fixture(incomplete);
    const velocity = await missingStore.scatterRange({ ...range, limit: 100 });
    assert.equal(velocity.total, 4); assert.equal(velocity.completeTotal, 2); assert.equal(velocity.incompleteTotal, 2);
    assert.equal(velocity.rows.length, 2); assert.equal(velocity.sampling, 'all'); assert.equal(velocity.reduced, false);
    assert.deepEqual(velocity.rows.map(row => row.channels.velocityX), [1, 0], 'zero is complete, while missing/null channels are excluded');
    const displacement = await missingStore.scatterRange({ ...range, metric: 'displacement', limit: 100 });
    assert.equal(displacement.completeTotal, 4, 'completeness is specific to the requested physical measurement');

    const mixed = fixture([
      ...population.slice(0, 2000),
      record(10001, 77, { runId: runB }),
      record(10002, 88, { runId: runB, motorId: 'OTHER' }),
      record(10003, 99, { runId: runB, port: 'COM4' }),
      record(10004, 111, { runId: runB, source: 'SIMULATION' }),
      record(10005, 122, { runId: runB, unit: 'µm', decodeConfig: { ...decodeConfig, unit: 'µm' } }),
      record(10006, 133, { runId: runB, decodeConfig: { ...decodeConfig, registerAddress: 9 } })
    ]);
    const exact = await mixed.scatterRange({ ...range, runId: runA, profile, limit: 100 });
    assert.equal(exact.rangeTotal, 2000); assert.equal(exact.total, 2000);
    assert(exact.rows.every(row => row.runId === runA && row.port === 'COM3' && row.unit === 'mm/s'));
    const strict = await mixed.scatterRange({ ...range, profile, limit: 100 });
    assert.equal(strict.rangeTotal, 2001, 'motor, source, port, units and decoder filter before series selection or sampling');
    assert.equal(strict.total, 1); assert.equal(strict.rows[0].value, 77 * 3, 'newest compatible run remains the default');
    assert.equal(strict.series.length, 2, 'distinct acquisition runs are not mixed into one point cloud');
    const aSeries = strict.series.find(item => item.runId === runA);
    const a = await mixed.scatterRange({ ...range, profile, seriesKey: aSeries.key, limit: 100 });
    assert.equal(a.total, 2000); assert.equal(a.rows.length, 100); assert(a.rows.every(row => row.runId === runA));
    assert.equal((await mixed.scatterRange({ ...range, profile, seriesKey: 'missing' })).total, 0);

    const legacy = record(1, 1, { runId: undefined, runStartedAt: undefined, sensorModel: undefined, decodeConfig: undefined });
    const legacyStore = fixture([legacy, record(2, 2)]);
    const old = await legacyStore.scatterRange({ ...range, runId: '__legacy__', profile, limit: 100 });
    assert.equal(old.total, 1); assert.equal(old.rows[0].runId, undefined);
    assert.equal(old.series[0].runId, '__legacy__', 'old records are explicit legacy data without invented IDs');
    const custom = fixture([record(1, 2, { sensorModel: 'custom', channels: undefined, decodeConfig: { ...decodeConfig, sensorModel: 'custom', registerAddress: 200 } })]);
    const customResult = await custom.scatterRange(range);
    assert.equal(customResult.total, 1); assert.equal(customResult.completeTotal, 0); assert.equal(customResult.incompleteTotal, 1); assert.deepEqual(customResult.rows, [], 'a scalar custom register cannot invent XYZ coordinates');

    const outOfRange = await store.scatterRange({ ...range, from: stamp(10), to: stamp(20), limit: 100 });
    assert.equal(outOfRange.total, 11); assert.equal(outOfRange.rows.length, 11);
    assert(outOfRange.rows.every(row => Date.parse(row.timestamp) >= Date.parse(stamp(10)) && Date.parse(row.timestamp) <= Date.parse(stamp(20))));
    for (const changes of [{ from: 'bad' }, { to: range.from }, { motorId: '' }, { profile: { ...profile, motorId: 'OTHER' } }, { metric: 'frequency' }, { limit: 99 }, { limit: 12001 }, { limit: 100.5 }]) await assert.rejects(store.scatterRange({ ...range, ...changes }));

    // A live append between passes must not alter the population used by the sample.
    const concurrent = fixture([record(1, 1), record(2, 2)]), originalRead = fs.createReadStream;
    let passes = 0;
    fs.createReadStream = function (file, options) {
      if (++passes === 2) fs.appendFileSync(file, JSON.stringify(record(3, 3)) + '\n');
      return originalRead.call(fs, file, options);
    };
    let snapshot;
    try { snapshot = await concurrent.scatterRange({ ...range, limit: 100 }); }
    finally { fs.createReadStream = originalRead; }
    assert.equal(snapshot.total, 2); assert.equal(snapshot.rows.length, 2); assert(!snapshot.rows.some(row => row.timestamp === stamp(3)));
    assert.equal((await concurrent.scatterRange({ ...range, limit: 100 })).total, 3, 'the next explicit load sees the newly appended reading');
    console.log('PASS: deterministic uniform scatter sampling, complete XYZ counts, run/identity isolation, snapshots, original metadata and legacy/custom handling');
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(root));
    assert(path.basename(temporary).startsWith('scatter-store-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
