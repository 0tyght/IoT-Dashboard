'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { normalizeFleet } = require('./fleet-service.cjs');
const { normalizeRecording } = require('./recording-service.cjs');

function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

class DataStore {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve(); }
  dataPath() { return path.join(this.directory, 'data'); }
  profilesPath() { return path.join(this.directory, 'motors.json'); }
  loadRecording() {
    try { return normalizeRecording(JSON.parse(fs.readFileSync(path.join(this.directory, 'recording.json'), 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return normalizeRecording(); throw new Error(`อ่านการตั้งค่าบันทึกไม่ได้: ${error.message}`); }
  }
  saveRecording(raw) {
    const settings = normalizeRecording(raw), file = path.join(this.directory, 'recording.json');
    fs.mkdirSync(this.directory, { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(settings, null, 2)); fs.renameSync(`${file}.tmp`, file);
    return settings;
  }
  loadProfiles() {
    try { return normalizeFleet(JSON.parse(fs.readFileSync(this.profilesPath(), 'utf8'))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`อ่านรายชื่อมอเตอร์ไม่ได้: ${error.message} (ไฟล์เดิมยังอยู่)`);
      try {
        const legacy = JSON.parse(fs.readFileSync(path.join(this.directory, 'sensor-config.json'), 'utf8'));
        return normalizeFleet([{ ...legacy, sensorModel: legacy.sensorModel || 'custom' }]);
      } catch (legacyError) { if (legacyError.code !== 'ENOENT') throw legacyError; return []; }
    }
  }
  saveProfiles(raw) {
    const configs = raw.length ? normalizeFleet(raw) : [];
    fs.mkdirSync(this.directory, { recursive: true });
    const temporary = `${this.profilesPath()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(configs, null, 2), 'utf8');
    fs.renameSync(temporary, this.profilesPath());
    return configs;
  }
  append(reading) {
    const write = this.queue.then(async () => {
      await fs.promises.mkdir(this.dataPath(), { recursive: true });
      const date = dayKey(new Date(reading.timestamp));
      await fs.promises.appendFile(path.join(this.dataPath(), `readings-${date}.ndjson`), `${JSON.stringify(reading)}\n`, 'utf8');
      // A distinct schema suffix avoids appending new columns to older CSV files.
      const csv = path.join(this.dataPath(), `readings-${date}-v3.csv`);
      try { await fs.promises.writeFile(csv, '\uFEFF' + CSV_KEYS.join(',') + '\r\n', { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      await fs.promises.appendFile(csv, csvRow(reading), 'utf8');
    });
    this.queue = write.catch(() => {});
    return write;
  }
  async history({ date, endDate = date, motorId = '' }, visitor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('วันที่ไม่ถูกต้อง');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endDate)) || !Number.isFinite(Date.parse(date)) || !Number.isFinite(Date.parse(endDate)) || endDate < date) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    await this.queue;
    const files = fs.existsSync(this.dataPath()) ? (await fs.promises.readdir(this.dataPath())).filter(name => /^readings-\d{4}-\d{2}-\d{2}\.ndjson$/.test(name) && name.slice(9, 19) >= date && name.slice(9, 19) <= endDate).sort() : [];
    const rows = []; let total = 0, skipped = 0;
    for (const name of files) {
      const file = path.join(this.dataPath(), name);
      const stream = fs.createReadStream(file, { encoding: 'utf8' });
      const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          let record;
          try { record = JSON.parse(line); if (!record || !Number.isFinite(Date.parse(record.timestamp)) || !Number.isFinite(record.value)) throw new Error('Invalid record'); } catch { skipped += 1; continue; }
          if (motorId && record.motorId !== motorId) continue;
          total += 1;
          if (visitor) await visitor(record);
          else { rows.push(record); if (rows.length > 500) rows.shift(); }
        }
      } finally { lines.close(); stream.destroy(); }
    }
    return { rows, total, skipped };
  }
  async chartRange({ from, to, motorId }) {
    const start = Date.parse(from), end = Date.parse(to);
    if (!motorId || typeof motorId !== 'string' || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('เลือกมอเตอร์และช่วงเวลาเริ่ม–สิ้นสุดให้ถูกต้อง');
    const buckets = new Map(), bucketCount = 160, keys = ['value', ...CSV_KEYS.filter(key => /^(velocity|displacement|acceleration|frequency)[XYZ]$/.test(key)), 'temperature'];
    let total = 0;
    const summary = await this.history({ date: dayKey(new Date(start)), endDate: dayKey(new Date(end)), motorId }, record => {
      const stamp = Date.parse(record.timestamp); if (stamp < start || stamp > end) return;
      total++;
      const index = Math.min(bucketCount - 1, Math.floor((stamp - start) / (end - start) * bucketCount));
      if (!buckets.has(index)) buckets.set(index, { first: record, last: record, extrema: new Map() });
      const bucket = buckets.get(index); bucket.last = record;
      for (const key of keys) {
        const value = record[key] ?? record.channels?.[key]; if (!Number.isFinite(value)) continue;
        const extrema = bucket.extrema.get(key);
        if (!extrema) bucket.extrema.set(key, { low: record, high: record, min: value, max: value });
        else { if (value < extrema.min) { extrema.min = value; extrema.low = record; } if (value > extrema.max) { extrema.max = value; extrema.high = record; } }
      }
    });
    const selected = new Map();
    for (const bucket of buckets.values()) for (const record of [bucket.first, bucket.last, ...[...bucket.extrema.values()].flatMap(item => [item.low, item.high])]) selected.set(record.timestamp, record);
    return { rows: [...selected.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)), total, skipped: summary.skipped, reduced: selected.size < total };
  }
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function localTimestamp(value) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false }).format(new Date(value)).replace(' ', 'T').replace(',', '.') + '+07:00'; }
const CSV_KEYS = ['timestamp', 'timestampBangkok', 'motorId', 'port', 'slaveId', 'value', 'unit', 'velocityX', 'velocityY', 'velocityZ', 'temperature', 'displacementX', 'displacementY', 'displacementZ', 'accelerationX', 'accelerationY', 'accelerationZ', 'frequencyX', 'frequencyY', 'frequencyZ', 'frequencyStatus', 'frequencyByteOrder', 'frequencyMessage', 'elapsedMs', 'pollIntervalMs', 'actualIntervalMs', 'source'];
function csvRow(record) { return CSV_KEYS.map(key => csvCell(key === 'timestampBangkok' ? record.timestamp ? localTimestamp(record.timestamp) : '' : record[key] ?? record.channels?.[key])).join(',') + '\r\n'; }

module.exports = { DataStore, dayKey, CSV_KEYS, csvRow };
