'use strict';

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const readline = require('node:readline');
const { normalizeFleet } = require('./fleet-service.cjs');
const { normalizeRecording } = require('./recording-service.cjs');
const { normalizeGroups } = require('./measurement-groups.cjs');
const { normalizeConfig } = require('./sensor-codec.cjs');
const { csvCell, localTimestamp } = require('./csv.cjs');
const { writeRunReport } = require('./run-report.cjs');

const bangkokDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
function dayKey(date = new Date()) { return bangkokDayFormatter.format(date); }

const PRESET_MODEL = 'vemsee-sn3001-wz3a-n01';
const PRESET_CHANNELS = ['velocity', 'displacement', 'acceleration'].flatMap(kind => ['X', 'Y', 'Z'].map(axis => `${kind}${axis}`));
const LEGACY_RUN_ID = '__legacy__';
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function recordedRunId(record) { return typeof record.runId === 'string' && record.runId ? record.runId : LEGACY_RUN_ID; }
function runDataPath(dataDirectory, runId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) throw new Error('รหัสรอบการทำงานไม่ถูกต้อง');
  const root = path.resolve(dataDirectory, 'runs'), target = path.resolve(root, runId);
  if (path.dirname(target) !== root) throw new Error('ตำแหน่งโฟลเดอร์รอบการทำงานไม่ถูกต้อง');
  return target;
}
function recordedModel(record) {
  return record.sensorModel || record.decodeConfig?.sensorModel || (PRESET_CHANNELS.every(key => Object.hasOwn(record.channels || {}, key)) ? PRESET_MODEL : 'custom');
}
function matchesCurrentProfile(record, profile) {
  if (Array.isArray(profile.points)) return false;
  if (record.source === 'SIMULATION' || record.recorded === false) return false;
  if (typeof record.port !== 'string' || record.port.toUpperCase() !== String(profile.path).toUpperCase() || record.slaveId !== profile.slaveId || record.unit !== profile.unit) return false;
  const model = recordedModel(record);
  if (model !== profile.sensorModel) return false;
  if (model === PRESET_MODEL && !PRESET_CHANNELS.every(key => Object.hasOwn(record.channels || {}, key))) return false;
  // A legacy custom value does not identify the register or formula that produced it.
  // It remains available in History, but cannot be attached to the current sensor automatically.
  if (model === 'custom' && ['registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale', 'unit'].some(key => record.decodeConfig?.[key] === undefined)) return false;
  for (const key of ['sensorModel', 'registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale', 'unit']) {
    if (record.decodeConfig?.[key] !== undefined && record.decodeConfig[key] !== profile[key]) return false;
  }
  if (record.frequencyByteOrder && profile.frequencyByteOrder && record.frequencyByteOrder !== profile.frequencyByteOrder) return false;
  return true;
}

function historySeries(record) {
  const sensorModel = recordedModel(record);
  const unit = String(record.unit || '—'), port = String(record.port || 'ไม่ระบุพอร์ต'), slaveId = record.slaveId ?? null;
  const custom = sensorModel === 'custom' ? ['registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale'].map(key => record.decodeConfig?.[key] ?? null) : null;
  const simulation = record.source === 'SIMULATION';
  const runId = recordedRunId(record), runStartedAt = record.runStartedAt || '';
  const key = JSON.stringify([sensorModel, unit, port.toUpperCase(), slaveId, custom, simulation, runId]);
  const formula = custom ? record.decodeConfig ? ` · Register ${record.decodeConfig.registerAddress} × ${record.decodeConfig.scale}` : ' · สูตรเดิมไม่ระบุ' : '';
  return { key, sensorModel, unit, port, slaveId, runId, runStartedAt, label: `${simulation ? 'ข้อมูลจำลอง · ' : ''}${sensorModel === 'custom' ? 'Custom' : 'VemSee 3-axis'} · ${unit} · ${port} / ID ${slaveId ?? '—'}${formula}${runId === LEGACY_RUN_ID ? '' : ` · Run ${runId.slice(0, 8)}`}` };
}

