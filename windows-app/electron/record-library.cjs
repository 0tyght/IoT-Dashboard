'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { toRecord } = require('./run-report.cjs');
const LEGACY = '__legacy__';
const idOf = row => typeof row.runId === 'string' && row.runId ? row.runId : LEGACY;
const metricId = field => JSON.stringify([field.key, field.unit || '']);
const day = value => new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 10);

async function journals(store, filter = {}) {
  await store.queue;
  let names;
  try { names = await fs.promises.readdir(store.dataPath()); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  for (const key of ['from', 'to']) if (filter[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(filter[key]) || !Number.isFinite(Date.parse(filter[key])) || new Date(filter[key]).toISOString().slice(0,10)!==filter[key])) throw new Error('วันที่ไม่ถูกต้อง');
  if (filter.from && filter.to && filter.from > filter.to) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  const result = [];
  for (const name of names.sort()) {
    const match = /^(readings|power|points)-(\d{4}-\d{2}-\d{2})\.ndjson$/.exec(name);
    if (!match) continue;
    // Include the next journal for old point timestamps written just after midnight.
    const previous = new Date(Date.parse(match[2]) - 86400000).toISOString().slice(0, 10);
    if (filter.from && match[2] < filter.from || filter.to && previous > filter.to) continue;
    const file = path.join(store.dataPath(), name), stat = await fs.promises.stat(file);
    result.push({file, size: stat.size, mtime: stat.mtimeMs, kind: match[1]});
  }
  return result;
}

async function visit(files, filter, callback) {
  let skipped = 0;
  for (const item of files) {
    if (!item.size) continue;
    const stream = fs.createReadStream(item.file, {encoding:'utf8', end:item.size - 1});
    const lines = readline.createInterface({input:stream, crlfDelay:Infinity});
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        let row;
        try { row = JSON.parse(line); } catch { skipped++; continue; }
        if (!row || row.source === 'SIMULATION' || row.recorded === false) continue;
        let record;try{record = toRecord(item.kind, row);}catch{skipped++;continue;}
        if (!record) { skipped++; continue; }
        record.timestamp=new Date(record.timestamp).toISOString();
        const date = day(record.timestamp);
        if (filter.from && date < filter.from || filter.to && date > filter.to) continue;
        await callback(record, row, item.kind);
      }
    } finally { lines.close(); stream.destroy(); }
  }
  return skipped;
}

async function listRuns(store, filter = {}) {
  const files = await journals(store, filter), key = JSON.stringify([filter.from, filter.to, files]);
  if (store.recordCatalog?.key === key) return store.recordCatalog.result;
  const runs = new Map();
  const skipped = await visit(files, filter, (record, row) => {
    const id = idOf(row);
    if (!runs.has(id)) runs.set(id, {id, name:row.runName || '', note:row.runNote || '', groupId:row.groupId || '', groupName:row.groupName || '', start:record.timestamp, end:record.timestamp, records:0, devices:new Map()});
    const run = runs.get(id); run.records++;
    if (record.timestamp < run.start) run.start = record.timestamp;
    if (record.timestamp > run.end) run.end = record.timestamp;
    if (!run.devices.has(record.deviceKey)) run.devices.set(record.deviceKey, {key:record.deviceKey, id:record.id, name:row.deviceName || row.motorName || row.meterName || record.id, power:record.power, metrics:new Map(), records:0, xyz:false});
    const device = run.devices.get(record.deviceKey); device.records++;
    device.xyz ||= ['velocityX','velocityY','velocityZ'].every(field => Object.hasOwn(row.channels || {}, field));
    for (const field of record.fields) device.metrics.set(metricId(field), {id:metricId(field), key:field.key, label:field.label, unit:field.unit || ''});
  });
  const result = {runs:[...runs.values()].map(run => ({...run, devices:[...run.devices.values()].map(device=>({...device, metrics:[...device.metrics.values()]}))})).sort((a,b)=>Date.parse(b.end)-Date.parse(a.end)), skipped};
  store.recordCatalog = {key, result};
  return result;
}

