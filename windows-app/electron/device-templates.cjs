'use strict';
const {normalizeConfig}=require('./sensor-codec.cjs');
const {normalizeGroups}=require('./measurement-groups.cjs');
const {snapshot,builtins,isPower}=require('../src/device-templates.js');
function normalizeTemplates(raw){
  if(!Array.isArray(raw)||raw.length>128)throw new Error('เก็บแม่แบบได้ไม่เกิน 128 รายการ');
  const ids=new Set(builtins.map(item=>item.id.toUpperCase())),names=new Set();
  return raw.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('ข้อมูลแม่แบบไม่ถูกต้อง');
    const id=String(item.id||'').trim(),name=String(item.name||'').trim();
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)||ids.has(id.toUpperCase()))throw new Error('รหัสแม่แบบไม่ถูกต้องหรือซ้ำ');
    if(!name||name.length>80||names.has(name.toLowerCase()))throw new Error('ชื่อแม่แบบต้องไม่ซ้ำ และมี 1–80 ตัวอักษร');
    ids.add(id.toUpperCase());names.add(name.toLowerCase());
    const settings=snapshot(item.settings||{}),connection={path:'UNBOUND:TEMPLATE',motorId:'TEMPLATE',slaveId:1};
    const normalized=isPower(settings.model)
      ? normalizeGroups([{id:'TEMPLATE',name:'Template',motorIds:[],meters:[{...settings,...connection,id:'TEMPLATE',model:settings.model,motorId:''}]}])[0].meters[0]
      : normalizeConfig({...settings,...connection,sensorModel:settings.model,unit:settings.unit||'value'});
    return {id,name,settings:snapshot(normalized)};
  });
}
module.exports={normalizeTemplates};
