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
const headers = ['รหัสรอบ', 'ชื่อรอบ', 'พื้นที่งาน', 'หมายเหตุรอบ', 'รหัสอุปกรณ์', 'ชื่ออุปกรณ์', 'ประเภทอุปกรณ์',
  'รายการวัด', 'หน่วย', 'จำนวนค่าที่ใช้ได้', 'จำนวนค่าที่ใช้ไม่ได้', 'ต่ำสุด', 'สูงสุด', 'เฉลี่ย', 'ค่าล่าสุด', 'เวลาแรก (+07:00)', 'เวลาล่าสุด (+07:00)'];

function recordMetrics(kind, row) {
  if (kind === 'points') {
    if (!row.pointId) return [];
    return [{ key: `point:${row.pointId}`, label: row.name || row.pointId, unit: row.unit, value: row.status === 'ok' ? row.value : null }];
  }
  if (kind === 'power') {
    return PowerRegisters.preset(row.model).fields.map(field => ({ ...field, value: row.values?.[field.key] }));
  }
  const fields = vibrationFields.filter(field => Object.hasOwn(row.channels || {}, field.key));
  if (fields.length) return fields.map(field => ({ ...field, value: row.channels[field.key] }));
  return [{ key: 'value', label: 'ค่าที่วัด', unit: row.unit, value: row.value }];
}

function collectRecord(devices, kind, row) {
  const time = Date.parse(row.timestamp);
  if (!Number.isFinite(time)) return;
  const key = kind === 'points' ? row.deviceId : kind === 'power' ? row.meterId && `PM:${row.meterId}` : row.motorId;
  if (typeof key !== 'string' || !/^(?:PM:)?[a-z0-9][a-z0-9_-]{0,23}$/i.test(key)) return;
  const power = key.startsWith('PM:');
  const id = power ? key.slice(3) : key;
  const deviceKey = key.toUpperCase();
  const name = kind === 'points' ? row.deviceName : row.name;
  if (!devices.has(deviceKey)) devices.set(deviceKey, { id, name: '', power, metrics: new Map() });
  const device = devices.get(deviceKey);
  if (name) device.name = name;
  for (const field of recordMetrics(kind, row)) {
    const unit = field.unit || '';
    const metricKey = JSON.stringify([field.key, unit]);
    if (!device.metrics.has(metricKey)) device.metrics.set(metricKey, { label: field.label, unit, count: 0, missing: 0 });
    const metric = device.metrics.get(metricKey);
    const value = field.value;
    if (!Number.isFinite(value)) { metric.missing++; continue; }
    if (!metric.count) Object.assign(metric, { min: value, max: value, mean: value, first: time, last: time, latest: value });
    metric.count++;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.mean += (value - metric.mean) / metric.count;
    metric.first = Math.min(metric.first, time);
    if (time >= metric.last) { metric.last = time; metric.latest = value; }
  }
}

async function writeRunReport(outputPath, runId, { info, journals }) {
  const devices = new Map();
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
        if (row?.runId === runId && row.source !== 'SIMULATION' && row.recorded !== false) collectRecord(devices, kind, row);
      }
    } finally { lines.close(); stream.destroy(); }
  }
  if (!devices.size) return { directory: null, count: 0, skipped };

  const started = Number.isFinite(Date.parse(info.runStartedAt)) ? localTimestamp(info.runStartedAt).slice(0, 19).replace('T', '_').replaceAll(':', '-') : '';
  const directory = path.join(outputPath, started ? `${started}_${runId}` : runId);
  await fs.promises.mkdir(directory, { recursive: true });
  const round = value => Number.isFinite(value) ? Number(value.toPrecision(12)) : null;
  for (const device of devices.values()) {
    const columns = [runId, info.runName, info.groupName, info.runNote, device.id, device.name || device.id, device.power ? 'Power Meter' : 'เซ็นเซอร์'];
    const rows = [...device.metrics.values()].map(metric => [...columns, metric.label, metric.unit, metric.count, metric.missing,
      round(metric.min), round(metric.max), round(metric.mean), round(metric.latest),
      metric.count ? localTimestamp(metric.first) : '', metric.count ? localTimestamp(metric.last) : '']);
    const body = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const file = path.join(directory, `${device.power ? 'meter' : 'sensor'}-${device.id}.csv`);
    const temporary = `${file}.tmp`;
    try {
      await fs.promises.writeFile(temporary, body, 'utf8');
      await fs.promises.rename(temporary, file);
    } finally { await fs.promises.rm(temporary, { force: true }); }
  }
  return { directory, count: devices.size, skipped };
}

module.exports = { writeRunReport };
