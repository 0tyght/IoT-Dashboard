'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const PowerRegisters = require('../src/power-registers.js');
const { groups } = require('../src/measurements.js');
const { csvCell, localTimestamp } = require('./csv.cjs');

const vibrationFields = [
  ...Object.entries({ velocity: 'ความเร็วการสั่น', displacement: 'การกระจัด', acceleration: 'ความเร่ง', frequency: 'ความถี่การสั่น' })
    .flatMap(([kind, label]) => ['X', 'Y', 'Z'].map(axis => ({ key: `${kind}${axis}`, label: `${label} ${axis}`, unit: groups[kind]?.unit || 'Hz' }))),
  { key: 'temperature', label: 'อุณหภูมิ', unit: '°C' }
];
const chunkSize = 65536;

function pointMetric(point, id) {
  const label = point.name && point.name !== id ? `${point.name} [${id}]` : id;
  return { key: `point:${id}`, label, unit: point.unit, value: point.status === 'ok' ? point.value : null };
}

function recordMetrics(kind, row) {
  if (kind === 'points') {
    if (!row.pointId) return [];
    return [pointMetric(row, row.pointId)];
  }
  if (kind === 'power') {
    const fields = PowerRegisters.preset(row.model).fields.map(field => ({ ...field, value: row.values?.[field.key] }));
    for (const point of Array.isArray(row.points) ? row.points : []) {
      if (point.id && point.enabled && point.record) fields.push(pointMetric(point, point.id));
    }
    return fields;
  }
  const fields = vibrationFields.filter(field => Object.hasOwn(row.channels || {}, field.key));
  if (fields.length) return fields.map(field => ({ ...field, value: row.channels[field.key] }));
  return [{ key: 'value', label: 'ค่าที่วัด', unit: row.unit, value: row.value }];
}

function toRecord(kind, row) {
  const key = kind === 'points' ? row.deviceId : kind === 'power' ? row.meterId && `PM:${row.meterId}` : row.motorId;
  if (typeof key !== 'string' || !/^(?:PM:)?[a-z0-9][a-z0-9_-]{0,23}$/i.test(key)) return;
  const deviceKey = key.toUpperCase();
  const power = deviceKey.startsWith('PM:');
  // Meter points are already included in the full meter snapshot.
  if (kind === 'points' && power) return;
  const timestamp = kind === 'points' && Number.isFinite(Date.parse(row.sampleTimestamp)) ? row.sampleTimestamp : row.timestamp;
  if (!Number.isFinite(Date.parse(timestamp))) return;
  const fields = recordMetrics(kind, row);
  if (!fields.length) return;
  const id = power ? key.slice(3) : key;
  const sampleKey = kind === 'points' ? row.sampleId || JSON.stringify([row.recordingId || '', timestamp]) : null;
  return { deviceKey, id, power, timestamp, sampleKey, fields };
}

const fieldKey = field => JSON.stringify([field.key, field.unit || '']);
const csvLine = cells => cells.map(csvCell).join(',') + '\r\n';

async function visitRecords(journals, runId, visit) {
  let skipped = 0;
  for (const { file, size, kind } of journals) {
    if (!size) continue;
    const stream = fs.createReadStream(file, { encoding: 'utf8', end: size - 1 });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        let row;
        try { row = JSON.parse(line); } catch { skipped++; continue; }
        if (row?.runId !== runId || row.source === 'SIMULATION' || row.recorded === false) continue;
        const record = toRecord(kind, row);
        if (record) await visit(record);
      }
    } finally { lines.close(); stream.destroy(); }
  }
  return skipped;
}

async function writeRunReport(outputPath, runId, { info, journals }) {
  const devices = new Map();
  const skipped = await visitRecords(journals, runId, record => {
    if (!devices.has(record.deviceKey)) devices.set(record.deviceKey, { id: record.id, power: record.power, columns: new Map(), buffer: '' });
    const { columns } = devices.get(record.deviceKey);
    for (const field of record.fields) {
      const key = fieldKey(field);
      if (!columns.has(key)) columns.set(key, field.unit ? `${field.label} (${field.unit})` : field.label);
    }
  });
  if (!devices.size) return { directory: null, count: 0, skipped };

  const started = Number.isFinite(Date.parse(info.runStartedAt)) ? localTimestamp(info.runStartedAt).slice(0, 19).replace('T', '_').replaceAll(':', '-') : '';
  const directory = path.join(outputPath, started ? `${started}_${runId}` : runId);
  await fs.promises.mkdir(directory, { recursive: true });
  async function flush(device) {
    if (!device.buffer) return;
    await fs.promises.appendFile(device.temporary, device.buffer, 'utf8');
    device.buffer = '';
  }
  async function appendSample(device, timestamp, values) {
    const cells = [localTimestamp(timestamp)];
    for (const key of device.columns.keys()) {
      const value = values.get(key);
      cells.push(Number.isFinite(value) ? value : null);
    }
    device.buffer += csvLine(cells);
    if (device.buffer.length >= chunkSize) await flush(device);
  }

  try {
    for (const device of devices.values()) {
      device.file = path.join(directory, `${device.power ? 'meter' : 'sensor'}-${device.id}.csv`);
      device.temporary = `${device.file}.tmp`;
      await fs.promises.writeFile(device.temporary, '\uFEFF' + csvLine(['เวลา (+07:00)', ...device.columns.values()]), 'utf8');
    }
    await visitRecords(journals, runId, async record => {
      const device = devices.get(record.deviceKey);
      const values = new Map(record.fields.map(field => [fieldKey(field), field.value]));
      const pending = device.pending;
      // Custom registers within one poll have separate receive times in the journal.
      // Older journals can only group points that have the exact same timestamp.
      if (pending && (pending.key !== record.sampleKey || [...values.keys()].some(key => pending.values.has(key)))) {
        await appendSample(device, pending.timestamp, pending.values);
        device.pending = null;
      }
      if (record.sampleKey === null) await appendSample(device, record.timestamp, values);
      else if (device.pending) {
        for (const [key, value] of values) device.pending.values.set(key, value);
      } else device.pending = { key: record.sampleKey, timestamp: record.timestamp, values };
    });
    for (const device of devices.values()) {
      if (device.pending) await appendSample(device, device.pending.timestamp, device.pending.values);
      await flush(device);
    }
    for (const device of devices.values()) await fs.promises.rename(device.temporary, device.file);
  } finally {
    for (const { temporary } of devices.values()) if (temporary) await fs.promises.rm(temporary, { force: true });
  }
  return { directory, count: devices.size, skipped };
}

module.exports = { writeRunReport, toRecord };
