/* Shared validation and storage schema. No factory data is sent to a server. */
(function(root){
 'use strict';
 const plateFields={manufacturer:'ยี่ห้อ / ผู้ผลิต',model:'รุ่น / Type',motorType:'ชนิดมอเตอร์',marking:'เครื่องหมายรับรอง',standard:'มาตรฐานบนป้าย',duty:'Duty',insulation:'Insulation class',ip:'IP rating',efficiencyClass:'Efficiency class',bearingDE:'Bearing DE',bearingNDE:'Bearing NDE',productNumber:'Product No.',serial:'Serial No.',frame:'Frame',ambient:'Ambient temperature (°C)',weight:'Weight (kg)'};
 const ratingFields={voltage:'Volts',connection:'Connection',hz:'Hz',kw:'kW',rpm:'RPM',amps:'Amps',pf:'cos φ',efficiency:'Eff. %'};
 function text(v,max,label){if(typeof v!=='string'||v.length>max)throw Error(`${label}: ข้อมูลไม่ถูกต้องหรือยาวเกิน ${max} ตัวอักษร`);return v.trim();}
 function number(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${label}: ต้องอยู่ระหว่าง ${min}–${max}`);return v;}
 function validate(input){
  if(!input||typeof input!=='object')throw Error('รายการมอเตอร์ไม่ถูกต้อง');
  const id=text(input.id,24,'รหัสมอเตอร์');if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id))throw Error('รหัสมอเตอร์ใช้ A–Z, 0–9, - และ _ เท่านั้น');
  const label=text(input.label,40,'ฉลากบนแปลน');if(!label)throw Error('กรุณาระบุฉลากบนแปลน');
  const cls=number(input.cls,0,3,'Class');if(!Number.isInteger(cls))throw Error('Class ไม่ถูกต้อง');
  const plate={};for(const key of Object.keys(plateFields))plate[key]=text(input.plate?.[key]??'',100,plateFields[key]);
  for(const key of ['weight','ambient'])if(plate[key]!==''&&(!Number.isFinite(Number(plate[key]))||(key==='weight'&&Number(plate[key])<0)))throw Error(`${plateFields[key]}: กรุณากรอกตัวเลขที่ถูกต้อง`);
  if(!Array.isArray(input.ratings)||input.ratings.length>12)throw Error('ข้อมูลพิกัดไฟฟ้ารองรับไม่เกิน 12 แถว');
  const ratings=input.ratings.map(row=>{if(!row||typeof row!=='object')throw Error('แถวพิกัดไฟฟ้าไม่ถูกต้อง');const out={};for(const key of Object.keys(ratingFields)){out[key]=text(row[key]??'',40,ratingFields[key]);if(!['voltage','connection'].includes(key)&&out[key]!==''){const v=Number(out[key]);if(!Number.isFinite(v)||v<0||(['hz','kw','rpm','amps'].includes(key)&&v===0)||(key==='pf'&&v>1)||(key==='efficiency'&&v>100))throw Error(`${ratingFields[key]}: ค่าตัวเลขไม่ถูกต้อง`);}}return out;}).filter(row=>Object.values(row).some(Boolean));
  return {key:text(input.key,80,'รหัสระบบ'),id,label,name:text(input.name,80,'หน้าที่เครื่อง'),zone:text(input.zone,40,'ไลน์ผลิต'),cls,base:number(input.base,0,100,'ค่าการสั่นจำลอง'),x:number(input.x,0,100,'ตำแหน่ง X'),y:number(input.y,0,100,'ตำแหน่ง Y'),plate,ratings};
 }
 function validateList(items){if(!Array.isArray(items)||items.length>500)throw Error('รองรับรายการมอเตอร์ได้ไม่เกิน 500 ตัว');const out=items.map(validate);const ids=new Set(),keys=new Set();for(const m of out){if(!m.key||ids.has(m.id.toLowerCase())||keys.has(m.key))throw Error('มีรหัสมอเตอร์ซ้ำหรือรหัสระบบไม่ถูกต้อง');ids.add(m.id.toLowerCase());keys.add(m.key);}return out;}
 function parseBackup(raw){const parsed=JSON.parse(raw);if(parsed.version!==1)throw Error('ไม่รองรับเวอร์ชันไฟล์สำรองนี้');return validateList(parsed.motors);}
 const api={plateFields,ratingFields,validate,validateList,parseBackup};root.MotorData=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