async function deviceRows(store, filter = {}) {
  if (typeof filter.runId !== 'string' || !filter.runId || filter.runId.length > 100 || typeof filter.deviceKey !== 'string' || !/^(?:PM:)?[a-z0-9][a-z0-9_-]{0,23}$/i.test(filter.deviceKey)) throw new Error('เลือกรอบและอุปกรณ์ก่อน');
  const limit = Math.min(2000, Math.max(100, Math.trunc(Number(filter.limit)) || 500)), samples = new Map(), heap=[];
  const addSample=(key,sample)=>{
    samples.set(key,sample);const entry={key,time:Date.parse(sample.timestamp)};heap.push(entry);let index=heap.length-1;
    while(index){const parent=(index-1)>>1;if(heap[parent].time<=entry.time)break;heap[index]=heap[parent];index=parent;}heap[index]=entry;
    if(heap.length>limit){const oldest=heap[0],tail=heap.pop();samples.delete(oldest.key);if(heap.length){let index=0;while(index*2+1<heap.length){let child=index*2+1;if(child+1<heap.length&&heap[child+1].time<heap[child].time)child++;if(heap[child].time>=tail.time)break;heap[index]=heap[child];index=child;}heap[index]=tail;}}
  };
  let records = 0;
  const skipped = await visit(await journals(store, filter), filter, (record, row) => {
    if (idOf(row) !== filter.runId || record.deviceKey !== filter.deviceKey) return;
    records++;
    const key = JSON.stringify([row.recordingId || '', record.timestamp, record.sampleKey || '']);
    if (!samples.has(key)) addSample(key, {timestamp:record.timestamp, recordingId:row.recordingId || '', values:{}, states:{}});
    const sample = samples.get(key);
    if(!sample)return;
    for (const field of record.fields) {
      sample.values[metricId(field)] = Number.isFinite(field.value) ? field.value : null;
      sample.states[metricId(field)] = Number.isFinite(field.value) ? 'ok' : row.message || row.status || 'ไม่มีค่าที่ใช้ได้';
    }
  });
  return {rows:[...samples.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)), records, skipped, limit};
}
async function runQuality(store,runId){
  let directory;try{directory=store.runDataPath(runId);}catch{return {available:false,csvFiles:0};}
  let quality=null;
  try{const file=path.join(directory,'diagnostics','quality.json');if((await fs.promises.stat(file)).size<=1024*1024)quality=JSON.parse(await fs.promises.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')return {available:false,csvFiles:0,message:`อ่านรายงานคุณภาพไม่สำเร็จ: ${error.message}`};}
  let csvFiles=0;
  try{for(const name of await fs.promises.readdir(store.outputPath()))if(name.endsWith(`_${runId}`))csvFiles+=(await fs.promises.readdir(path.join(store.outputPath(),name))).filter(file=>file.endsWith('.csv')).length;}catch(error){if(error.code!=='ENOENT')return {available:Boolean(quality),quality,csvFiles,message:`อ่านรายการ CSV ไม่สำเร็จ: ${error.message}`};}
  return {available:Boolean(quality),quality,csvFiles};
}
async function sampleDetails(store,filter){
  if(!filter||!Number.isFinite(Date.parse(filter.timestamp)))throw new Error('เลือกเวลาของรายการบันทึก');
  const date=day(filter.timestamp),rows=[];
  await visit(await journals(store,{from:date,to:date}),{from:date,to:date},(record,row,kind)=>{
    if(idOf(row)!==filter.runId||record.deviceKey!==filter.deviceKey||Date.parse(record.timestamp)!==Date.parse(filter.timestamp)||(row.recordingId||'')!==(filter.recordingId||'')||rows.length>=256)return;
    const keys=['port','slaveId','sensorModel','unit','value','channels','rawRegisters','raw','decodeConfig','frequencyByteOrder','frequencyStatus','model','byteOrder','offsetAdjust','points','pointId','name','registerAddress','registerType','dataType','scale','offset','status','message'];
    rows.push({kind,...Object.fromEntries(keys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]))});
  });
  return {rows};
}
async function runEvents(store,filter={}){
  const directory=store.runDataPath(filter.runId),file=path.join(directory,'diagnostics','events.ndjson');
  let size;try{size=(await fs.promises.stat(file)).size;}catch(error){if(error.code==='ENOENT')return {events:[],available:false,matched:0};throw error;}
  if(!size)return {events:[],available:true,matched:0};
  const events=[],stream=fs.createReadStream(file,{encoding:'utf8',end:size-1}),lines=readline.createInterface({input:stream,crlfDelay:Infinity});let matched=0,skipped=0;
  try{for await(const line of lines){if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch{skipped++;continue;}
    if(!event||event.runId!==filter.runId||filter.deviceId&&event.deviceId!==filter.deviceId||filter.errorsOnly&&['ok','saved','cancelled','skipped'].includes(event.outcome))continue;
    const keys=['type','deviceId','deviceType','endedAt','timestamp','startedAt','outcome','message','queueDelayMs','responseMs','phase'];
    const summary=Object.fromEntries(keys.filter(key=>Object.hasOwn(event,key)).map(key=>[key,event[key]]));
    summary.frames=Array.isArray(event.frames)?event.frames.slice(0,64).map(frame=>Object.fromEntries(['address','count','functionCode','outcome','message','durationMs'].filter(key=>Object.hasOwn(frame,key)).map(key=>[key,frame[key]]))):[];
    matched++;events.push(summary);if(events.length>200)events.shift();
  }}finally{lines.close();stream.destroy();}
  return {events,available:true,matched,skipped};
}
module.exports = {listRuns, deviceRows, runQuality, sampleDetails, runEvents, LEGACY};
