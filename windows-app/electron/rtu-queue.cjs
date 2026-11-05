'use strict';

const isTimeout=error=>error?.code==='ETIMEDOUT'||error?.errno==='ETIMEDOUT';
const cancel=predicate=>{if(predicate?.())throw Object.assign(new Error('หยุดการอ่านแล้ว'),{code:'CANCELLED'});};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hex=bytes=>Buffer.from(bytes).toString('hex').toUpperCase();

// One queue owns identity, timeout, dispatch and receive recovery for one open COM.
// The standard frame gap and the configurable device turnaround guard serve different purposes.
function createRtuQueue(client,options={},runtime={}){
  const now=runtime.now||(()=>performance.now()),sleep=runtime.sleep||pause;
  const baudRate=options.baudRate||9600;
  const frameGapMs=baudRate>19200?2:Math.ceil(3.5*12*1000/baudRate);
  const deviceGapMs=options.deviceGapMs??400;
  let tail=Promise.resolve(),lastFinished=0,lastId=null,lastRx=now(),recover=false;
  let active=null,idleRxBytes=0,idleRxChunks=[],idleCaptured=0,idleRxTruncated=false;
  // modbus-serial 8.0.25 exposes its buffered RTU adapter here. Isolate the version-specific
  // observation/reset in this module; never remove the library's listeners or change its parser.
  const adapter=client._port,serial=adapter?._client;
  const receive=data=>{
    if(!data.length)return;
    lastRx=now();
    if(!active){
      idleRxBytes+=data.length;const room=Math.max(0,1024-idleCaptured);
      if(room){const bytes=data.subarray(0,room);idleRxChunks.push({timestamp:new Date().toISOString(),hex:hex(bytes)});idleCaptured+=bytes.length;}
      if(data.length>room)idleRxTruncated=true;
      return;
    }
    active.rxBytes+=data.length;
    const remaining=Math.max(0,1024-active.capturedBytes);
    if(remaining){const bytes=data.subarray(0,remaining);active.rxChunks.push({timestamp:new Date().toISOString(),hex:hex(bytes)});active.capturedBytes+=bytes.length;}
    if(data.length>remaining)active.rxTruncated=true;
  };
  if(serial?.on)serial.on('data',receive);
  client.isDebugEnabled=true; // Public modbus-serial API: retain the actual TX and matched RX frames.

  async function flushReceive(){
    let discarded=Buffer.isBuffer(adapter?._buffer)?adapter._buffer.length:0;
    if(serial?.flush){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('ล้างบัฟเฟอร์พอร์ตไม่สำเร็จภายใน 500 ms')),500);
        try{serial.flush(error=>{clearTimeout(timer);error?reject(error):resolve();});}catch(error){clearTimeout(timer);reject(error);}
      });
    }
    if(Buffer.isBuffer(adapter?._buffer)){discarded=Math.max(discarded,adapter._buffer.length);adapter._buffer=Buffer.alloc(0);}
    return discarded;
  }

  function read(config,type,address,count,cancelled,onRequest){
    const queuedAt=now();
    const task=tail.then(async()=>{
      const readyAt=now(),recovering=recover;
      const switching=lastId!==null&&lastId!==config.slaveId;
      const guard=recovering?Math.max(400,deviceGapMs):switching?Math.max(frameGapMs,deviceGapMs):frameGapMs;
      const deadline=readyAt+Math.max(2000,config.timeout*2,guard+1000);
      const settle=async()=>{
        let wait;
        while((wait=Math.max(lastFinished+guard,lastRx+(recovering?guard:frameGapMs))-now())>0){
          cancel(cancelled);
          if(now()>deadline)throw Object.assign(new Error('บัสยังมีข้อมูลเข้าต่อเนื่อง ไม่สามารถเริ่มคำขอใหม่ได้'),{code:'BUS_NOT_IDLE'});
          await sleep(Math.min(25,Math.ceil(wait)));
        }
      };
      await settle();
      cancel(cancelled);
      let discardedBytes=0;
      if(recovering){
        discardedBytes=await flushReceive();await settle();cancel(cancelled);
        // A flush callback can coincide with a late RX event. Clear that final parsed fragment
        // only after the line has been quiet again, before dispatching the new transaction.
        if(Buffer.isBuffer(adapter?._buffer)){discardedBytes+=adapter._buffer.length;adapter._buffer=Buffer.alloc(0);}
        recover=false;
      }
      // Bind these inside the serialized dispatch. Another queued caller cannot retarget this read.
      client.setID(config.slaveId);client.setTimeout(config.timeout);
      const sentAt=new Date().toISOString(),sentClock=now();
      const capture={rxChunks:[],rxBytes:0,capturedBytes:0,rxTruncated:false};active=capture;
      const timing={sentAt,waitMs:Math.round(sentClock-queuedAt),deviceGapMs,switchedDevice:switching,
        recovery:recovering,discardedBytes,idleRxBytes,idleRxChunks,idleRxTruncated,rawCaptureAvailable:Boolean(serial?.on)};
      idleRxBytes=0;idleRxChunks=[];idleCaptured=0;idleRxTruncated=false;
      onRequest?.(timing);
      try{
        const response=await(type==='input'?client.readInputRegisters(address,count):client.readHoldingRegisters(address,count));
        const transfer={...timing,responseMs:Math.round(now()-sentClock),...capture};delete transfer.capturedBytes;
        if(response.request)transfer.txHex=hex(response.request);
        if(response.responses)transfer.responseHex=response.responses.map(hex);
        return {response,transfer};
      }catch(error){
        // A timeout has no RTU transaction identifier. Drain the late frame before any next request,
        // including a retry of the same slave, so a stale reply cannot become a fresh measurement.
        if(isTimeout(error)||/CRC|length|address/i.test(error.message||''))recover=true;
        const transfer={...timing,responseMs:Math.round(now()-sentClock),...capture};delete transfer.capturedBytes;
        if(error.modbusRequest)transfer.txHex=hex(error.modbusRequest);
        if(error.modbusResponses)transfer.responseHex=error.modbusResponses.map(hex);
        error.rtuTransfer=transfer;
        throw error;
      }finally{active=null;lastFinished=now();lastId=config.slaveId;}
    });
    tail=task.catch(()=>{});
    return task;
  }
  return {read,dispose(){if(serial?.off)serial.off('data',receive);}};
}
module.exports={createRtuQueue};
