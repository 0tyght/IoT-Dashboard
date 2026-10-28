'use strict';
const { normalizeConfig } = require('./sensor-codec.cjs');
function normalizeGroups(raw) {
  if (!Array.isArray(raw) || raw.length > 64) throw new Error('ชุดการวัดต้องมีไม่เกิน 64 ชุด');
  const ids = new Set();
  return raw.map(item => {
    const id = String(item.id || '').trim(), name = String(item.name || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(id) || ids.has(id.toUpperCase())) throw new Error('รหัสชุดไม่ถูกต้องหรือซ้ำ');
    if (!name || name.length > 80) throw new Error('ชื่อชุดต้องมี 1–80 ตัวอักษร');
    ids.add(id.toUpperCase());
    if (!Array.isArray(item.motorIds) || !Array.isArray(item.meters) || item.motorIds.length + item.meters.length > 64) throw new Error('รายการอุปกรณ์ไม่ถูกต้อง');
    const motorIds = item.motorIds.map(value => String(value));
    if (new Set(motorIds.map(value=>value.toUpperCase())).size !== motorIds.length) throw new Error('เซ็นเซอร์ซ้ำในชุด');
    const meterIds = new Set();
    const meters = item.meters.map(rawMeter => {
      const meterId = String(rawMeter.id || '').trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(meterId) || meterIds.has(meterId.toUpperCase())) throw new Error('รหัส Power Meter ไม่ถูกต้องหรือซ้ำ');
      meterIds.add(meterId.toUpperCase());
      const base = normalizeConfig({ ...rawMeter, motorId:meterId, sensorModel:'custom', registerAddress:3017, dataType:'float32', byteOrder:'ABCD', scale:1, unit:'V' });
      const byteOrder = rawMeter.byteOrder || 'unconfirmed';
      if (!['unconfirmed','ABCD','CDAB','BADC','DCBA'].includes(byteOrder)) throw new Error('ลำดับ Float ไม่ถูกต้อง');
      const offsetAdjust = Number(rawMeter.offsetAdjust ?? 0);
      if (![-1,0,1].includes(offsetAdjust)) throw new Error('การปรับ Address ต้องเป็น -1, 0 หรือ 1');
      const point=rawMeter.point||'motor-input';if(!['motor-input','generator-output','other'].includes(point))throw new Error('จุดวัดมิเตอร์ไม่ถูกต้อง');
      const motorId=String(rawMeter.motorId || '');if(motorId && !motorIds.some(id=>id.toUpperCase()===motorId.toUpperCase()))throw new Error('มอเตอร์ที่ผูกกับมิเตอร์ต้องอยู่ในชุดเดียวกัน');
      return { id:meterId, name:String(rawMeter.name || meterId).slice(0,80), point, motorId, path:base.path, slaveId:base.slaveId, baudRate:base.baudRate, parity:base.parity, stopBits:base.stopBits, timeout:base.timeout, pollInterval:base.pollInterval, registerType:base.registerType, byteOrder, offsetAdjust };
    });
    if (!motorIds.length && !meters.length) throw new Error('ชุดต้องมีอุปกรณ์อย่างน้อยหนึ่งตัว');
    return {id,name,motorIds,meters};
  });
}
function resolveGroup(group, profiles) {
  const motors=group.motorIds.map(id=>profiles.find(profile=>profile.motorId.toUpperCase()===id.toUpperCase()));
  if (motors.some(profile=>!profile)) throw new Error('ชุดนี้มีเซ็นเซอร์ที่ถูกลบหรือเปลี่ยนรหัส กรุณาแก้ไขชุดก่อนเริ่ม');
  if (motors.some(profile=>profile.enabled===false)) throw new Error('ชุดนี้มีเซ็นเซอร์ที่พักอ่านอยู่ กรุณาเปิดใช้งานหรือแก้ไขชุด');
  for(const meter of group.meters) if(profiles.some(profile=>profile.path.toUpperCase()===meter.path.toUpperCase() && profile.slaveId===meter.slaveId)) throw new Error(`พอร์ตและ Slave ID ซ้ำกับเซ็นเซอร์ในทะเบียน: ${meter.path}:${meter.slaveId}`);
  const buses=new Map(), addresses=new Set();
  for(const device of [...motors,...group.meters]) {
    const port=device.path.toUpperCase(), address=`${port}:${device.slaveId}`, serial=JSON.stringify([device.baudRate,device.parity,device.stopBits]);
    if(addresses.has(address)) throw new Error(`พอร์ตและ Slave ID ซ้ำ: ${address}`);
    if(buses.has(port)&&buses.get(port)!==serial) throw new Error(`อุปกรณ์บน ${port} ต้องใช้ Baud / Parity / Stop bits เดียวกัน`);
    addresses.add(address); buses.set(port,serial);
  }
  return {motors,meters:group.meters};
}
module.exports={normalizeGroups,resolveGroup};
