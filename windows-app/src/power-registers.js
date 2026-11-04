'use strict';
const PowerRegisters = (() => {
  const legacy = [
    ['currentUnbalanceWorst', 'กระแสไม่สมดุลสูงสุด', 3017, '%'],
    ['voltageAB', 'แรงดัน A–B', 3019, 'V'],
    ['voltageBC', 'แรงดัน B–C', 3021, 'V'],
    ['voltageCA', 'แรงดัน C–A', 3023, 'V'],
    ['voltageLLAvg', 'แรงดันเฉลี่ย L–L', 3025, 'V'],
    ['voltageAN', 'แรงดัน A–N', 3027, 'V'],
    ['voltageBN', 'แรงดัน B–N', 3029, 'V'],
    ['voltageCN', 'แรงดัน C–N', 3031, 'V'],
    ['voltageLNAvg', 'แรงดันเฉลี่ย L–N', 3035, 'V']
  ];
  // Schneider FA379514, Public_PM2xxx PMC Register List_v1000.
  // The register numbers in the workbook are 1-based; these are RTU PDU addresses.
  const pm2230 = [
    ['currentA', 'กระแส A', 2999, 'A'],
    ['currentB', 'กระแส B', 3001, 'A'],
    ['currentC', 'กระแส C', 3003, 'A'],
    ['currentN', 'กระแส N', 3005, 'A'],
    ['currentG', 'กระแส G', 3007, 'A'],
    ['currentAvg', 'กระแสเฉลี่ย', 3009, 'A'],
    ['currentUnbalanceA', 'กระแสไม่สมดุล A', 3011, '%'],
    ['currentUnbalanceB', 'กระแสไม่สมดุล B', 3013, '%'],
    ['currentUnbalanceC', 'กระแสไม่สมดุล C', 3015, '%'],
    ...legacy,
    ['activePowerA', 'กำลังไฟฟ้าจริง A', 3053, 'kW'],
    ['activePowerB', 'กำลังไฟฟ้าจริง B', 3055, 'kW'],
    ['activePowerC', 'กำลังไฟฟ้าจริง C', 3057, 'kW'],
    ['activePowerTotal', 'กำลังไฟฟ้าจริง รวม', 3059, 'kW'],
    ['reactivePowerA', 'กำลังไฟฟ้ารีแอกทีฟ A', 3061, 'kVAR'],
    ['reactivePowerB', 'กำลังไฟฟ้ารีแอกทีฟ B', 3063, 'kVAR'],
    ['reactivePowerC', 'กำลังไฟฟ้ารีแอกทีฟ C', 3065, 'kVAR'],
    ['reactivePowerTotal', 'กำลังไฟฟ้ารีแอกทีฟ รวม', 3067, 'kVAR'],
    ['apparentPowerA', 'กำลังไฟฟ้าปรากฏ A', 3069, 'kVA'],
    ['apparentPowerB', 'กำลังไฟฟ้าปรากฏ B', 3071, 'kVA'],
    ['apparentPowerC', 'กำลังไฟฟ้าปรากฏ C', 3073, 'kVA'],
    ['apparentPowerTotal', 'กำลังไฟฟ้าปรากฏ รวม', 3075, 'kVA'],
    ['frequency', 'ความถี่ไฟฟ้า', 3109, 'Hz']
  ];
  const map = (fields, blocks) => ({
    fields: fields.map(([key, label, address, unit]) => ({key, label, address, unit})),
    blocks
  });
  const presets = {
    pm2200: map(legacy, {first:[3017,16], last:[3035,2]}),
    pm2230: map(pm2230, {first:[2999,34], last:[3035,2], power:[3053,24], frequency:[3109,2]})
  };
  return {
    preset: model => model === 'pm2230' ? presets.pm2230 : presets.pm2200,
    label: model => model === 'pm2230' ? 'PM2230' : 'PM2200'
  };
})();
if (typeof module !== 'undefined') module.exports = PowerRegisters;
