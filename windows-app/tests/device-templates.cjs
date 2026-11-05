'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DataStore}=require('../electron/data-store.cjs');
const {normalizeTemplates}=require('../electron/device-templates.cjs');
const {FleetService}=require('../electron/fleet-service.cjs');
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vectra-templates-'));
  try{
    const store=new DataStore(root),device={motorId:'AIR-1',name:'Room A',path:'COM8',slaveId:8,baudRate:19200,pollInterval:500,model:'custom',registerAddress:42,dataType:'int16',scale:.1,unit:'°C'};
    const saved=store.saveTemplates([{id:'T1',name:'Temperature',settings:device},{id:'T2',name:'PM2230',settings:{...device,model:'pm2230',byteOrder:'CDAB',offsetAdjust:-1,points:[{id:'EXTRA',name:'Extra',registerAddress:4000,scale:1,unit:'A'}]}}]);
    for(const item of saved)for(const key of ['slaveId','path','motorId','id','name','pollInterval','timeout','baudRate','point'])assert(!Object.hasOwn(item.settings,key),`template excludes ${key}`);
    assert.equal(store.loadTemplates()[0].settings.registerAddress,42);assert.equal(saved[1].settings.byteOrder,'CDAB');assert.equal(saved[1].settings.points[0].registerAddress,4000);
    assert.throws(()=>normalizeTemplates([{id:'pm2230',name:'Overwrite built-in',settings:device}]),/ซ้ำ/);
    assert.throws(()=>store.saveTemplates([{id:'T1',name:'Bad',settings:{model:'custom',registerAddress:65536}}]),/Register address/);
    assert.equal(store.loadTemplates().length,2,'invalid save preserves the previous library');
    const states=[],attempts=[],clients=[];
    const fleet=new FleetService({onDeviceStatus:state=>states.push(state),onAttempt:attempt=>attempts.push(attempt),clientFactory:()=>{
      let id=0;const client={isOpen:false,async connectRTUBuffered(){this.isOpen=true;},setID(value){id=value;},setTimeout(){},close(callback){this.isOpen=false;callback?.();},async readHoldingRegisters(_address,count){if(id===2)throw Object.assign(new Error('Timeout'),{code:'ETIMEDOUT'});return {data:Array(count).fill(10)};}};clients.push(client);return client;
    }});
    await fleet.connect([{motorId:'A1',sensorModel:'custom',path:'COM8',slaveId:1,pollInterval:60000},{motorId:'A2',sensorModel:'custom',path:'COM8',slaveId:2,pollInterval:60000}]);
    await fleet.disconnect();
    assert.equal(clients.length,1,'one client owns the shared COM');
    assert.deepEqual(states.filter(state=>state.deviceId==='A1').map(state=>state.state),['waiting','online']);
    assert.deepEqual(states.filter(state=>state.deviceId==='A2').map(state=>state.state),['waiting','fault']);
    assert(states[0].sentAt);assert(states[1].receivedAt);assert.equal(states[3].receivedAt,null);assert.equal(attempts[1].outcome,'timeout');
    console.log('PASS: one register-template library excludes instance identity; shared-bus request/reply/error statuses are per device');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
