'use strict';
function setupAssetView() {
  const frame = $('asset-model'), panel = $('model-panel');
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === 'vectra-model-ready') {
      frame.hidden = false; $('model-poster').hidden = true;
      $('retry-model').hidden = true;
      $('model-status').textContent = 'ลากเพื่อหมุน · ล้อเลื่อนซูม · Shift + ลากเพื่อเลื่อน · ปุ่มลูกศรหมุน / R คืนมุม';
      panel.dataset.modelState = 'ready';
    } else if (event.data?.type === 'vectra-model-error') {
      frame.hidden = true; $('model-poster').hidden = false;
      $('retry-model').hidden = false;
      $('model-status').textContent = 'แสดงภาพนิ่ง · อุปกรณ์นี้เปิด WebGL 2 ไม่ได้'; panel.dataset.modelState = 'fallback';
    } else if (event.data?.type === 'vectra-exit-model-fullscreen') {
      if (!closeWorkbenchPopovers(true) && document.fullscreenElement === panel) document.exitFullscreen().catch(error => toast(error.message));
    }
  });
  $('expand-model').onclick = () => action(() => togglePanelFullscreen(panel));
  $('retry-model').onclick = () => { panel.dataset.modelState = 'loading'; $('retry-model').hidden = true; frame.hidden = false; $('model-status').textContent = 'กำลังเปิดโมเดล 3D…'; frame.src = 'models/industrial-drive-v4.html'; };
  $('expand-charts').onclick = () => action(() => togglePanelFullscreen($('detail-plots').closest('.trend-panel')));
  document.addEventListener('fullscreenchange', () => {
    controlLabel($('expand-model'), document.fullscreenElement === panel ? 'ย่อโมเดล' : 'ขยาย', 'expand');
    controlLabel($('expand-charts'), document.fullscreenElement?.classList.contains('trend-panel') ? 'ย่อกราฟ' : 'ขยายกราฟ', 'expand');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.fullscreenElement) { event.preventDefault(); document.exitFullscreen().catch(error => toast(error.message)); }
  });
}
async function togglePanelFullscreen(panel) {
  if (document.fullscreenElement) await document.exitFullscreen(); else await panel.requestFullscreen();
}
function ensureAssetView() {
  const frame = $('asset-model');
  if (currentTab === 'model' && !frame.hasAttribute('src')) {
    frame.hidden = false; frame.src = 'models/industrial-drive-v4.html';
  }
}
function frequencySummary(reading) {
  if (!reading) return 'รอข้อมูลความถี่ X/Y/Z จากเซ็นเซอร์';
  if (reading.source === 'SIMULATION') return 'ความถี่จำลอง · ใช้ทดสอบหน้าจอ';
  if (reading.frequencyStatus === 'ok') return `ความถี่การสั่นจากเซ็นเซอร์ · Float ${reading.frequencyByteOrder} · ไม่ใช่ความถี่ไฟฟ้าหรือรอบมอเตอร์`;
  if (reading.frequencyStatus === 'unconfirmed') return 'อ่านค่าดิบความถี่แล้ว แต่ยังไม่แปลงเป็น Hz · ยืนยันรูปแบบ Float ในตั้งค่ามอเตอร์ แล้วเริ่มอ่านใหม่ · ดูค่าดิบได้ที่ตาราง Register';
  return reading.frequencyMessage || 'ไม่มี Hz ในข้อมูลรุ่นเดิม · ต้องอ่าน Register ความถี่เพิ่ม';
}
function frequencyDisplay(reading, axis) {
  const value = reading?.channels?.[`frequency${axis}`];
  if (Number.isFinite(value)) return digits(value, 2);
  if (!reading) return 'รอข้อมูล';
  return { unconfirmed: 'รอยืนยัน', 'read-error': 'อ่านไม่ได้', unsupported: 'ไม่รองรับ', invalid: 'ตรวจรูปแบบ' }[reading.frequencyStatus] || 'ไม่มีข้อมูล';
}
