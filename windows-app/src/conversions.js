'use strict';
const MeasurementConversion = (() => {
  const names = { velocity: 'Velocity', displacement: 'Displacement', acceleration: 'Acceleration', frequency: 'Frequency', temperature: 'Temperature' };
  const units = { velocity: 'mm/s', displacement: 'µm', acceleration: 'm/s²', frequency: 'Hz', temperature: '°C' };
  const hex = value => Number.isInteger(value) ? `0x${value.toString(16).toUpperCase().padStart(4, '0')}` : '—';
  const number = value => !Number.isFinite(value) ? '—' : Number(value.toPrecision(7)).toString();
  function describe(frame, kind, threeAxis = true) {
    const config = frame?.decodeConfig;
    if (!threeAxis) {
      const raw = Array.isArray(frame?.rawRegisters) ? frame.rawRegisters : [];
      const known = config?.sensorModel === 'custom' && Number.isInteger(config.registerAddress) && Number.isFinite(config.scale) && ['uint16', 'int16', 'uint32', 'int32', 'float32'].includes(config.dataType);
      return [{ label: 'Value', address: known ? hex(config.registerAddress) : 'ไม่ทราบ Address', raw: raw.length ? raw.join(' / ') : 'ไม่มีค่าดิบ', rawHex: raw.length ? raw.map(hex).join(' / ') : '—', formula: known ? `${config.dataType}${['uint16', 'int16'].includes(config.dataType) ? '' : ` (${config.byteOrder})`} × ${number(config.scale)}` : 'ไม่มีการตั้งค่าสูตรในรายการนี้', result: `${number(frame?.value)} ${frame?.unit || config?.unit || ''}`, note: known ? 'ใช้การตั้งค่าที่บันทึกพร้อมข้อมูลรายการนี้' : 'ไม่ใช้การตั้งค่าปัจจุบันแทนสูตรของข้อมูลเก่า' }];
    }
    return (kind === 'temperature' ? [''] : ['X', 'Y', 'Z']).map((axis, index) => {
      const key = `${kind}${axis}`, value = frame?.channels?.[key], signed = ['acceleration', 'temperature'].includes(kind);
      const address = kind === 'frequency' ? 0x21 + index * 2 : kind === 'acceleration' ? 10 + index : kind === 'displacement' ? 4 + index : kind === 'temperature' ? 0 : 1 + index;
      const words = kind === 'frequency' ? frame?.rawRegisters?.frequency?.slice(index * 2, index * 2 + 2) : [kind === 'acceleration' ? frame?.rawRegisters?.acceleration?.[index] : frame?.rawRegisters?.primary?.[address]];
      const valid = words?.length === (kind === 'frequency' ? 2 : 1) && words.every(word => Number.isInteger(word) && word >= 0 && word <= 65535);
      let formula = signed ? 'Int16 ÷ 10' : 'UInt16 ÷ 10';
      if (kind === 'frequency') formula = frame?.frequencyByteOrder && frame.frequencyByteOrder !== 'unconfirmed' ? `Float32 (${frame.frequencyByteOrder}) · ไม่หาร 10` : 'Float32 · ยังไม่ยืนยันลำดับข้อมูล';
      else if (valid) {
        const decoded = signed && words[0] >= 32768 ? words[0] - 65536 : words[0];
        formula = signed ? `Int16(${words[0]}) → ${decoded}; ${decoded} ÷ 10` : `UInt16(${words[0]}) ÷ 10`;
      }
      return { label: `${names[kind]} ${axis}`.trim(), address: kind === 'frequency' ? `${hex(address)} / ${hex(address + 1)}` : hex(address), raw: valid ? words.join(' / ') : 'ไม่มีค่าดิบ', rawHex: valid ? words.map(hex).join(' / ') : '—', formula, result: `${number(value)} ${units[kind]}`, note: !valid ? 'รายการนี้ไม่มีค่าดิบ จึงตรวจการแปลงย้อนหลังไม่ได้' : kind === 'frequency' && !Number.isFinite(value) ? frame?.frequencyMessage || 'ยังไม่แสดง Hz จนกว่าจะยืนยันรูปแบบและอ่านข้อมูลได้' : '' };
    });
  }
  function text(row) { return `${row.label} · ${row.address}\nRaw ${row.raw} (${row.rawHex})\n${row.formula} → ${row.result}${row.note ? `\n${row.note}` : ''}`; }
  return { describe, text };
})();
if (typeof module !== 'undefined') module.exports = MeasurementConversion;
