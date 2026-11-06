'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DataStore}=require('../electron/data-store.cjs');const backup=require('../electron/settings-backup.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'vectra-settings-backup-'));
try{
  const a=new DataStore(path.join(root,'source')),b=new DataStore(path.join(root,'target'));
  a.saveProfiles([{motorId:'D1',path:'COM987',slaveId:1,sensorModel:'custom'}]);a.saveBuses([{path:'COM987',baudRate:9600,parity:'none',stopBits:1}]);a.saveGroups([{id:'G1',name:'Bench',motorIds:['D1'],meters:[{id:'PM1',model:'pm2230',path:'COM987',slaveId:3}],modelEnabled:true}]);a.saveSelectedGroup('G1');
  const raw=backup.snapshot(a);assert.equal(raw.meterProfiles.length,1);const restored=backup.restore(b,raw);assert(fs.existsSync(restored.recovery));assert.deepEqual(b.loadProfiles(),a.loadProfiles());assert.deepEqual(b.loadGroups(),a.loadGroups());assert.deepEqual(b.loadBuses(),a.loadBuses());assert.equal(b.loadSelectedGroup(),'G1');
  b.saveGroups([{...b.loadGroups()[0],meters:[]}]);assert.equal(b.loadMeterLibrary().length,1,'removing a meter from a workspace retains its instance configuration in the library');assert.equal(b.loadMeterLibrary()[0].meter.id,'PM1');
  const before=backup.snapshot(b),save=b.saveTemplates;b.saveTemplates=()=>{throw new Error('test disk write failure');};assert.throws(()=>backup.restore(b,raw),/คืนการตั้งค่าเดิมแล้ว/);b.saveTemplates=save;assert.deepEqual(b.loadGroups(),before.groups);assert.deepEqual(b.loadMeterLibrary(),before.meterProfiles);assert.equal(b.loadSelectedGroup(),before.selectedGroup);
  assert.throws(()=>backup.validate(b,{...raw,format:'unrelated'}),/ไฟล์นี้/);assert.throws(()=>backup.validate(b,{...raw,groups:[{...raw.groups[0],motorIds:['MISSING']}]}),/ถูกลบ/);
  assert.throws(()=>backup.validate(b,{...raw,profiles:''}),/โครงสร้าง/);assert.throws(()=>backup.validate(b,{...raw,buses:undefined}),/โครงสร้าง/);
  const names=['motors.json','measurement-groups.json','modbus-buses.json','device-templates.json','recording.json','selected-group.json','device-meter-profiles.json'];
  const files=Object.fromEntries(names.map(name=>{try{return[name,fs.readFileSync(path.join(b.directory,name)).toString('base64')];}catch{return[name,null];}}));
  fs.writeFileSync(path.join(b.directory,'settings-restore.pending.json'),JSON.stringify({version:1,files}));fs.writeFileSync(path.join(b.directory,'motors.json'),'corrupt mid-restore');
  const recovered=new DataStore(b.directory);assert.deepEqual(recovered.loadProfiles(),before.profiles);assert(!fs.existsSync(path.join(b.directory,'settings-restore.pending.json')));
  fs.writeFileSync(path.join(b.directory,'measurement-groups.json'),'corrupt old settings');backup.restore(b,raw);assert.deepEqual(b.loadGroups(),raw.groups,'a validated backup can restore corrupt existing settings');
  console.log('PASS: full configuration round trip, meter retention, model preference, validation and rollback after a partial write failure');
}finally{fs.rmSync(root,{recursive:true,force:true});}