function sampleRandom(seedText) {
  let state = 2166136261;
  for (let index = 0; index < seedText.length; index++) state = Math.imul(state ^ seedText.charCodeAt(index), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// Byte-bounded snapshots make both passes see the same append-only journal,
// including when acquisition continues while the user opens an analysis.
async function snapshotJournal(directory, startDate, endDate) {
  let names;
  try { names = await fs.promises.readdir(directory); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const name of names.filter(name => /^readings-\d{4}-\d{2}-\d{2}\.ndjson$/.test(name) && name.slice(9, 19) >= startDate && name.slice(9, 19) <= endDate).sort()) {
    const file = path.join(directory, name), size = (await fs.promises.stat(file)).size;
    if (size) files.push({ file, size });
  }
  return files;
}
async function visitSnapshot(files, visitor) {
  let skipped = 0;
  for (const { file, size } of files) {
    const stream = fs.createReadStream(file, { encoding: 'utf8', start: 0, end: size - 1 });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        let record;
        try { record = JSON.parse(line); if (!record || !Number.isFinite(Date.parse(record.timestamp)) || !Number.isFinite(record.value)) throw new Error('Invalid record'); }
        catch { skipped++; continue; }
        if (record.source !== 'SIMULATION') visitor(record);
      }
    } finally { lines.close(); stream.destroy(); }
  }
  return skipped;
}

