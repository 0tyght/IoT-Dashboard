'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createRtuQueue}=require('../electron/rtu-queue.cjs');
const {normalizeConfig}=require('../electron/sensor-codec.cjs');
const {DataStore}=require('../electron/data-store.cjs');
const config=id=>({...normalizeConfig({path:'COM8',motorId:`D${id}`,slaveId:id,sensorModel:'custom'}),timeout:100});
function clock(){let value=1000;return {now:()=>value,sleep:async ms=>{value+=ms;}};}
function fake(runtime,{turnaround=0,failFirst=false,noise=false}={}){
  const raw=new EventEmitter(),requests=[];let id,lastId,lastEnd=0,calls=0,flushes=0;
  raw.flush=done=>{flushes++;done();};
  const adapter={_client:raw,_buffer:Buffer.alloc(0)};
  const client={_port:adapter,setID(value){id=value;},setTimeout(){},async readHoldingRegisters(_address,count){
    const selected=id;requests.push({id:selected,at:runtime.now()});calls++;
    const short=lastId!==undefined&&selected!==lastId&&runtime.now()-lastEnd<turnaround;
    await runtime.sleep(10);
    if(short||(failFirst&&calls===1)){
      lastId=selected;lastEnd=runtime.now();adapter._buffer=Buffer.from([9,3,2,0]);raw.emit('data',adapter._buffer);
      throw Object.assign(new Error('Test timeout'),{code:'ETIMEDOUT',modbusRequest:Buffer.from([selected,3,0,0,0,count])});
    }
    raw.emit('data',noise?Buffer.alloc(1500,selected):Buffer.from([selected,3,2,0,selected]));lastId=selected;lastEnd=runtime.now();
    return {data:Array(count).fill(selected),request:Buffer.from([selected,3,0,0,0,count]),responses:[Buffer.from([selected,3,2,0,selected])]};
  }};
  return {client,raw,requests,adapter,get flushes(){return flushes;}};
}
(async()=>{
  assert.equal(normalizeConfig({path:'COM8'}).deviceGapMs,400);
  assert.throws(()=>normalizeConfig({path:'COM8',deviceGapMs:-1}),/พักระหว่างอุปกรณ์/);
  assert.throws(()=>normalizeConfig({path:'COM8',deviceGapMs:5001}),/พักระหว่างอุปกรณ์/);
  assert.equal(new DataStore('.').normalizeBuses([{path:'COM8',deviceGapMs:750}])[0].deviceGapMs,750);
  // Model an RTU slave requiring turnaround after another unit's reply. The previous minimum-only
  // pacing fails this model; the new setting is a guard to validate in the user's physical setup.
  const fastClock=clock(),fast=fake(fastClock,{turnaround:350}),fastQueue=createRtuQueue(fast.client,{baudRate:9600,deviceGapMs:0},fastClock);
  await fastQueue.read(config(1),'holding',0,1,()=>false);
  await assert.rejects(fastQueue.read(config(2),'holding',0,1,()=>false),/timeout/);fastQueue.dispose();
  const safeClock=clock(),safe=fake(safeClock,{turnaround:350}),safeQueue=createRtuQueue(safe.client,{baudRate:9600},safeClock);
  const first=safeQueue.read(config(1),'holding',0,1,()=>false),second=safeQueue.read(config(2),'holding',0,1,()=>false);
  safe.client.setID(99);const results=await Promise.all([first,second]);
  assert.deepEqual(safe.requests.map(item=>item.id),[1,2],'unit identity is bound at dispatch inside one queue');
  assert.equal(results[1].response.data[0],2);assert(results[1].transfer.waitMs>=400);assert(results[1].transfer.switchedDevice);assert.equal(safe.flushes,0);
  assert.equal(results[1].transfer.txHex,'020300000001');assert.equal(results[1].transfer.rxChunks[0].hex,'0203020002');assert.equal(results[1].transfer.responseMs,10);
  safeQueue.dispose();assert.equal(safe.raw.listenerCount('data'),0);
  // A delayed/foreign reply after a timeout must be discarded before a same-slave retry too.
  const recoveryClock=clock(),recovery=fake(recoveryClock,{failFirst:true}),recoveryQueue=createRtuQueue(recovery.client,{deviceGapMs:20},recoveryClock);
  await assert.rejects(recoveryQueue.read(config(1),'holding',0,1,()=>false),error=>error.rtuTransfer.rxBytes===4);
  recovery.adapter._buffer=Buffer.concat([recovery.adapter._buffer,Buffer.from([9,3,0])]);recovery.raw.emit('data',Buffer.from([9,3,0]));
  const retry=await recoveryQueue.read(config(1),'holding',0,1,()=>false);
  assert(retry.transfer.recovery);assert(retry.transfer.waitMs>=400);assert.equal(retry.transfer.discardedBytes,7);assert.equal(retry.transfer.idleRxChunks[0].hex,'090300');assert.equal(recovery.adapter._buffer.length,0);assert.equal(recovery.flushes,1);recoveryQueue.dispose();
  const boundedClock=clock(),bounded=fake(boundedClock,{noise:true}),boundedQueue=createRtuQueue(bounded.client,{},boundedClock);
  const capture=await boundedQueue.read(config(1),'holding',0,1,()=>false);assert.equal(capture.transfer.rxBytes,1500);assert(capture.transfer.rxTruncated);assert.equal(capture.transfer.rxChunks[0].hex.length,2048);boundedQueue.dispose();
  const longClock=clock(),long=fake(longClock),longQueue=createRtuQueue(long.client,{deviceGapMs:5000},longClock);await longQueue.read(config(1),'holding',0,1,()=>false);const delayed=await longQueue.read(config(2),'holding',0,1,()=>false);assert(delayed.transfer.waitMs>=5000);longQueue.dispose();
  const cancelClock=clock(),cancelled=fake(cancelClock),cancelQueue=createRtuQueue(cancelled.client,{},cancelClock);await cancelQueue.read(config(1),'holding',0,1,()=>false);
  await assert.rejects(cancelQueue.read(config(2),'holding',0,1,()=>true),error=>error.code==='CANCELLED');assert.equal(cancelled.requests.length,1);cancelQueue.dispose();
  // Exercise the installed modbus-serial RTU parser too. Only its in-memory SerialPort methods
  // are substituted; no COM handle is opened. A valid frame for the wrong unit must not be accepted.
  const ModbusRTU=require('modbus-serial'),crc16=require('modbus-serial/utils/crc16');
  const port=new ModbusRTU.RTUBufferedPort('IN-MEMORY-ONLY',{baudRate:9600});
  Object.defineProperty(port,'isOpen',{get:()=>true});port.open=done=>done();port.close=done=>done();
  const realClient=new ModbusRTU(port);await new Promise((resolve,reject)=>realClient.open(error=>error?reject(error):resolve()));
  let wrongUnit=true,flushed=0;
  port._client.flush=done=>{flushed++;done();};
  port._client.write=request=>{
    const reply=Buffer.from([wrongUnit?2:request[0],request[1],2,0,42,0,0]);reply.writeUInt16LE(crc16(reply.subarray(0,5)),5);
    setTimeout(()=>port._client.emit('data',reply),2);
  };
  const parserQueue=createRtuQueue(realClient,{deviceGapMs:0}),parserConfig={...config(1),timeout:40};
  await assert.rejects(parserQueue.read(parserConfig,'holding',0,1,()=>false),error=>(error.code==='ETIMEDOUT'||error.errno==='ETIMEDOUT')&&error.rtuTransfer.txHex.startsWith('0103')&&error.rtuTransfer.rxChunks[0].hex.startsWith('0203'));
  wrongUnit=false;const parsed=await parserQueue.read({...parserConfig,timeout:200},'holding',0,1,()=>false);
  assert.equal(parsed.response.data[0],42);assert(parsed.transfer.recovery);assert(parsed.transfer.discardedBytes>=7);assert.equal(flushed,1);assert(parsed.transfer.responseHex[0].startsWith('0103'));parserQueue.dispose();await new Promise(resolve=>realClient.close(resolve));
  console.log('PASS: per-COM identity binding, configurable slave turnaround, late RX recovery, bounded raw TX/RX evidence and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
