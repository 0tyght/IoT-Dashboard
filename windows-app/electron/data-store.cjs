'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { normalizeFleet } = require('./fleet-service.cjs');

function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

class DataStore {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve(); }
  dataPath() { return path.join(this.directory, 'data'); }
  profilesPath() { return path.join(this.directory, 'motors.json'); }
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
      await fs.promises.appendFile(path.join(this.dataPath(), `readings-${dayKey(new Date(reading.timestamp))}.ndjson`), `${JSON.stringify(reading)}\n`, 'utf8');
    });
    this.queue = write.catch(() => {});
    return write;
  }
  async history({ date, motorId = '' }, visitor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('วันที่ไม่ถูกต้อง');
    await this.queue;
    const file = path.join(this.dataPath(), `readings-${date}.ndjson`);
    if (!fs.existsSync(file)) return { rows: [], total: 0, skipped: 0 };
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const rows = []; let total = 0, skipped = 0;
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        let record;
        try { record = JSON.parse(line); } catch { skipped += 1; continue; }
        if (motorId && record.motorId !== motorId) continue;
        total += 1;
        if (visitor) await visitor(record);
        else { rows.push(record); if (rows.length > 500) rows.shift(); }
      }
    } finally { lines.close(); stream.destroy(); }
    return { rows, total, skipped };
  }
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
const CSV_KEYS = ['timestamp', 'motorId', 'port', 'slaveId', 'value', 'unit', 'velocityX', 'velocityY', 'velocityZ', 'temperature', 'displacementX', 'displacementY', 'displacementZ', 'accelerationX', 'accelerationY', 'accelerationZ', 'elapsedMs'];
function csvRow(record) { return CSV_KEYS.map(key => csvCell(record[key] ?? record.channels?.[key])).join(',') + '\r\n'; }

module.exports = { DataStore, dayKey, CSV_KEYS, csvRow };