class DataStore {
  constructor(directory) {
    this.directory = directory;
    this.queue = Promise.resolve();
    this.reportQueue = Promise.resolve();
    this.checkedJournals = new Set();
  }
  dataPath() { return path.join(this.directory, 'data'); }
  outputPath() { return path.join(this.dataPath(), 'output'); }
  async recordedDays() {
    await this.queue;
    let names;
    try { names = await fs.promises.readdir(this.dataPath()); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return names.filter(name => /^readings-\d{4}-\d{2}-\d{2}\.ndjson$/.test(name)).map(name => name.slice(9, 19)).sort().reverse();
  }
  async pointDays() {
    await this.queue;let names;try{names=await fs.promises.readdir(this.dataPath());}catch(error){if(error.code==='ENOENT')return [];throw error;}
    const files=names.filter(name=>/^points-\d{4}-\d{2}-\d{2}\.ndjson$/.test(name)),days=new Set(files.map(name=>name.slice(7,17)));
    // Older versions could put a point just before midnight in the following day's file.
    // Inspect the beginning of each journal so those days remain selectable without rewriting data.
    for(const name of files){const handle=await fs.promises.open(path.join(this.dataPath(),name),'r');try{const buffer=Buffer.alloc(262144),{bytesRead}=await handle.read(buffer,0,buffer.length,0);for(const line of buffer.subarray(0,bytesRead).toString('utf8').split('\n')){try{const row=JSON.parse(line);if(Number.isFinite(Date.parse(row.timestamp)))days.add(dayKey(new Date(row.timestamp)));}catch{}}}finally{await handle.close();}}
    return [...days].sort().reverse();
  }
  async pointHistory({date,deviceId='',seriesKey='',runId='',offset=0}) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date))||!Number.isFinite(Date.parse(date)))throw new Error('วันที่ไม่ถูกต้อง');
    offset=Number(offset);if(!Number.isSafeInteger(offset)||offset<0)throw new Error('หน้าข้อมูลไม่ถูกต้อง');
    await this.queue;const next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10),files=[];
    for(const day of [date,next]){const file=path.join(this.dataPath(),`points-${day}.ndjson`);try{const size=(await fs.promises.stat(file)).size;if(size)files.push({file,size});}catch(error){if(error.code!=='ENOENT')throw error;}}
    const rows=[],devices=new Set(),series=new Map(),runs=new Map();let total=0,skipped=0;
    const matches=row=>{if(!row||!row.deviceId||!row.pointId||!Number.isFinite(Date.parse(row.timestamp)))return false;return dayKey(new Date(row.timestamp))===date;};
    async function visit(fn){for(const {file,size} of files){const stream=fs.createReadStream(file,{encoding:'utf8',start:0,end:size-1}),lines=readline.createInterface({input:stream,crlfDelay:Infinity});try{for await(const line of lines){if(!line.trim())continue;let row;try{row=JSON.parse(line);if(!row||!row.deviceId||!row.pointId||!Number.isFinite(Date.parse(row.timestamp)))throw new Error('invalid');}catch{fn(null);continue;}if(matches(row))fn(row);}}finally{lines.close();stream.destroy();}}}
    function keyFor(row){return JSON.stringify([row.deviceId,row.pointId,row.unit,row.port,row.slaveId,row.registerType,row.registerAddress,row.dataType,row.byteOrder,row.scale,row.offset,row.runId||'']);}
    await visit(row=>{if(!row){skipped++;return;}devices.add(row.deviceId);if(deviceId&&row.deviceId!==deviceId)return;if(row.runId&&!runs.has(row.runId))runs.set(row.runId,{runId:row.runId,runName:row.runName||'',groupName:row.groupName||'',timestamp:row.timestamp});if(runId&&row.runId!==runId)return;const key=keyFor(row);if(!series.has(key))series.set(key,{key,name:row.name,pointId:row.pointId,unit:row.unit,deviceId:row.deviceId,runId:row.runId||''});if(seriesKey&&key!==seriesKey)return;total++;if(!offset){rows.push(row);if(rows.length>500)rows.shift();}});
    if(offset){let index=0;const from=Math.max(0,total-offset-500),to=Math.max(0,total-offset);await visit(row=>{if(!row||(deviceId&&row.deviceId!==deviceId)||(runId&&row.runId!==runId)||(seriesKey&&keyFor(row)!==seriesKey))return;if(index>=from&&index<to)rows.push(row);index++;});}
    return {rows,total,skipped,offset,limit:500,devices:[...devices].sort(),series:[...series.values()],runs:[...runs.values()].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))};
  }
  async powerDays() {
    await this.queue; let names;
    try { names=await fs.promises.readdir(this.dataPath()); } catch(error) { if(error.code==='ENOENT')return []; throw error; }
    return names.filter(name=>/^power-\d{4}-\d{2}-\d{2}\.ndjson$/.test(name)).map(name=>name.slice(6,16)).sort().reverse();
  }
  async powerHistory({date,runId=''}) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isFinite(Date.parse(date)))throw new Error('วันที่ไม่ถูกต้อง');
    await this.queue;const file=path.join(this.dataPath(),`power-${date}.ndjson`),rows=[],runs=new Map();let total=0,skipped=0;
    let stream;try{const size=(await fs.promises.stat(file)).size;if(!size)return{rows,total,skipped,runs:[]};stream=fs.createReadStream(file,{encoding:'utf8',start:0,end:size-1});}catch(error){if(error.code==='ENOENT')return{rows,total,skipped,runs:[]};throw error;}
    const lines=readline.createInterface({input:stream,crlfDelay:Infinity});
    try{for await(const line of lines){if(!line.trim())continue;let row;try{row=JSON.parse(line);if(!row||!Number.isFinite(Date.parse(row.timestamp))||!row.meterId)throw new Error('invalid');}catch{skipped++;continue;}const id=row.runId||'';if(!runs.has(id))runs.set(id,{runId:id,groupName:row.groupName||'',runName:row.runName||'',firstTimestamp:row.timestamp});if(runId&&id!==runId)continue;total++;rows.push(row);if(rows.length>200)rows.shift();}}
    finally{lines.close();stream.destroy();}
    return {rows,total,skipped,runs:[...runs.values()].reverse()};
  }
  runDataPath(runId) { return runDataPath(this.dataPath(), runId); }
  profilesPath() { return path.join(this.directory, 'motors.json'); }
  loadTemplates() {
    try { return require('./device-templates.cjs').normalizeTemplates(JSON.parse(fs.readFileSync(path.join(this.directory,'device-templates.json'),'utf8'))); }
    catch(error) { if(error.code==='ENOENT')return []; throw new Error(`อ่านแม่แบบ Register ไม่ได้: ${error.message}`); }
  }
  saveTemplates(raw) {
    const templates=require('./device-templates.cjs').normalizeTemplates(raw),file=path.join(this.directory,'device-templates.json');
    fs.mkdirSync(this.directory,{recursive:true});fs.writeFileSync(`${file}.tmp`,JSON.stringify(templates,null,2),'utf8');fs.renameSync(`${file}.tmp`,file);return templates;
  }
  normalizeBuses(raw) {
    if (!Array.isArray(raw) || raw.length > 64) throw new Error('บัสต้องมีไม่เกิน 64 พอร์ต');
    const seen=new Set();return raw.map(item=>{const c=normalizeConfig({...item,motorId:'BUS',sensorModel:'custom'});if(c.path.toUpperCase().startsWith('UNBOUND:'))throw new Error('ชื่อพอร์ตไม่ถูกต้อง');const key=c.path.toUpperCase();if(seen.has(key))throw new Error('COM Port ซ้ำ');seen.add(key);return {path:c.path,baudRate:c.baudRate,parity:c.parity,stopBits:c.stopBits,deviceGapMs:c.deviceGapMs};});
  }
  loadBuses() { try{return this.normalizeBuses(JSON.parse(fs.readFileSync(path.join(this.directory,'modbus-buses.json'),'utf8')));}catch(error){if(error.code==='ENOENT')return [];throw new Error(`อ่านบัส Modbus ไม่ได้: ${error.message}`);} }
  saveBuses(raw) { const buses=this.normalizeBuses(raw),file=path.join(this.directory,'modbus-buses.json');fs.mkdirSync(this.directory,{recursive:true});fs.writeFileSync(`${file}.tmp`,JSON.stringify(buses,null,2),'utf8');fs.renameSync(`${file}.tmp`,file);return buses; }
  loadSelectedGroup() {
    try { const value=JSON.parse(fs.readFileSync(path.join(this.directory,'selected-group.json'),'utf8')); if(typeof value.id!=='string'||(value.id&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(value.id))) throw new Error('รหัสชุดไม่ถูกต้อง');return value.id; }
    catch(error){if(error.code==='ENOENT')return '';throw new Error(`อ่านชุดที่เลือกล่าสุดไม่ได้: ${error.message}`);}
  }
  saveSelectedGroup(id) {
    if(typeof id!=='string'||(id&&!this.loadGroups().some(group=>group.id===id)))throw new Error('ไม่พบชุดการวัดที่เลือก');
    const file=path.join(this.directory,'selected-group.json');fs.mkdirSync(this.directory,{recursive:true});fs.writeFileSync(`${file}.tmp`,JSON.stringify({id},null,2),'utf8');fs.renameSync(`${file}.tmp`,file);return id;
  }
  loadGroups() {
    try { return normalizeGroups(JSON.parse(fs.readFileSync(path.join(this.directory, 'measurement-groups.json'), 'utf8'))); }
    catch(error) { if(error.code==='ENOENT') return []; throw new Error(`อ่านชุดการวัดไม่ได้: ${error.message}`); }
  }
  saveGroups(raw) {
    const groups=normalizeGroups(raw), file=path.join(this.directory,'measurement-groups.json');
    fs.mkdirSync(this.directory,{recursive:true}); fs.writeFileSync(`${file}.tmp`,JSON.stringify(groups,null,2),'utf8'); fs.renameSync(`${file}.tmp`,file); return groups;
  }
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
    try { const raw=JSON.parse(fs.readFileSync(this.profilesPath(), 'utf8'));return Array.isArray(raw)&&raw.length===0?[]:normalizeFleet(raw,{allowSharedConnections:true}); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`อ่านรายชื่อมอเตอร์ไม่ได้: ${error.message} (ไฟล์เดิมยังอยู่)`);
      try {
        const legacy = JSON.parse(fs.readFileSync(path.join(this.directory, 'sensor-config.json'), 'utf8'));
        return normalizeFleet([{ ...legacy, sensorModel: legacy.sensorModel || 'custom' }]);
      } catch (legacyError) { if (legacyError.code !== 'ENOENT') throw legacyError; return []; }
    }
  }
  saveProfiles(raw) {
    const configs = raw.length ? normalizeFleet(raw,{allowSharedConnections:true}) : [];
    fs.mkdirSync(this.directory, { recursive: true });
    const temporary = `${this.profilesPath()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(configs, null, 2), 'utf8');
    fs.renameSync(temporary, this.profilesPath());
    return configs;
  }
  async writeRunMetadata(directory,reading) {
    await fs.promises.mkdir(directory,{recursive:true});const info={runId:reading.runId,runStartedAt:reading.runStartedAt||'',runName:reading.runName||'',runNote:reading.runNote||'',groupId:reading.groupId||'',groupName:reading.groupName||''};
    try{await fs.promises.writeFile(path.join(directory,'run-metadata.json'),JSON.stringify(info,null,2),{encoding:'utf8',flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw new Error(`บันทึกข้อมูลรอบไม่สำเร็จ: ${error.message}`);}
  }
  generateRunReport(runId) {
    const metadataFile = path.join(this.runDataPath(runId), 'run-metadata.json');
    // Take a snapshot after all pending writes. Report generation can stream it while new readings are saved.
    const snapshot = this.queue.then(async () => {
      let info = {};
      try { info = JSON.parse(await fs.promises.readFile(metadataFile, 'utf8')) || {}; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      let names;
      try { names = await fs.promises.readdir(this.dataPath()); }
      catch (error) { if (error.code === 'ENOENT') return { info, journals: [] }; throw error; }
      const start = Date.parse(info.runStartedAt);
      const firstDay = Number.isFinite(start) ? dayKey(new Date(start - 86400000)) : '';
      const journals = [];
      for (const name of names.sort()) {
        const match = /^(readings|points|power)-(\d{4}-\d{2}-\d{2})\.ndjson$/.exec(name);
        if (!match || match[2] < firstDay) continue;
        const file = path.join(this.dataPath(), name);
        journals.push({ kind: match[1], file, size: (await fs.promises.stat(file)).size });
      }
      return { info, journals };
    });
    this.queue = snapshot.catch(() => {});
    const report = Promise.all([this.reportQueue, snapshot]).then(([, sources]) => writeRunReport(this.outputPath(), runId, sources));
    this.reportQueue = report.catch(() => {});
    return report;
  }
  async appendJournal(name, body) {
    const file = path.join(this.dataPath(), name);
    try {
      if (this.checkedJournals.has(file)) {
        await fs.promises.appendFile(file, body, 'utf8');
        return;
      }
      const handle = await fs.promises.open(file, 'a+');
      try {
        const { size } = await handle.stat();
        const last = Buffer.alloc(1);
        if (size) await handle.read(last, 0, 1, size - 1);
        // Separate the next valid record from a line left incomplete after a crash.
        await handle.appendFile((size && last[0] !== 10 ? '\n' : '') + body, 'utf8');
      } finally { await handle.close(); }
      this.checkedJournals.add(file);
    } catch (error) {
      this.checkedJournals.delete(file);
      throw error;
    }
  }
  async appendPointJournal(reading) {
    const points = reading.points?.filter(point => point.enabled && point.record) || [];
    if (!points.length) return;
    const sampleId = randomUUID();
    const byDay = new Map();
    for (const point of points) {
      const timestamp = point.timestamp || reading.timestamp;
      const row = {
        timestamp, timestampBangkok: localTimestamp(timestamp), sampleId, sampleTimestamp: reading.timestamp, attemptId: reading.attemptId,
        groupId: reading.groupId || '', groupName: reading.groupName || '',
        runId: reading.runId || '', runName: reading.runName || '', runNote: reading.runNote || '', recordingId: reading.recordingId || '',
        deviceId: reading.motorId, deviceName: reading.name || '', port: reading.port, slaveId: reading.slaveId,
        pointId: point.id, name: point.name, unit: point.unit, status: point.status, value: point.value, raw: point.raw,
        registerType: point.registerType, registerAddress: point.registerAddress, dataType: point.dataType, byteOrder: point.byteOrder,
        scale: point.scale, offset: point.offset, pollIntervalMs: reading.pollIntervalMs, message: point.message || ''
      };
      const day = dayKey(new Date(timestamp));
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(JSON.stringify(row));
    }
    for (const [day, rows] of byDay) {
      await this.appendJournal(`points-${day}.ndjson`, rows.join('\n') + '\n');
    }
  }
  append(reading) {
    const write = this.queue.then(async () => {
      // Validate before writing even the daily file; IDs never become arbitrary paths.
      const runDirectory = reading.runId == null || reading.runId === '' ? null : this.runDataPath(reading.runId);
      const date = dayKey(new Date(reading.timestamp));
      await fs.promises.mkdir(this.dataPath(), { recursive: true });
      if (runDirectory) await this.writeRunMetadata(runDirectory, reading);
      if (Array.isArray(reading.points)) {
        await this.appendPointJournal(reading);
        return;
      }
      await this.appendJournal(`readings-${date}.ndjson`, `${JSON.stringify(reading)}\n`);
    });
    this.queue = write.catch(() => {});
    return write;
  }
  appendPower(reading) {
    const write=this.queue.then(async()=>{
      const directory=this.runDataPath(reading.runId), date=dayKey(new Date(reading.timestamp));
      await this.writeRunMetadata(directory, reading);
      await this.appendJournal(`power-${date}.ndjson`, `${JSON.stringify(reading)}\n`);
      await this.appendPointJournal({ ...reading, motorId: `PM:${reading.meterId}`, port: reading.path });
    });
    this.queue=write.catch(()=>{}); return write;
  }
  async history({ date, endDate = date, motorId = '', runId = '' }, visitor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('วันที่ไม่ถูกต้อง');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endDate)) || !Number.isFinite(Date.parse(date)) || !Number.isFinite(Date.parse(endDate)) || endDate < date) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    await this.queue;
    const files = fs.existsSync(this.dataPath()) ? (await fs.promises.readdir(this.dataPath())).filter(name => /^readings-\d{4}-\d{2}-\d{2}\.ndjson$/.test(name) && name.slice(9, 19) >= date && name.slice(9, 19) <= endDate).sort() : [];
    const rows = [], motorIds = new Set(), runCatalog = new Map(); let total = 0, skipped = 0;
    for (const name of files) {
      const file = path.join(this.dataPath(), name);
      const stream = fs.createReadStream(file, { encoding: 'utf8' });
      const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          let record;
          try { record = JSON.parse(line); if (!record || !Number.isFinite(Date.parse(record.timestamp)) || !Number.isFinite(record.value)) throw new Error('Invalid record'); } catch { skipped += 1; continue; }
          if (record.source === 'SIMULATION') continue;
          if (typeof record.motorId === 'string' && record.motorId) motorIds.add(record.motorId);
          if (motorId && record.motorId !== motorId) continue;
          const id = recordedRunId(record);
          if (!runCatalog.has(id)) runCatalog.set(id, { runId: id, runStartedAt: id === LEGACY_RUN_ID ? '' : record.runStartedAt || '', groupId:record.groupId || '', groupName:record.groupName || '', runName:record.runName||'',runNote:record.runNote||'', firstTimestamp: record.timestamp, lastTimestamp: record.timestamp, total: 0, recordingIds: new Set(), motorIds: new Set() });
          const run = runCatalog.get(id);
          run.total++;
          if (Date.parse(record.timestamp) < Date.parse(run.firstTimestamp)) run.firstTimestamp = record.timestamp;
          if (Date.parse(record.timestamp) > Date.parse(run.lastTimestamp)) run.lastTimestamp = record.timestamp;
          if (!run.runStartedAt && id !== LEGACY_RUN_ID && record.runStartedAt) run.runStartedAt = record.runStartedAt;
          if (record.recordingId) run.recordingIds.add(record.recordingId);
          if (typeof record.motorId === 'string' && record.motorId) run.motorIds.add(record.motorId);
          if (runId && id !== runId) continue;
          total += 1;
          if (visitor) await visitor(record);
          else { rows.push(record); if (rows.length > 500) rows.shift(); }
        }
      } finally { lines.close(); stream.destroy(); }
    }
    const runs = [...runCatalog.values()].sort((a, b) => Date.parse(b.lastTimestamp) - Date.parse(a.lastTimestamp)).map(run => ({ ...run, recordingIds: [...run.recordingIds].sort(), motorIds: [...run.motorIds].sort() }));
    return { rows, total, skipped, motorIds: [...motorIds].sort(), runs };
  }
  async exportHistory(filter, file) {
    const temporary = path.join(path.dirname(file), `.vectra-export-${randomUUID()}.tmp`);
    const handle = await fs.promises.open(temporary, 'wx');
    let summary;
    try {
      try {
        let chunk = '\uFEFF' + CSV_KEYS.join(',') + '\r\n';
        summary = await this.history(filter, async reading => {
          chunk += csvRow(reading);
          if (chunk.length >= 65536) {
            await handle.writeFile(chunk, 'utf8');
            chunk = '';
          }
        });
        if (chunk) await handle.writeFile(chunk, 'utf8');
      } finally { await handle.close(); }
      await fs.promises.rename(temporary, file);
      return summary.total;
    } finally { await fs.promises.rm(temporary, { force: true }); }
  }
  async chartRange({ from, to, motorId, profile, seriesKey, runId = '' }) {
    const start = Date.parse(from), end = Date.parse(to);
    if (!motorId || typeof motorId !== 'string' || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('เลือกมอเตอร์และช่วงเวลาเริ่ม–สิ้นสุดให้ถูกต้อง');
    if (profile && (typeof profile !== 'object' || profile.motorId !== motorId)) throw new Error('การตั้งค่ามอเตอร์ไม่ตรงกับข้อมูลที่เลือก');
    const groups = new Map(), bucketCount = 160, keys = ['value', ...CSV_KEYS.filter(key => /^(velocity|displacement|acceleration|frequency)[XYZ]$/.test(key)), 'temperature'];
    let rangeTotal = 0;
    const summary = await this.history({ date: dayKey(new Date(start)), endDate: dayKey(new Date(end)), motorId, runId }, record => {
      const stamp = Date.parse(record.timestamp); if (stamp < start || stamp > end) return;
      if (profile && !matchesCurrentProfile(record, profile)) return;
      const descriptor = historySeries(record);
      if (!groups.has(descriptor.key)) groups.set(descriptor.key, { ...descriptor, total: 0, lastTimestamp: record.timestamp, buckets: new Map(), gapPairs: [], continuityFrames: new Map(), previous: null });
      const group = groups.get(descriptor.key), previous = group.previous;
      const interval = record.pollIntervalMs || previous?.pollIntervalMs || profile?.pollInterval;
      if (previous && interval > 0 && stamp - Date.parse(previous.timestamp) > interval * 3) group.gapPairs.push([previous, record]);
      if (previous && keys.some(key => Number.isFinite(previous[key] ?? previous.channels?.[key]) !== Number.isFinite(record[key] ?? record.channels?.[key]))) {
        group.continuityFrames.set(previous.timestamp, previous); group.continuityFrames.set(record.timestamp, record);
      }
      if (!previous || stamp >= Date.parse(previous.timestamp)) { group.previous = record; group.lastTimestamp = record.timestamp; }
      group.total++; rangeTotal++;
      const index = Math.min(bucketCount - 1, Math.floor((stamp - start) / (end - start) * bucketCount));
      if (!group.buckets.has(index)) group.buckets.set(index, { first: record, last: record, extrema: new Map() });
      const bucket = group.buckets.get(index); bucket.last = record;
      for (const key of keys) {
        const value = record[key] ?? record.channels?.[key]; if (!Number.isFinite(value)) continue;
        const extrema = bucket.extrema.get(key);
        if (!extrema) bucket.extrema.set(key, { low: record, high: record, min: value, max: value });
        else { if (value < extrema.min) { extrema.min = value; extrema.low = record; } if (value > extrema.max) { extrema.max = value; extrema.high = record; } }
      }
    });
    const ordered = [...groups.values()].sort((a, b) => Date.parse(b.lastTimestamp) - Date.parse(a.lastTimestamp));
    const group = seriesKey ? groups.get(seriesKey) : ordered[0];
    const series = ordered.map(({ key, sensorModel, unit, port, slaveId, runId, runStartedAt, label, total, lastTimestamp }) => ({ key, sensorModel, unit, port, slaveId, runId, runStartedAt, label, total, lastTimestamp }));
    if (!group) return { rows: [], total: 0, rangeTotal, skipped: summary.skipped, reduced: false, gapStarts: [], series, seriesKey: '' };
    const selected = new Map();
    for (const bucket of group.buckets.values()) for (const record of [bucket.first, bucket.last, ...[...bucket.extrema.values()].flatMap(item => [item.low, item.high])]) selected.set(record.timestamp, record);
    for (const pair of group.gapPairs) for (const record of pair) selected.set(record.timestamp, record);
    for (const [stamp, record] of group.continuityFrames) selected.set(stamp, record);
    return { rows: [...selected.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)), total: group.total, rangeTotal, skipped: summary.skipped, reduced: selected.size < group.total, gapStarts: group.gapPairs.map(pair => pair[1].timestamp), series, seriesKey: group.key };
  }
  async trendRange({ from, to, motorId, seriesKey, runId = '' }) {
    const start=Date.parse(from),end=Date.parse(to),limit=65536;
    if(typeof motorId!=='string'||!motorId||!Number.isFinite(start)||!Number.isFinite(end)||start>=end)throw new Error('เลือกมอเตอร์และช่วงเวลาเริ่ม–สิ้นสุดให้ถูกต้อง');
    await this.queue;
    const files=await snapshotJournal(this.dataPath(),dayKey(new Date(start)),dayKey(new Date(end))),groups=new Map();let rangeTotal=0;
    const matches=record=>record.motorId===motorId&&Date.parse(record.timestamp)>=start&&Date.parse(record.timestamp)<=end&&(!runId||recordedRunId(record)===runId);
    const skipped=await visitSnapshot(files,record=>{if(!matches(record))return;const descriptor=historySeries(record);if(!groups.has(descriptor.key))groups.set(descriptor.key,{...descriptor,simulation:record.source==='SIMULATION',total:0,lastTimestamp:record.timestamp});const group=groups.get(descriptor.key);group.total++;rangeTotal++;if(Date.parse(record.timestamp)>Date.parse(group.lastTimestamp))group.lastTimestamp=record.timestamp;});
    const series=[...groups.values()].sort((a,b)=>Date.parse(b.lastTimestamp)-Date.parse(a.lastTimestamp)),group=seriesKey?groups.get(seriesKey):series[0];
    const result={rows:[],series,seriesKey:group?.key||'',total:group?.total||0,rangeTotal,skipped,reduced:false,limit,limitExceeded:Boolean(group&&group.total>limit)};
    if(!group||result.limitExceeded)return result;
    await visitSnapshot(files,record=>{if(matches(record)&&historySeries(record).key===group.key)result.rows.push({timestamp:record.timestamp,value:record.value,channels:Object.fromEntries([...PRESET_CHANNELS,'temperature','frequencyX','frequencyY','frequencyZ'].map(key=>[key,record.channels?.[key]??record[key]])),frequencyStatus:record.frequencyStatus,pollIntervalMs:record.pollIntervalMs,actualIntervalMs:record.actualIntervalMs});});
    // Preserve journal receive order: sorting could conceal a clock rollback.
    // TrendAnalysis separates non-increasing timestamps instead of joining them.
    return result;
  }
  async scatterRange({ from, to, motorId, profile, seriesKey, runId = '', metric = 'velocity', limit = 6000 }) {
    const start = Date.parse(from), end = Date.parse(to);
    if (!motorId || typeof motorId !== 'string' || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('เลือกมอเตอร์และช่วงเวลาเริ่ม–สิ้นสุดให้ถูกต้อง');
    if (profile && (typeof profile !== 'object' || profile.motorId !== motorId)) throw new Error('การตั้งค่ามอเตอร์ไม่ตรงกับข้อมูลที่เลือก');
    if (!['velocity', 'displacement', 'acceleration'].includes(metric)) throw new Error('เลือก Velocity, Displacement หรือ Acceleration สำหรับกราฟกระจาย');
    if (!Number.isInteger(limit) || limit < 100 || limit > 12000) throw new Error('จำนวนจุดกราฟกระจายต้องเป็นจำนวนเต็ม 100–12000');
    await this.queue;
    const files = await snapshotJournal(this.dataPath(), dayKey(new Date(start)), dayKey(new Date(end)));
    const groups = new Map(), keys = ['X', 'Y', 'Z'].map(axis => `${metric}${axis}`);
    const complete = record => keys.every(key => Number.isFinite(record[key] ?? record.channels?.[key]));
    const matching = record => {
      const stamp = Date.parse(record.timestamp);
      return stamp >= start && stamp <= end && record.motorId === motorId && (!runId || recordedRunId(record) === runId) && (!profile || matchesCurrentProfile(record, profile));
    };
    let rangeTotal = 0;
    const skipped = await visitSnapshot(files, record => {
      if (!matching(record)) return;
      const descriptor = historySeries(record);
      if (!groups.has(descriptor.key)) groups.set(descriptor.key, { ...descriptor, total: 0, completeTotal: 0, incompleteTotal: 0, lastTimestamp: record.timestamp });
      const group = groups.get(descriptor.key);
      group.total++; rangeTotal++;
      if (complete(record)) group.completeTotal++; else group.incompleteTotal++;
      if (Date.parse(record.timestamp) > Date.parse(group.lastTimestamp)) group.lastTimestamp = record.timestamp;
    });
    const series = [...groups.values()].sort((a, b) => Date.parse(b.lastTimestamp) - Date.parse(a.lastTimestamp));
    const group = seriesKey ? groups.get(seriesKey) : series[0];
    const base = { rows: [], total: 0, completeTotal: 0, incompleteTotal: 0, rangeTotal, skipped, reduced: false, gapStarts: [], series, seriesKey: '', metric, limit, sampling: 'all' };
    if (!group) return base;
    const rows = [], random = sampleRandom(`${motorId}|${metric}|${group.key}`);
    let seen = 0;
    await visitSnapshot(files, record => {
      if (!matching(record) || historySeries(record).key !== group.key || !complete(record)) return;
      seen++;
      if (rows.length < limit) rows.push(record);
      else {
        // Algorithm R: every complete record has the same inclusion probability,
        // unlike a time/extrema reducer that exaggerates rare extreme readings.
        const index = Math.floor(random() * seen);
        if (index < limit) rows[index] = record;
      }
    });
    rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const reduced = rows.length < group.completeTotal;
    return { ...base, rows, total: group.total, completeTotal: group.completeTotal, incompleteTotal: group.incompleteTotal, reduced, sampling: reduced ? 'uniform-record-sample' : 'all', seriesKey: group.key };
  }
}

const CSV_KEYS = ['timestamp', 'timestampBangkok', 'schemaVersion', 'runId', 'runStartedAt', 'recordingId', 'recordingStartedAt', 'motorId', 'port', 'slaveId', 'value', 'unit', 'velocityX', 'velocityY', 'velocityZ', 'temperature', 'displacementX', 'displacementY', 'displacementZ', 'accelerationX', 'accelerationY', 'accelerationZ', 'frequencyX', 'frequencyY', 'frequencyZ', 'frequencyStatus', 'frequencyByteOrder', 'frequencyMessage', 'elapsedMs', 'pollIntervalMs', 'actualIntervalMs', 'source'];
function csvRow(record) { return CSV_KEYS.map(key => csvCell(key === 'timestampBangkok' ? record.timestamp ? localTimestamp(record.timestamp) : '' : record[key] ?? record.channels?.[key])).join(',') + '\r\n'; }

module.exports = { DataStore, dayKey, CSV_KEYS, csvRow, LEGACY_RUN_ID, runDataPath };
