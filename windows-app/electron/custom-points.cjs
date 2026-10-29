'use strict';
const TYPES={uint16:1,int16:1,uint32:2,int32:2,float32:2};
const ORDERS=new Set(['ABCD','BADC','CDAB','DCBA']);
function normalizePoints(raw){
 if(!Array.isArray(raw)||raw.length<1||raw.length>64)throw new Error('ต้องมีจุดวัด 1–64 รายการ');
 const ids=new Set();return raw.map((point,index)=>{
  const display=String(point.display||'table');if(!['table','number','chart'].includes(display))throw new Error('รูปแบบแสดงผลไม่ถูกต้อง');
  const id=String(point.id||'').trim(),name=String(point.name||'').trim(),type=String(point.dataType||'uint16'),order=String(point.byteOrder||'ABCD').toUpperCase(),fn=String(point.registerType||'holding'),address=Number(point.registerAddress),scale=Number(point.scale??1),offset=Number(point.offset??0);
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(id)||ids.has(id.toUpperCase()))throw new Error(`รหัสจุดวัดลำดับ ${index+1} ไม่ถูกต้องหรือซ้ำ`);ids.add(id.toUpperCase());
  if(!name||name.length>80)throw new Error(`ระบุชื่อจุดวัดลำดับ ${index+1} ไม่เกิน 80 ตัวอักษร`);
  if(!Object.hasOwn(TYPES,type)||!ORDERS.has(order)||!['holding','input'].includes(fn))throw new Error(`ชนิดข้อมูล Function หรือ Byte order ของ ${name} ไม่ถูกต้อง`);
  if(point.registerAddress==null||String(point.registerAddress).trim()===''||!Number.isInteger(address)||address<0||address+TYPES[type]>65536)throw new Error(`Address ของ ${name} อยู่นอกช่วง 0–65535`);
  if(point.scale===null||point.offset===null||point.scale===''||point.offset===''||!Number.isFinite(scale)||scale===0||Math.abs(scale)>1000000||!Number.isFinite(offset)||Math.abs(offset)>1000000)throw new Error(`ตัวคูณหรือค่าชดเชยของ ${name} ไม่ถูกต้อง`);
  return {id,name,registerType:fn,registerAddress:address,dataType:type,byteOrder:order,scale,offset,unit:String(point.unit||'').trim().slice(0,32),enabled:point.enabled!==false,record:point.record!==false,display};
 });
}
module.exports={normalizePoints,TYPES};
