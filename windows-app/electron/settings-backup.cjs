'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {normalizeFleet} = require('./fleet-service.cjs');
const {normalizeGroups, resolveGroup} = require('./measurement-groups.cjs');
const {normalizeTemplates} = require('./device-templates.cjs');
const {normalizeRecording} = require('./recording-service.cjs');
const {applyBus, applyGroupBuses} = require('./bus-config.cjs');
const files = ['motors.json','measurement-groups.json','modbus-buses.json','device-templates.json','recording.json','selected-group.json','device-meter-profiles.json'];
const markerName='settings-restore.pending.json';
function recoverPendingSettings(directory){
  const marker=path.join(directory,markerName);let pending;
  try{pending=JSON.parse(fs.readFileSync(marker,'utf8'));}catch(error){if(error.code==='ENOENT')return false;throw new Error(`อ่านสถานะกู้คืนการตั้งค่าไม่สำเร็จ: ${error.message}`);}
  if(pending.version!==1||!pending.files||files.some(name=>!(name in pending.files)||pending.files[name]!==null&&typeof pending.files[name]!=='string'))throw new Error('สถานะกู้คืนการตั้งค่าไม่ถูกต้อง');
  for(const name of files){const file=path.join(directory,name),data=pending.files[name];if(data===null)fs.rmSync(file,{force:true});else{fs.writeFileSync(`${file}.recovery.tmp`,Buffer.from(data,'base64'));fs.renameSync(`${file}.recovery.tmp`,file);}}
  fs.rmSync(marker);return true;
}
function snapshot(store) {
  return {format:'vectra-settings', version:1, createdAt:new Date().toISOString(), profiles:store.loadProfiles(), groups:store.loadGroups(), meterProfiles:store.loadMeterLibrary(), buses:store.loadBuses(), templates:store.loadTemplates(), recording:store.loadRecording(), selectedGroup:store.loadSelectedGroup()};
}
function validate(store, raw) {
  if (!raw || raw.format !== 'vectra-settings' || raw.version !== 1) throw new Error('ไฟล์นี้ไม่ใช่การสำรองการตั้งค่าทั้งหมดของ VECTRA');
  if(['profiles','groups','buses','templates'].some(key=>!Array.isArray(raw[key]))||!raw.recording||typeof raw.recording!=='object'||Array.isArray(raw.recording))throw new Error('โครงสร้างไฟล์สำรองการตั้งค่าไม่ครบหรือไม่ถูกต้อง');
  const profiles = raw.profiles?.length === 0 ? [] : normalizeFleet(raw.profiles, {allowSharedConnections:true});
  const groups = normalizeGroups(raw.groups), buses = store.normalizeBuses(raw.buses), templates = normalizeTemplates(raw.templates), recording = normalizeRecording(raw.recording);
  if (typeof raw.selectedGroup !== 'string' || raw.selectedGroup && !groups.some(group=>group.id===raw.selectedGroup)) throw new Error('พื้นที่งานที่เลือกในไฟล์สำรองไม่ถูกต้อง');
  for (const group of groups) resolveGroup(applyGroupBuses(group,buses),profiles.map(profile=>applyBus(profile,buses)),{allowDisabled:true});
  const meterProfiles=require('./meter-library.cjs').normalizeMeterLibrary(raw.meterProfiles||[]);
  return {...raw, profiles, groups, buses, templates, recording, meterProfiles};
}
function restore(store, raw) {
  const next = validate(store, raw), previous = new Map();
  fs.mkdirSync(store.directory,{recursive:true});
  for (const name of files) { try { previous.set(name, fs.readFileSync(path.join(store.directory,name))); } catch(error) { if(error.code!=='ENOENT')throw error; previous.set(name,null); } }
  const recovery = path.join(store.directory, `settings-before-restore-${Date.now()}.json`);
  let previousSettings;
  try{previousSettings=snapshot(store);}catch{previousSettings={format:'vectra-recovery-raw',version:1,files:Object.fromEntries([...previous].map(([name,content])=>[name,content?.toString('utf8')??null]))};}
  fs.writeFileSync(recovery,JSON.stringify(previousSettings,null,2),{encoding:'utf8',flag:'wx'});
  const marker=path.join(store.directory,markerName);
  const journal=fs.openSync(`${marker}.tmp`,'w');
  try{fs.writeFileSync(journal,JSON.stringify({version:1,files:Object.fromEntries([...previous].map(([name,content])=>[name,content?.toString('base64')??null]))}),'utf8');fs.fsyncSync(journal);}finally{fs.closeSync(journal);}
  fs.renameSync(`${marker}.tmp`,marker);
  try {
    // The source may be restoring corrupt settings. Keep the original bytes in the
    // recovery journal; do not require those files to parse while applying a backup.
    fs.writeFileSync(path.join(store.directory,'measurement-groups.json'),'[]');
    fs.writeFileSync(path.join(store.directory,'device-meter-profiles.json'),'[]');
    store.saveProfiles(next.profiles); store.saveBuses(next.buses); store.saveGroups(next.groups);
    store.saveMeterLibrary(require('./meter-library.cjs').mergeMeterLibrary(next.meterProfiles,next.groups));
    store.saveTemplates(next.templates); store.saveRecording(next.recording); store.saveSelectedGroup(next.selectedGroup);
    fs.rmSync(marker);
  } catch(error) {
    const failures=[];
    for(const [name,content] of previous) try { const file=path.join(store.directory,name); if(content===null)fs.rmSync(file,{force:true});else fs.writeFileSync(file,content); } catch(rollbackError){failures.push(rollbackError.message);}
    if(!failures.length)fs.rmSync(marker,{force:true});
    throw new Error(`กู้คืนไม่สำเร็จ: ${error.message}${failures.length ? ` · คืนไฟล์เดิมไม่ครบ: ${failures.join('; ')} · สำเนาก่อนกู้คืน: ${recovery}` : ' · คืนการตั้งค่าเดิมแล้ว'}`);
  }
  return {recovery, settings:next};
}
module.exports = {snapshot, validate, restore, recoverPendingSettings};
