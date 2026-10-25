'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DataStore,dayKey}=require('../electron/data-store.cjs');
(async()=>{
 const base=path.resolve(__dirname,'../.test-tmp');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'trend-store-'));
 try{
  const store=new DataStore(root),start=Date.parse('2026-10-25T01:00:00Z'),run='12345678-1234-4234-8234-123456789012';fs.mkdirSync(store.dataPath());
  const rows=Array.from({length:1000},(_,i)=>({timestamp:new Date(start+i*2000).toISOString(),motorId:'M1',sensorModel:'vemsee-sn3001-wz3a-n01',port:'COM3',slaveId:1,value:i,unit:'mm/s',runId:run,channels:{velocityX:i,velocityY:0,velocityZ:-i},rawRegisters:Array(40).fill(65535)}));
  rows.push({...rows[0],motorId:'M2',value:99999});rows.push({...rows[0],runId:'other-run',value:54321});
  fs.writeFileSync(path.join(store.dataPath(),`readings-${dayKey(new Date(start))}.ndjson`),rows.map(JSON.stringify).join('\n')+'\n{bad');
  const filter={from:new Date(start).toISOString(),to:new Date(start+2100000).toISOString(),motorId:'M1',runId:run};
  const result=await store.trendRange(filter);assert.equal(result.rows.length,1000);assert.equal(result.total,1000);assert.equal(result.reduced,false);assert.equal(result.skipped,1);assert.equal(result.rows[400].channels.velocityX,400);assert(!('rawRegisters'in result.rows[0]));assert.equal(result.rows[1].channels.velocityY,0);
  const empty=await store.trendRange({...filter,motorId:'absent'});assert.equal(empty.total,0);assert.deepEqual(empty.rows,[]);
  const clockRows=[rows[0],rows[2],rows[1]];fs.writeFileSync(path.join(store.dataPath(),`readings-${dayKey(new Date(start))}.ndjson`),clockRows.map(JSON.stringify).join('\n'));
  const clock=await store.trendRange(filter);assert.deepEqual(clock.rows.map(row=>row.timestamp),clockRows.map(row=>row.timestamp),'journal order exposes clock rollback rather than silently sorting it away');
  const wide=Array.from({length:65537},(_,i)=>JSON.stringify({...rows[0],timestamp:new Date(start+i*1000).toISOString()})).join('\n');fs.writeFileSync(path.join(store.dataPath(),`readings-${dayKey(new Date(start))}.ndjson`),wide);
  const limit=await store.trendRange({...filter,to:new Date(start+65537000).toISOString()});assert(limit.limitExceeded);assert.equal(limit.total,65537);assert.equal(limit.rows.length,0);assert.equal(limit.series.length,1,'series catalog remains available when a range is too large');
  await assert.rejects(store.trendRange({...filter,to:filter.from}),/ช่วงเวลา/);
  console.log('PASS: trend history returns all original records, strict run/series identity, bounded payload, corrupt rows, zero and explicit overflow without reduction');
 }finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(base));assert(path.basename(root).startsWith('trend-store-'));fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
