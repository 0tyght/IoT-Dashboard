'use strict';
// One stroke vocabulary for controls; labels remain text for accessibility.
const controlPaths = {
  play: 'M7 4 19 12 7 20Z', stop: 'M6 6H18V18H6Z', plus: 'M12 5V19M5 12H19',
  settings: 'M4 7H20M4 17H20M8 4V10M16 14V20',
  folder: 'M3 7V19H21V7H12L9 4H3Z',
  help: 'M22 12A10 10 0 1 1 2 12A10 10 0 0 1 22 12M9 9A3 3 0 1 1 4 3C12 13 12 14 12 15M12 18H12.01',
  close: 'M6 6 18 18M18 6 6 18', refresh: 'M20 7V3M20 7H16M20 7A8 8 0 1 0 0 10',
  search: 'M21 21 16 16M18 10A8 8 0 1 1 2 10A8 8 0 0 1 18 10',
  download: 'M12 3V16M7 11 12 16 17 11M4 17V21H20V17',
  pause: 'M8 5V19M16 5V19', menu: 'M4 6H20M4 12H20M4 18H20',
  expand: 'M8 3H3V8M16 3H21V8M3 16V21H8M21 16V21H16',
  panel: 'M3 4H21V20H3ZM15 4V20', info: 'M12 11V17M12 7H12.01M22 12A10 10 0 1 1 2 12A10 10 0 0 1 22 12'
};
function controlIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'control-icon' })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', controlPaths[name]); svg.append(path); return svg;
}
function controlLabel(button, label, icon) { button.replaceChildren(controlIcon(icon), document.createTextNode(label)); }
function setupControls() {
  const labels = {
    disconnect: ['หยุดอ่านและบันทึก', 'stop'], 'new-motor': ['เพิ่มอุปกรณ์', 'plus'], 'edit-motor': ['ตั้งค่าอุปกรณ์', 'settings'],
    'open-data': ['โฟลเดอร์ข้อมูล', 'folder'], 'help-button': ['คู่มือ', 'help'],
    'fleet-empty-add': ['เพิ่มอุปกรณ์', 'plus'],
    'load-history': ['โหลดข้อมูล', 'refresh'], 'export-csv': ['ส่งออก CSV', 'download']
  };
  for (const [id, [label, icon]] of Object.entries(labels)) controlLabel(document.getElementById(id), label, icon);
  for (const [key,description] of Object.entries({fleet:'แผนผัง ชุดอุปกรณ์ และการเชื่อมต่ออุปกรณ์',monitor:'ค่าการสั่นและกราฟของเซ็นเซอร์ที่เลือก',power:'ค่าจาก Power Meter และประวัติไฟฟ้า',history:'ค้นหาและส่งออกข้อมูลที่บันทึก',analysis:'วิเคราะห์ข้อมูลย้อนหลังหรือคลื่นดิบ',model:'โมเดล 3D',registers:'ค่าดิบจาก Register',motors:'จัดการเซ็นเซอร์ในทะเบียน',events:'เหตุการณ์ระหว่างทำงาน'})){const tab=document.querySelector(`[data-tab="${key}"]`);if(tab)tab.title=description;}
  const sessionMenu = document.getElementById('session-actions');
  document.addEventListener('pointerdown', event => { if (!sessionMenu.contains(event.target)) sessionMenu.open = false; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && sessionMenu.open) { sessionMenu.open = false; sessionMenu.querySelector('summary').focus(); } });
  sessionMenu.addEventListener('click', event => {
    if (event.target.closest('button')) { sessionMenu.open = false; if (document.activeElement.closest('.session-options')) sessionMenu.querySelector('summary').focus(); }
  });
  for (const [id, icon] of [['close-connection', 'close'], ['close-help', 'close'], ['refresh-ports', 'refresh']]) document.getElementById(id).replaceChildren(controlIcon(icon));
  document.getElementById('refresh-ports').setAttribute('aria-label', 'สแกน COM Port');
  document.querySelector('.search > span').replaceChildren(controlIcon('search'));
  const toggle = document.createElement('button'); toggle.id = 'toggle-sidebar'; toggle.className = 'icon-button';
  toggle.setAttribute('aria-label', 'ย่อหรือขยายพื้นที่งาน'); toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-controls', 'motor-sidebar');
  toggle.replaceChildren(controlIcon('menu')); document.querySelector('.sidebar').id = 'motor-sidebar';
  document.querySelector('.appbar').prepend(toggle);
  toggle.onclick = () => { const collapsed = document.querySelector('.shell').classList.toggle('sidebar-collapsed'); toggle.setAttribute('aria-expanded', String(!collapsed)); };
  document.getElementById('confirm-dialog').setAttribute('aria-labelledby', 'confirm-title');
  document.getElementById('confirm-dialog').setAttribute('aria-describedby', 'confirm-message');
  document.querySelector('#help-dialog h2').id = 'help-title'; document.getElementById('help-dialog').setAttribute('aria-labelledby', 'help-title');
}
