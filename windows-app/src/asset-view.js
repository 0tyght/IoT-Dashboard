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
    } else if (event.data?.type === 'vectra-exit-model-fullscreen' && document.fullscreenElement === panel) {
      document.exitFullscreen().catch(error => toast(error.message));
    }
  });
  $('expand-model').onclick = () => action(() => togglePanelFullscreen(panel));
  $('retry-model').onclick = () => { panel.dataset.modelState = 'loading'; $('retry-model').hidden = true; frame.hidden = false; $('model-status').textContent = 'กำลังเปิดโมเดล 3D…'; frame.src = 'models/industrial-drive-v4.html'; };
  $('expand-charts').onclick = () => action(() => togglePanelFullscreen($('detail-plots').closest('.trend-panel')));
  document.addEventListener('fullscreenchange', () => {
    $('expand-model').textContent = document.fullscreenElement === panel ? 'ย่อโมเดล' : 'ขยายโมเดล';
    $('expand-charts').textContent = document.fullscreenElement?.classList.contains('trend-panel') ? 'ย่อกราฟ' : 'ขยายกราฟ';
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
  if (currentTab === 'monitor' && !frame.hasAttribute('src') && !$('monitor-content').hidden) {
    frame.hidden = false; frame.src = 'models/industrial-drive-v4.html';
  }
}
function frequencySummary(reading) {
  if (!reading) return 'รอข้อมูลความถี่ X/Y/Z จากเซ็นเซอร์';
  if (reading.source === 'SIMULATION') return 'ความถี่จำลอง · ใช้ทดสอบหน้าจอ';
  if (reading.frequencyStatus === 'ok') return `ความถี่การสั่นจากเซ็นเซอร์ · Float ${reading.frequencyByteOrder} · ไม่ใช่ความถี่ไฟฟ้าหรือรอบมอเตอร์`;
  return reading.frequencyMessage || 'ไม่มี Hz ในข้อมูลรุ่นเดิม · ต้องอ่าน Register ความถี่เพิ่ม';
}
