'use strict';

const api = window.vectraDesktop;
const $ = id => document.getElementById(id);
const form = $('sensor-form');
let ports = [];
let verifiedSignature = '';
let session = null;
let readings = [];
let sampleCount = 0;
let demoTimer = null;
let pauseDisplay = false;

function setTitleStatus(state, text) {
  const status = $('title-status');
  status.className = `title-status ${state || ''}`;
  status.querySelector('span').textContent = text;
}

function notify(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function getConfig() {
  const raw = Object.fromEntries(new FormData(form));
  for (const key of ['baudRate', 'stopBits', 'slaveId', 'registerAddress', 'scale', 'pollInterval', 'timeout']) raw[key] = Number(raw[key]);
  return raw;
}

function configSignature(config = getConfig()) {
  const keys = ['sensorModel', 'path', 'motorId', 'unit', 'baudRate', 'parity', 'stopBits', 'slaveId', 'registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale', 'pollInterval', 'timeout'];
  return JSON.stringify(Object.fromEntries(keys.map(key => [key, config[key]])));
}

function applySensorPreset(model, keepConnection = true) {
  const connection = keepConnection ? {
    path: form.elements.path.value,
    motorId: form.elements.motorId.value,
    baudRate: form.elements.baudRate.value,
    parity: form.elements.parity.value,
    stopBits: form.elements.stopBits.value,
    slaveId: form.elements.slaveId.value,
    pollInterval: form.elements.pollInterval.value,
    timeout: form.elements.timeout.value
  } : {};
  if (model === 'vemsee-sn3001-wz3a-n01') {
    fillForm({ sensorModel: model, registerType: 'holding', registerAddress: 0, dataType: 'int16', byteOrder: 'ABCD', scale: 0.1, unit: 'mm/s', ...connection });
    $('preset-note').hidden = false;
  } else {
    fillForm({ sensorModel: 'custom', registerAddress: 0, dataType: 'float32', byteOrder: 'ABCD', scale: 1, unit: 'mm/s RMS', ...connection });
    $('preset-note').hidden = true;
  }
  invalidateTest();
}

function setTestResult(kind, title, message) {
  const box = $('test-result');
  box.className = `test-result ${kind}`;
  box.querySelector('.result-icon').textContent = kind === 'success' ? '✓' : kind === 'error' ? '!' : kind === 'testing' ? '…' : '○';
  box.querySelector('strong').textContent = title;
  box.querySelector('p').textContent = message;
}

function invalidateTest() {
  if (!verifiedSignature) return;
  verifiedSignature = '';
  $('connect-sensor').disabled = true;
  setTestResult('idle', 'การตั้งค่าถูกแก้ไข', 'ทดสอบเซ็นเซอร์อีกครั้งก่อนเชื่อมต่อ');
}

function fillForm(config) {
  if (!config) return;
  for (const [key, value] of Object.entries(config)) {
    const field = form.elements.namedItem(key);
    if (field && value !== undefined && value !== null) field.value = String(value);
  }
}

function renderPorts() {
  const list = $('port-list');
  const select = $('port-select');
  const selected = select.value;
  list.replaceChildren();
  select.replaceChildren(new Option('เลือกอุปกรณ์', ''));
  for (const port of ports) {
    const option = new Option(`${port.path}${port.manufacturer ? ` — ${port.manufacturer}` : ''}`, port.path);
    select.add(option);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `port-button${selected === port.path ? ' selected' : ''}`;
    button.dataset.path = port.path;
    const icon = document.createElement('span');
    icon.className = 'device-icon'; icon.textContent = 'USB';
    const text = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = port.path;
    const details = document.createElement('small');
    details.textContent = [port.manufacturer || 'อุปกรณ์ Serial', port.vendorId && `VID ${port.vendorId}`, port.productId && `PID ${port.productId}`].filter(Boolean).join(' · ');
    text.append(name, details);
    const badge = document.createElement('span'); badge.className = 'usb-badge'; badge.textContent = port.vendorId ? 'USB' : 'SERIAL';
    button.append(icon, text, badge);
    button.addEventListener('click', () => selectPort(port.path));
    list.append(button);
  }
  if (selected && !ports.some(port => port.path === selected)) select.add(new Option(`${selected} — ค่าที่บันทึกไว้`, selected));
  select.value = selected;
  if (!ports.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-ports';
    empty.textContent = 'ยังไม่พบ Serial Port ตรวจสาย USB และไดรเวอร์ แล้วสแกนอีกครั้ง';
    list.append(empty);
  }
  $('port-summary').textContent = ports.length ? `พบ ${ports.length} พอร์ต — เลือกพอร์ตของ USB–RS485` : 'ไม่พบพอร์ตที่พร้อมใช้งาน';
}

function selectPort(path) {
  $('port-select').value = path;
  renderPorts();
  invalidateTest();
}

async function scanPorts() {
  $('refresh-ports').disabled = true;
  $('port-summary').textContent = 'กำลังสแกน...';
  const result = await api.listPorts();
  ports = result.ports || [];
  renderPorts();
  if (!result.ok) notify(`อ่านรายการพอร์ตไม่สำเร็จ: ${result.message}`);
  $('refresh-ports').disabled = false;
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(page => {
    const active = page.id === `${name}-page`;
    page.classList.toggle('active', active);
    page.hidden = !active;
  });
  document.querySelectorAll('.nav-button').forEach(button => {
    const active = button.dataset.page === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelector('main').scrollTo(0, 0);
}

function resetSessionDisplay() {
  readings = [];
  sampleCount = 0;
  pauseDisplay = false;
  $('sample-count').textContent = '0';
  $('pause-stream').textContent = 'หยุดกราฟชั่วคราว';
  $('channel-grid').hidden = true;
  $('axis-legend').hidden = true;
  $('primary-reading-label').textContent = 'ค่าการสั่นล่าสุด';
  updateStats();
  drawChart();
}

function beginDashboard(nextSession) {
  session = nextSession;
  resetSessionDisplay();
  const config = session.config;
  $('dashboard-motor').textContent = config.motorId;
  $('reading-unit').textContent = config.unit;
  $('session-mode').textContent = session.mode === 'demo' ? 'ข้อมูลจำลอง' : config.sensorModel === 'vemsee-sn3001-wz3a-n01' ? 'VemSee 3-axis / Modbus' : 'RS485 / Modbus RTU';
  $('session-motor').textContent = config.motorId;
  $('session-port').textContent = session.mode === 'demo' ? 'ไม่ใช้พอร์ต' : config.path;
  $('session-slave').textContent = session.mode === 'demo' ? '—' : config.slaveId;
  $('session-register').textContent = session.mode === 'demo' ? '—' : config.sensorModel === 'vemsee-sn3001-wz3a-n01' ? `${config.registerType === 'input' ? '04' : '03'} / 0000H–0006H, 000AH–000CH` : `${config.registerType === 'input' ? '04' : '03'} / ${config.registerAddress}`;
  $('connection-name').textContent = session.mode === 'demo' ? 'SIMULATION' : config.path;
  $('connection-detail').textContent = session.mode === 'demo' ? 'ไม่ได้อ่านค่าจากฮาร์ดแวร์' : `Slave ${config.slaveId} · ${config.baudRate} baud`;
  $('dashboard-source').textContent = session.mode === 'demo' ? 'กำลังแสดงข้อมูลจำลอง — ไม่ใช่ค่าจากเซ็นเซอร์' : `รับข้อมูลจริงจาก ${config.path}`;
  $('live-label').textContent = session.mode === 'demo' ? 'DEMO' : 'LIVE';
  document.querySelector('[data-page="dashboard"]').disabled = false;
  showPage('dashboard');
  setTitleStatus('connected', session.mode === 'demo' ? 'โหมดจำลอง' : `เชื่อมต่อ ${config.path}`);
}

function addReading(reading) {
  sampleCount += 1;
  if (pauseDisplay) return;
  readings.push({ value: Number(reading.value), channels: reading.channels || null, timestamp: reading.timestamp });
  readings = readings.slice(-60);
  $('reading-value').textContent = Number(reading.value).toFixed(2);
  $('reading-unit').textContent = reading.unit || session?.config.unit || 'mm/s RMS';
  $('reading-time').textContent = `รับล่าสุด ${new Date(reading.timestamp).toLocaleTimeString('th-TH')}`;
  if (reading.channels) {
    $('channel-grid').hidden = false;
    $('axis-legend').hidden = false;
    $('primary-reading-label').textContent = `Velocity สูงสุด · แกน ${reading.primaryAxis || '—'}`;
    $('velocity-x').textContent = Number(reading.channels.velocityX).toFixed(1);
    $('velocity-y').textContent = Number(reading.channels.velocityY).toFixed(1);
    $('velocity-z').textContent = Number(reading.channels.velocityZ).toFixed(1);
    $('temperature').textContent = Number(reading.channels.temperature).toFixed(1);
  }
  $('reading-status').textContent = 'รับข้อมูลแล้ว';
  $('reading-status').style.color = 'var(--success)';
  $('status-note').textContent = session?.mode === 'demo' ? 'ค่านี้สร้างโดยโปรแกรมเพื่อทดสอบหน้าจอ' : 'ตอบกลับจากเซ็นเซอร์และบันทึกลงไฟล์แล้ว';
  $('sample-count').textContent = String(sampleCount);
  updateStats();
  drawChart();
}

function updateStats() {
  const values = readings.map(item => item.value).filter(Number.isFinite);
  const format = value => Number.isFinite(value) ? value.toFixed(2) : '—';
  $('minimum-value').textContent = format(values.length ? Math.min(...values) : NaN);
  $('maximum-value').textContent = format(values.length ? Math.max(...values) : NaN);
  $('average-value').textContent = format(values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN);
}

function svgNode(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function drawChart() {
  const svg = $('trend-chart');
  svg.replaceChildren();
  const width = 800, height = 310, left = 52, right = 22, top = 24, bottom = 40;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const hasAxes = readings.some(item => item.channels);
  const series = hasAxes ? [
    { key: 'velocityX', color: '#0067c0' },
    { key: 'velocityY', color: '#16855b' },
    { key: 'velocityZ', color: '#a15c00' }
  ] : [{ key: 'value', color: '#0067c0' }];
  const seriesValues = series.map(item => readings.map(reading => item.key === 'value' ? reading.value : reading.channels?.[item.key]).filter(Number.isFinite));
  const values = seriesValues.flat();
  const max = values.length ? Math.max(...values, 1) : 10;
  const yMax = Math.ceil(max * 1.2 * 10) / 10;
  for (let i = 0; i <= 4; i += 1) {
    const y = top + i * plotHeight / 4;
    svg.append(svgNode('line', { x1: left, y1: y, x2: width - right, y2: y, stroke: '#e6e6e6', 'stroke-width': 1 }));
    const label = svgNode('text', { x: left - 10, y: y + 4, 'text-anchor': 'end', fill: '#737373', 'font-size': 11 });
    label.textContent = (yMax * (1 - i / 4)).toFixed(1);
    svg.append(label);
  }
  if (!values.length) {
    const message = svgNode('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', fill: '#737373', 'font-size': 14 });
    message.textContent = 'รอข้อมูลค่าการสั่น';
    svg.append(message);
    return;
  }
  series.forEach((item, seriesIndex) => {
    const current = seriesValues[seriesIndex];
    if (!current.length) return;
    const points = current.map((value, index) => {
      const x = left + (current.length === 1 ? plotWidth / 2 : index * plotWidth / (current.length - 1));
      const y = top + plotHeight - value / yMax * plotHeight;
      return `${x},${y}`;
    }).join(' ');
    svg.append(svgNode('polyline', { points, fill: 'none', stroke: item.color, 'stroke-width': 2.3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const last = points.split(' ').at(-1).split(',');
    svg.append(svgNode('circle', { cx: last[0], cy: last[1], r: 4, fill: '#fff', stroke: item.color, 'stroke-width': 2.5 }));
  });
}

async function returnToSetup() {
  clearInterval(demoTimer);
  demoTimer = null;
  if (session?.mode === 'live') await api.disconnect();
  session = null;
  document.querySelector('[data-page="dashboard"]').disabled = true;
  showPage('setup');
  setTitleStatus('', 'ยังไม่เชื่อมต่อ');
  await scanPorts();
}

$('refresh-ports').addEventListener('click', scanPorts);
$('open-data').addEventListener('click', () => api.openDataPath());
$('open-data-dashboard').addEventListener('click', () => api.openDataPath());
$('port-select').addEventListener('change', event => { selectPort(event.target.value); });
$('sensor-model').addEventListener('change', event => applySensorPreset(event.target.value));
form.addEventListener('input', invalidateTest);

$('test-sensor').addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  const config = getConfig();
  $('test-sensor').disabled = true;
  $('connect-sensor').disabled = true;
  setTestResult('testing', 'กำลังทดสอบการตอบกลับ', `เปิด ${config.path} และอ่าน Register ${config.registerAddress}...`);
  const result = await api.testConnection(config);
  $('test-sensor').disabled = false;
  if (!result.ok) {
    verifiedSignature = '';
    setTestResult('error', 'เซ็นเซอร์ไม่ตอบกลับตามค่าที่ตั้ง', result.message || 'ตรวจสาย A/B, ไฟเลี้ยง และค่าจากคู่มือ');
    setTitleStatus('error', 'ทดสอบไม่สำเร็จ');
    return;
  }
  verifiedSignature = configSignature(result.config);
  fillForm(result.config);
  $('connect-sensor').disabled = false;
  const raw = Array.isArray(result.registers)
    ? result.registers.join(', ')
    : `0000H: ${(result.registers?.primary || []).join(', ')} · 000AH: ${(result.registers?.acceleration || []).join(', ')}`;
  const summary = result.channels
    ? `X ${result.channels.velocityX.toFixed(1)} · Y ${result.channels.velocityY.toFixed(1)} · Z ${result.channels.velocityZ.toFixed(1)} mm/s · ${result.channels.temperature.toFixed(1)} °C`
    : `${Number(result.value).toFixed(3)} ${result.config.unit}`;
  setTestResult('success', `เซ็นเซอร์ตอบกลับ: ${summary}`, `Raw registers: ${raw}`);
  setTitleStatus('connected', `ตรวจพบเซ็นเซอร์ที่ ${result.config.path}`);
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const config = getConfig();
  if (configSignature(config) !== verifiedSignature) {
    invalidateTest();
    return;
  }
  $('connect-sensor').disabled = true;
  $('connect-sensor').textContent = 'กำลังเชื่อมต่อ...';
  const result = await api.connect(config);
  $('connect-sensor').textContent = 'เชื่อมต่อและเข้าแดชบอร์ด';
  if (!result.ok) {
    $('connect-sensor').disabled = false;
    setTestResult('error', 'เปิดการเชื่อมต่อไม่สำเร็จ', result.message || 'กรุณาทดสอบอีกครั้ง');
    return;
  }
  beginDashboard({ mode: 'live', config: result.config });
});

$('demo-mode').addEventListener('click', () => {
  const config = getConfig();
  config.path = '';
  beginDashboard({ mode: 'demo', config });
  let phase = 0;
  demoTimer = setInterval(() => {
    phase += .24;
    const channels = config.sensorModel === 'vemsee-sn3001-wz3a-n01' ? {
      velocityX: 2.8 + Math.sin(phase) * .35,
      velocityY: 3.4 + Math.sin(phase + .7) * .5,
      velocityZ: 2.1 + Math.sin(phase + 1.4) * .3,
      displacementX: 18.2, displacementY: 21.5, displacementZ: 16.4,
      accelerationX: 1.2, accelerationY: 1.6, accelerationZ: 1.1,
      temperature: 34.6 + Math.sin(phase / 4) * .4
    } : null;
    const axes = channels ? [['X', channels.velocityX], ['Y', channels.velocityY], ['Z', channels.velocityZ]] : [['—', 3.4 + Math.sin(phase) * .55]];
    const [primaryAxis, value] = axes.reduce((highest, current) => current[1] > highest[1] ? current : highest);
    addReading({ value, channels, primaryAxis, unit: channels ? 'mm/s' : config.unit, timestamp: new Date().toISOString() });
  }, 1000);
  const initialChannels = config.sensorModel === 'vemsee-sn3001-wz3a-n01' ? { velocityX: 2.8, velocityY: 3.4, velocityZ: 2.1, displacementX: 18.2, displacementY: 21.5, displacementZ: 16.4, accelerationX: 1.2, accelerationY: 1.6, accelerationZ: 1.1, temperature: 34.6 } : null;
  addReading({ value: 3.4, channels: initialChannels, primaryAxis: initialChannels ? 'Y' : null, unit: initialChannels ? 'mm/s' : config.unit, timestamp: new Date().toISOString() });
});

$('back-settings').addEventListener('click', returnToSetup);
document.querySelector('[data-page="setup"]').addEventListener('click', returnToSetup);
document.querySelector('[data-page="dashboard"]').addEventListener('click', () => { if (session) showPage('dashboard'); });
$('pause-stream').addEventListener('click', () => {
  pauseDisplay = !pauseDisplay;
  $('pause-stream').textContent = pauseDisplay ? 'แสดงกราฟต่อ' : 'หยุดกราฟชั่วคราว';
  $('live-label').textContent = pauseDisplay ? 'PAUSED' : session?.mode === 'demo' ? 'DEMO' : 'LIVE';
  notify(pauseDisplay ? 'หยุดอัปเดตหน้าจอชั่วคราว การบันทึกข้อมูลจริงยังทำงาน' : 'กลับมาอัปเดตหน้าจอแล้ว');
});

api.onReading(reading => {
  if (session?.mode !== 'live') return;
  addReading(reading);
});

api.onStatus(status => {
  if (status.state === 'read-error') {
    setTitleStatus('error', 'อ่านเซ็นเซอร์ผิดพลาด');
    $('reading-status').textContent = 'การอ่านขัดข้อง';
    $('reading-status').style.color = 'var(--danger)';
    $('status-note').textContent = status.message || 'ตรวจสายและการตั้งค่า';
    notify(`อ่านเซ็นเซอร์ไม่สำเร็จ: ${status.message || 'ไม่ทราบสาเหตุ'}`);
  }
  if (status.state === 'storage-error') notify(`บันทึกไฟล์ไม่สำเร็จ: ${status.message}`);
});

(async function initialize() {
  if (!api) return;
  const [saved, dataPath] = await Promise.all([api.loadConfig(), api.getDataPath()]);
  if (saved) fillForm(saved);
  else applySensorPreset('vemsee-sn3001-wz3a-n01', true);
  $('preset-note').hidden = form.elements.sensorModel.value !== 'vemsee-sn3001-wz3a-n01';
  $('data-path').textContent = dataPath;
  drawChart();
  await scanPorts();
  if (saved?.path) {
    if (![...$('port-select').options].some(option => option.value === saved.path)) $('port-select').add(new Option(`${saved.path} — ค่าที่บันทึกไว้`, saved.path));
    $('port-select').value = saved.path;
    renderPorts();
    $('port-select').value = saved.path;
  }
})();
