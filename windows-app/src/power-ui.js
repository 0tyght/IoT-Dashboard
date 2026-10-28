'use strict';
// Preview only: no meter configuration, Modbus reads or persisted measurements.
const powerTab = document.createElement('button');
powerTab.dataset.tab = 'power';
powerTab.textContent = 'ข้อมูลไฟฟ้า';
document.querySelector('.tabs').append(powerTab);
const diagnostic = document.createElement('details');
diagnostic.className = 'power-diagnostic';
diagnostic.innerHTML = `<summary>ตรวจสอบการสื่อสาร</summary><p>อ่าน 2 Register จากมิเตอร์ Slave 3 โดยใช้ COM และการสื่อสารของมอเตอร์ที่เลือก · หยุดการอ่านก่อนทดสอบ</p><label>Address ที่ส่งในคำสั่ง<input id="power-test-address" type="number" min="0" max="65534" step="1" value="3019"></label><label>Function<select id="power-test-function"><option value="holding">FC03 · Holding</option><option value="input">FC04 · Input</option></select></label><button id="power-test-button" type="button">ทดสอบอ่านค่าดิบ</button><p id="power-test-result" role="status" aria-live="polite">3019 เป็นเลขจากตาราง ยังต้องเทียบค่ากับหน้ามิเตอร์</p>`;
document.querySelector('.power-setup').append(diagnostic);
diagnostic.querySelector('#power-test-button').addEventListener('click', async event => {
  const result = document.getElementById('power-test-result'), button = event.currentTarget;
  if (mode !== 'offline' || busy) { result.textContent = 'หยุดการอ่านและรอให้โปรแกรมพร้อมก่อนทดสอบ'; return; }
  const profile = currentProfile();
  if (!profile) { result.textContent = 'เลือกมอเตอร์ที่ตั้งค่าพอร์ต RS485 แล้วก่อนทดสอบ'; return; }
  const input = document.getElementById('power-test-address');
  if (!input.reportValidity()) return;
  button.disabled = true; result.textContent = 'กำลังอ่านค่าดิบจากมิเตอร์…';
  try {
    const data = check(await api.testPowerRegister(profile, {slaveId:3,address:Number(input.value),registerType:document.getElementById('power-test-function').value}));
    const raw = data.raw.map(value => `0x${value.toString(16).toUpperCase().padStart(4,'0')}`).join(' ');
    const bytes = [data.raw[0] >> 8, data.raw[0] & 255, data.raw[1] >> 8, data.raw[1] & 255];
    const orders = {ABCD:[0,1,2,3],CDAB:[2,3,0,1],BADC:[1,0,3,2],DCBA:[3,2,1,0]};
    const candidates = Object.entries(orders).map(([name, order]) => {
      const buffer = new Uint8Array(order.map(index => bytes[index]));
      const value = new DataView(buffer.buffer).getFloat32(0, false);
      return `${name}: ${Number.isFinite(value) ? Number(value.toPrecision(6)) : 'ไม่ใช่ค่าที่ใช้ได้'}`;
    });
    result.textContent = `${data.path} · Slave 3 · Address ${data.address} · Raw ${raw}\nตัวเลือก Float (ยังไม่ยืนยัน): ${candidates.join(' · ')}\nเทียบกับหน้ามิเตอร์ขณะมีค่าที่ไม่เป็นศูนย์; ค่าที่ดูสมเหตุสมผลอย่างเดียวไม่ยืนยันลำดับ`;
  } catch (error) { result.textContent = `อ่านไม่สำเร็จ: ${error.message}`; }
  finally { button.disabled = false; }
});
