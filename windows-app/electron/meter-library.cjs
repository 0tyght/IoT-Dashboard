'use strict';
const {normalizeGroups} = require('./measurement-groups.cjs');
function normalizeMeterLibrary(raw = []) {
  if(!Array.isArray(raw)||raw.length>4096)throw new Error('คลังอุปกรณ์ไฟฟ้าไม่ถูกต้อง');
  const keys=new Set();
  return raw.map(entry=>{
    if(typeof entry.key!=='string'||!/^[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{1,24}$/.test(entry.key)||keys.has(entry.key.toUpperCase()))throw new Error('รหัสอ้างอิงอุปกรณ์ในคลังไม่ถูกต้องหรือซ้ำ');
    keys.add(entry.key.toUpperCase());
    const meter=normalizeGroups([{id:'LIBRARY',name:'คลัง',motorIds:entry.meter?.motorId?[entry.meter.motorId]:[],meters:[entry.meter]}])[0].meters[0];
    return {key:entry.key,sourceGroup:String(entry.sourceGroup||'').slice(0,80),meter};
  });
}
function mergeMeterLibrary(current, groups){
  const result=new Map(normalizeMeterLibrary(current).map(entry=>[entry.key.toUpperCase(),entry]));
  for(const group of groups)for(const meter of group.meters){const key=`${group.id}:${meter.id}`;result.set(key.toUpperCase(),{key,sourceGroup:group.name,meter});}
  return normalizeMeterLibrary([...result.values()]);
}
module.exports={normalizeMeterLibrary,mergeMeterLibrary};
