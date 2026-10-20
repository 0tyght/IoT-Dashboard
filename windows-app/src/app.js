'use strict';
const api = window.vectraDesktop;
const $ = id => document.getElementById(id);
const form = $('sensor-form');
const MODEL = 'vemsee-sn3001-wz3a-n01';
let profiles = [], ports = [], selected = '', editing = null, mode = 'offline', busy = false, frozen = false;
let demoTimer, chartFrames = [], chartIndex = -1, historyGeneration = 0;
let successful = 0, failures = 0, logs = [], dataError = false;
let editorBaseline = '';
let currentTab = 'fleet';
const cache = new Map();
const digits = (value, precision = 1) => Number.isFinite(value) ? value.toFixed(precision) : '—';
const currentProfile = () => profiles.find(profile => profile.motorId === selected);
const stateFor = id => { if (!cache.has(id)) cache.set(id, { frames: [], errors: 0, samples: 0, status: 'offline', message: '' }); return cache.get(id); };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const time = value => value ? new Date(value).toLocaleTimeString('th-TH', { hour12: false }) : '—';
function node(tag, text, className) { const element = document.createElement(tag); if (text != null) element.textContent = text; if (className) element.className = className; return element; }
function emptyRow(body, columns, message) { body.replaceChildren(); const row = node('tr'), cell = node('td', message, 'empty-cell'); cell.colSpan = columns; row.append(cell); body.append(row); }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
function message(text = '') { $('global-message').textContent = text; $('global-message').hidden = !text; }
function check(result) { if (!result?.ok) throw new Error(result?.message || 'ดำเนินการไม่สำเร็จ'); return result; }
async function action(task) { try { return await task(); } catch (error) { toast(error.message); addLog('error', '', error.message); } }
function addLog(kind, motorId, detail) {
  logs.unshift({ timestamp: Date.now(), kind, motorId, detail }); logs = logs.slice(0, 200);
  $('event-count').textContent = logs.length;
  renderLogs();
}
function renderLogs() {
  const body = $('events-body'); body.replaceChildren();
  if (!logs.length) return emptyRow(body, 4, 'ยังไม่มีเหตุการณ์ในรอบนี้');
  for (const entry of logs) {
    const row = node('tr'); row.append(node('td', time(entry.timestamp), 'mono'), node('td', entry.kind === 'error' ? 'ผิดพลาด' : 'ข้อมูล', `event-${entry.kind}`), node('td', entry.motorId || 'SYSTEM'), node('td', entry.detail, 'wrap-cell')); body.append(row);
  }
}
function setBusy(value) { busy = value; updateControls(); }
function updateControls() {
  const running = mode !== 'offline';
  $('connect-all').disabled = busy || running || !profiles.some(profile => profile.enabled !== false) || dataError;
  controlLabel($('connect-all'), busy ? 'กำลังดำเนินการ…' : 'เริ่มอ่านข้อมูล', 'play');
  $('disconnect').disabled = busy || !running;
  for (const id of ['new-motor', 'add-motor-table', 'fleet-add', 'fleet-empty-add']) $(id).disabled = busy || dataError;
  $('import-profiles').disabled = busy || running || dataError;
  $('edit-motor').disabled = busy || !currentProfile() || dataError || isTemporaryMotor(selected);
  $('demo-mode').disabled = busy || running;
  $('export-profiles').disabled = busy || !profiles.length;
  document.querySelectorAll('[data-edit], [data-delete]').forEach(button => { button.disabled = busy || dataError || isTemporaryMotor(button.dataset.edit || button.dataset.delete); });
  $('mode-indicator').className = `mode-indicator ${mode === 'live' ? 'live' : mode === 'demo' ? 'demo-mode' : ''}`;
  $('mode-indicator').textContent = mode === 'live' ? 'ACQUIRING' : mode === 'demo' ? 'SIMULATION' : 'OFFLINE';
  $('connect-all').setAttribute('aria-busy', String(busy));
}
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== `${tab}-view`; });
  document.querySelectorAll('[data-tab]').forEach(button => { const active = button.dataset.tab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
  document.querySelector('main').scrollTop = 0;
  if (tab === 'history') loadHistory();
  renderSelected();
}
function renderMotorList() {
  const list = $('motor-list'); list.replaceChildren();
  const query = $('motor-search').value.trim().toLowerCase();
  const visible = profiles.filter(profile => `${profile.motorId} ${profile.name} ${profile.area}`.toLowerCase().includes(query));
  $('motor-count').textContent = profiles.length;
  for (const profile of visible) {
    const button = node('button', null, `motor-item${profile.motorId === selected ? ' selected' : ''}`); button.dataset.motorId = profile.motorId;
    button.setAttribute('aria-pressed', String(profile.motorId === selected));
    const dot = node('i', null, 'dot offline'), text = node('span');
    text.append(node('strong', profile.name || profile.motorId), node('small', `${profile.motorId} · ${profile.area || 'ไม่ระบุพื้นที่'}`), node('small', `${profile.path} / ID ${profile.slaveId}${profile.enabled === false ? ' · พักการอ่าน' : ''}`));
    button.append(dot, text, node('b', '—', 'item-value')); button.onclick = () => selectMotor(profile.motorId); list.append(button);
  }
  if (!visible.length) list.append(node('p', profiles.length ? 'ไม่พบมอเตอร์ที่ค้นหา' : 'เพิ่มมอเตอร์เพื่อเริ่มต้น', 'empty-ports'));
  refreshMotorStates();
  refreshFleet();
}
function refreshMotorStates() {
  document.querySelectorAll('.motor-item').forEach(button => {
    const state = stateFor(button.dataset.motorId), last = state.frames.at(-1);
    button.querySelector('.dot').className = `dot ${mode === 'demo' ? 'demo' : state.status === 'online' ? 'online' : ['fault', 'stale'].includes(state.status) ? 'fault' : 'offline'}`;
    button.querySelector('.item-value').textContent = last ? digits(last.value) : '—';
  });
}
function selectMotor(id) { selected = id; frozen = false; controlLabel($('pause-stream'), 'พักกราฟ', 'pause'); renderMotorList(); setTab('monitor'); updateControls(); }
function renderProfiles() {
  const body = $('motors-body'); body.replaceChildren();
  const historySelection = $('history-motor').value;
  $('history-motor').replaceChildren(new Option('ทุกมอเตอร์', ''));
  for (const profile of profiles) {
    $('history-motor').add(new Option(profile.motorId, profile.motorId));
    const row = node('tr'), title = node('td'); title.append(node('strong', profile.motorId), node('small', profile.name || '—'));
    const actions = node('td'), group = node('div', null, 'row-actions');
    const edit = node('button', 'แก้ไข'), remove = node('button', 'ลบ'), enabled = node('button', profile.enabled === false ? 'เปิดอ่าน' : 'พักอ่าน');
    edit.dataset.edit = profile.motorId; remove.dataset.delete = profile.motorId;
    edit.onclick = () => openEditor(profile); remove.onclick = () => deleteMotor(profile);
    enabled.dataset.edit = profile.motorId;
    enabled.onclick = () => toggleMotor(profile);
    group.append(edit, enabled, remove); actions.append(group);
    row.append(title, node('td', profile.area || '—'), node('td', profile.sensorModel === MODEL ? 'VemSee 3-axis' : 'Custom register'), node('td', `${profile.path} / ${profile.slaveId}`, 'mono'), node('td', `${profile.baudRate} · 8${profile.parity[0].toUpperCase()}${profile.stopBits}`, 'mono'), actions); body.append(row);
  }
  if (!profiles.length) emptyRow(body, 6, 'ยังไม่มีมอเตอร์ กดเพิ่มมอเตอร์เพื่อตั้งค่าการเชื่อมต่อ');
  if ([...$('history-motor').options].some(option => option.value === historySelection)) $('history-motor').value = historySelection;
  renderMotorList(); buildFleet(); updateControls();
}
function renderSelected() {
  const profile = currentProfile(), state = profile ? stateFor(profile.motorId) : null, last = state?.frames.at(-1);
  const threeAxis = profile?.sensorModel === MODEL;
  $('metric-type').textContent = threeAxis ? 'VELOCITY' : 'VALUE';
  $('chart-kind').disabled = !threeAxis;
  [...$('chart-legend').children].slice(0, 3).forEach(element => { element.hidden = !threeAxis; });
  $('chart-description').textContent = threeAxis ? '120 ค่าล่าสุด · เลื่อนเมาส์เพื่ออ่านค่า' : `Custom register · ${profile?.unit || '—'} · เลื่อนเมาส์เพื่ออ่านค่า`;
  $('selected-title').textContent = profile ? profile.name || profile.motorId : 'สถานีตรวจวัดมอเตอร์';
  $('selected-area').textContent = profile?.area || 'LOCAL WORKSPACE';
  $('selected-subtitle').textContent = profile ? `${profile.motorId} · ${profile.sensorModel === MODEL ? 'VemSee SN-3001-WZ3A-N01' : 'Custom Modbus sensor'} · ${profile.path} / Slave ${profile.slaveId}` : 'ตั้งค่าเซ็นเซอร์เพื่อเริ่มเก็บข้อมูลในเครื่องนี้';
  $('welcome').hidden = Boolean(last) || mode !== 'offline';
  $('monitor-content').hidden = !last && mode === 'offline';
  $('empty-state-title').textContent = profiles.length ? 'ยังไม่มีข้อมูลการวัด' : 'ยังไม่มีมอเตอร์';
  $('empty-state-description').textContent = profiles.length ? 'เลือก “เริ่มอ่านข้อมูล” เพื่อทดสอบการเชื่อมต่อและรับข้อมูลจากเซ็นเซอร์' : 'เพิ่มมอเตอร์และกำหนดค่าการเชื่อมต่อเพื่อเริ่มอ่านข้อมูล';
  controlLabel($('welcome-setup'), profiles.length ? 'ตั้งค่าการเชื่อมต่อ' : 'เพิ่มมอเตอร์', profiles.length ? 'settings' : 'plus');
  $('demo-banner').hidden = mode !== 'demo';
  if (profile) {
    $('connection-name').textContent = mode === 'demo' ? 'DEMO' : profile.path;
    $('connection-detail').textContent = mode === 'demo' ? 'ค่าจำลอง · ไม่เขียนไฟล์' : `${profile.baudRate} baud · Slave ${profile.slaveId} · ${profile.parity.toUpperCase()}`;
    $('nameplate-display').textContent = profile.nameplate || 'ยังไม่มีข้อมูลฉลากเครื่อง · เพิ่มได้ในหน้าตั้งค่ามอเตอร์';
  }
  if (!frozen) {
    $('reading-value').textContent = digits(last?.value, 2);
    $('reading-unit').textContent = last?.unit || profile?.unit || 'mm/s';
    $('primary-axis').textContent = last?.primaryAxis ? `MAX · AXIS ${last.primaryAxis}` : 'CUSTOM';
    $('temperature').textContent = digits(last?.channels?.temperature);
    $('reading-time').textContent = last ? `รับล่าสุด ${time(last.timestamp)}` : 'รอการตอบกลับ';
    $('sample-count').textContent = state?.samples || 0;
    $('last-response').textContent = last ? `Response ${last.elapsedMs ?? 0} ms` : 'รอการตอบกลับ';
    $('record-state').textContent = mode === 'demo' ? 'ข้อมูลจำลอง · ไม่บันทึก' : last?.recorded === false ? 'บันทึกไม่สำเร็จ ตรวจพื้นที่ดิสก์' : last ? 'บันทึกลงไฟล์รายวันแล้ว' : 'ยังไม่มีข้อมูล';
    renderChannels(last); renderRegisters(last, profile);
    chartFrames = [...(state?.frames || [])]; drawChart();
  }
  refreshSelectionState();
  if (currentTab === 'fleet') {
    $('selected-title').textContent = 'ภาพรวมมอเตอร์'; $('selected-area').textContent = 'ทุกพื้นที่';
    $('selected-subtitle').textContent = 'ค่าการสั่นสามแกนและสถานะการรับข้อมูลของมอเตอร์แต่ละตัว';
  }
  $('selection-state').hidden = currentTab === 'fleet';
}
function refreshSelectionState() {
  const profile = currentProfile(), state = profile ? stateFor(profile.motorId) : null;
  const label = mode === 'demo' ? 'ข้อมูลจำลอง' : profile?.enabled === false ? 'พักการอ่านมอเตอร์นี้' : mode === 'offline' ? 'หยุดการอ่าน' : state?.status === 'online' ? '● รับข้อมูลแล้ว' : state?.status === 'stale' ? 'ข้อมูลเก่า · กำลังลองใหม่' : state?.status === 'fault' ? 'อ่านไม่สำเร็จ · กำลังลองใหม่' : 'กำลังรอข้อมูล';
  $('selection-state').textContent = label;
  $('selection-state').className = `selection-state ${mode === 'live' ? state?.status === 'online' ? 'online' : state?.status === 'fault' || state?.status === 'stale' ? 'fault' : '' : ''}`;
  $('selection-state').title = state?.message || '';
  $('status-text').replaceChildren(node('i', null, `dot ${mode === 'live' ? 'online' : mode === 'demo' ? 'demo' : 'offline'}`), document.createTextNode(mode === 'live' ? `กำลังอ่าน ${profiles.filter(item => item.enabled !== false).length} มอเตอร์` : mode === 'demo' ? 'โหมดทดลองหน้าจอ' : 'หยุดการอ่าน · พร้อมตั้งค่า'));
  $('status-count').textContent = `รับสำเร็จ ${successful} · ผิดพลาด ${failures}`;
  $('status-bus').textContent = profile ? `${profile.path} · ${profile.baudRate} / 8${profile.parity[0].toUpperCase()}${profile.stopBits} · FC${profile.registerType === 'input' ? '04' : '03'}` : 'Modbus RTU · 8 data bits';
  refreshMotorStates();
  refreshFleet();
}
function renderChannels(last) {
  const body = $('channel-body'); body.replaceChildren();
  for (const [label, key, unit] of [['Velocity', 'velocity', 'mm/s'], ['Displacement', 'displacement', 'µm'], ['Acceleration', 'acceleration', 'm/s²']]) {
    const row = node('tr'), title = node('td', label); title.append(node('small', unit)); row.append(title);
    for (const axis of ['X', 'Y', 'Z']) row.append(node('td', digits(last?.channels?.[`${key}${axis}`]), `axis-${axis.toLowerCase()}`));
    body.append(row);
  }
}
function renderRegisters(last, profile) {
  const body = $('register-body'); body.replaceChildren();
  if (!last) return emptyRow(body, 7, 'เริ่มอ่านข้อมูลเพื่อแสดงค่าดิบของเซ็นเซอร์');
  const hex = value => `${Number(value).toString(16).toUpperCase().padStart(4, '0')}H`;
  if (profile?.sensorModel === MODEL) {
    const definitions = [[0, 'Temperature', 'temperature', '°C'], [1, 'Velocity X', 'velocityX', 'mm/s'], [2, 'Velocity Y', 'velocityY', 'mm/s'], [3, 'Velocity Z', 'velocityZ', 'mm/s'], [4, 'Displacement X', 'displacementX', 'µm'], [5, 'Displacement Y', 'displacementY', 'µm'], [6, 'Displacement Z', 'displacementZ', 'µm'], [10, 'Acceleration X', 'accelerationX', 'm/s²'], [11, 'Acceleration Y', 'accelerationY', 'm/s²'], [12, 'Acceleration Z', 'accelerationZ', 'm/s²']];
    for (const [address, label, key, unit] of definitions) {
      const raw = address < 7 ? last.rawRegisters?.primary?.[address] : last.rawRegisters?.acceleration?.[address - 10];
      const row = node('tr'); row.append(node('td', hex(address), 'mono'), node('td', 40001 + address, 'mono'), node('td', label), node('td', raw ?? '—', 'mono'), node('td', raw == null ? '—' : hex(raw), 'mono'), node('td', digits(last.channels?.[key]), 'numeric'), node('td', unit)); body.append(row);
    }
  } else {
    (last.rawRegisters || []).forEach((raw, index) => {
      const address = (profile?.registerAddress || 0) + index, row = node('tr');
      row.append(node('td', hex(address), 'mono'), node('td', address + 40001, 'mono'), node('td', `Custom word ${index + 1}`), node('td', raw, 'mono'), node('td', hex(raw), 'mono'), node('td', index === 0 ? digits(last.value, 3) : '↳ รวมกับ word ก่อนหน้า', 'numeric'), node('td', last.unit)); body.append(row);
    });
  }
}
function svgNode(tag, attributes = {}, text) { const element = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value)); if (text != null) element.textContent = text; return element; }
function chartSeries() {
  const kind = $('chart-kind').value;
  return chartFrames.some(frame => frame.channels) ? ['X', 'Y', 'Z'].map((axis, index) => ({ key: `${kind}${axis}`, color: FLEET_COLORS[index], label: axis })) : [{ key: 'value', color: FLEET_COLORS[0], label: 'Value' }];
}
function drawChart() {
  const svg = $('trend-chart'); svg.replaceChildren(); $('chart-tooltip').hidden = true;
  const series = chartSeries(), values = series.flatMap(item => chartFrames.map(frame => item.key === 'value' ? frame.value : frame.channels?.[item.key]).filter(Number.isFinite));
  const floor = Math.min(0, ...values), ceiling = Math.max(1, ...values), span = ceiling - floor;
  const lower = floor < 0 ? floor - span * .1 : 0, upper = ceiling + span * .15;
  const y = value => 22 + (upper - value) / (upper - lower) * 222;
  const x = index => 56 + index / Math.max(chartFrames.length - 1, 1) * 822;
  for (let index = 0; index <= 4; index++) {
    const value = upper - index / 4 * (upper - lower), yy = 22 + index * 222 / 4;
    svg.append(svgNode('line', { x1: 56, y1: yy, x2: 878, y2: yy, stroke: '#343c48', 'stroke-dasharray': index === 4 ? '' : '3 4' }), svgNode('text', { x: 44, y: yy + 4, 'text-anchor': 'end', fill: '#a0aec0', 'font-size': 10 }, digits(value)));
  }
  for (const item of series) {
    const points = chartFrames.map((frame, index) => {
      const value = item.key === 'value' ? frame.value : frame.channels?.[item.key];
      return Number.isFinite(value) ? `${x(index)},${y(value)}` : null;
    }).filter(Boolean);
    if (!points.length) continue;
    svg.append(svgNode('polyline', { points: points.join(' '), fill: 'none', stroke: item.color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const [cx, cy] = points.at(-1).split(','); svg.append(svgNode('circle', { cx, cy, r: 3, fill: '#fff', stroke: item.color, 'stroke-width': 2 }));
  }
  if (!values.length) svg.append(svgNode('text', { x: 450, y: 140, 'text-anchor': 'middle', fill: '#9baabd', 'font-size': 13 }, 'รอข้อมูลจากเซ็นเซอร์'));
  [0, Math.floor((chartFrames.length - 1) / 2), chartFrames.length - 1].filter((value, index, array) => value >= 0 && array.indexOf(value) === index).forEach(index => svg.append(svgNode('text', { x: x(index), y: 271, 'text-anchor': index === 0 ? 'start' : index === chartFrames.length - 1 ? 'end' : 'middle', fill: '#a0aec0', 'font-size': 10 }, time(chartFrames[index]?.timestamp))));
  svg.append(svgNode('line', { id: 'crosshair', x1: 56, x2: 56, y1: 20, y2: 246, stroke: '#98aac1', 'stroke-dasharray': '3 3', visibility: 'hidden' }));
  const maxima = chartFrames.map(frame => Math.max(...series.map(item => item.key === 'value' ? frame.value : frame.channels?.[item.key]).filter(Number.isFinite))).filter(Number.isFinite);
  $('minimum-value').textContent = maxima.length ? digits(Math.min(...maxima), 2) : '—';
  $('maximum-value').textContent = maxima.length ? digits(Math.max(...maxima), 2) : '—';
  $('average-value').textContent = maxima.length ? digits(maxima.reduce((sum, value) => sum + value, 0) / maxima.length, 2) : '—';
  $('chart-live').textContent = frozen ? 'PAUSED' : mode === 'demo' ? 'DEMO' : mode === 'live' ? 'LIVE' : 'STOPPED';
}
function showChartPoint(index) {
  if (!chartFrames.length) return;
  chartIndex = Math.max(0, Math.min(chartFrames.length - 1, index));
  const frame = chartFrames[chartIndex], x = 56 + chartIndex / Math.max(chartFrames.length - 1, 1) * 822;
  const line = $('crosshair'); if (line) { line.setAttribute('x1', x); line.setAttribute('x2', x); line.setAttribute('visibility', 'visible'); }
  $('chart-tooltip').textContent = `${time(frame.timestamp)}\n${chartSeries().map(item => `${item.label}: ${digits(item.key === 'value' ? frame.value : frame.channels?.[item.key], 2)}`).join('   ')}`;
  $('chart-tooltip').hidden = false;
}
function addReading(reading) {
  if (!Number.isFinite(reading.value)) return;
  const state = stateFor(reading.motorId);
  if (state.frames.some(frame => frame.timestamp === reading.timestamp)) return;
  state.frames.push(reading); state.frames.sort((a, b) => a.timestamp.localeCompare(b.timestamp)); state.frames = state.frames.slice(-120);
  state.samples++; successful++;
  if (state.status === 'fault' || state.status === 'stale') addLog('info', reading.motorId, 'กลับมารับข้อมูลได้แล้ว');
  state.status = 'online'; state.message = '';
  if (reading.motorId === selected && currentTab !== 'fleet') renderSelected();
  else refreshSelectionState();
}
function configFromForm() {
  const raw = Object.fromEntries(new FormData(form));
  raw.enabled = editing ? profiles.find(profile => profile.motorId === editing)?.enabled !== false : true;
  for (const key of ['baudRate', 'stopBits', 'slaveId', 'registerAddress', 'scale', 'pollInterval', 'timeout']) raw[key] = Number(raw[key]);
  if (raw.sensorModel === MODEL) Object.assign(raw, { dataType: 'int16', registerAddress: 0, scale: .1, unit: 'mm/s', byteOrder: 'ABCD' });
  return raw;
}
function fillForm(config) { for (const [key, value] of Object.entries(config)) { const field = form.elements.namedItem(key); if (field) field.value = String(value ?? ''); } }
function presetVisibility() { const vemsee = form.elements.sensorModel.value === MODEL; $('preset-note').hidden = !vemsee; $('custom-fields').hidden = vemsee; form.elements.slaveId.max = vemsee ? '254' : '247'; }
function renderPorts(selectedPath = form.elements.path.value) {
  const select = $('port-select'), list = $('port-list'); select.replaceChildren(new Option('เลือกอุปกรณ์', '')); list.replaceChildren();
  ports.sort((a, b) => Number(Boolean(b.vendorId)) - Number(Boolean(a.vendorId)) || a.path.localeCompare(b.path, undefined, { numeric: true })).forEach(port => {
    select.add(new Option(`${port.path} · ${port.manufacturer || 'Serial'}`, port.path));
    const button = node('button', null, `port-button${port.path === selectedPath ? ' selected' : ''}`); button.type = 'button';
    const text = node('span'); text.append(node('strong', port.path), node('small', `${port.manufacturer || 'Serial adapter'}${port.vendorId ? ` · VID ${port.vendorId}` : ''}`));
    button.append(node('span', port.vendorId ? 'USB' : 'COM', 'port-icon'), text); button.onclick = () => { renderPorts(port.path); resetTest(); }; list.append(button);
  });
  if (selectedPath && !ports.some(port => port.path === selectedPath)) select.add(new Option(`${selectedPath} · ยังไม่พบอุปกรณ์`, selectedPath));
  select.value = selectedPath;
  $('port-summary').textContent = `พบ ${ports.length} พอร์ต`;
  if (!ports.length) list.append(node('p', 'ยังไม่พบพอร์ต ตรวจ USB และไดรเวอร์แล้วกดสแกน', 'empty-ports'));
}
async function scanPorts() { $('refresh-ports').disabled = true; try { ports = check(await api.listPorts()).ports; renderPorts(); } catch (error) { $('port-summary').textContent = error.message; } finally { $('refresh-ports').disabled = false; } }
function resetTest() { $('test-result').className = 'test-result'; $('test-result').querySelector('b').textContent = 'ทดสอบการตั้งค่านี้ก่อนเริ่มอ่าน'; $('test-result').querySelector('p').textContent = 'ค่า Baud / Parity / Stop bits และ Slave ID ต้องตรงกับตัวเซ็นเซอร์'; }
async function openEditor(profile) {
  if (busy) return;
  if (mode !== 'offline') return stopBeforeChange(() => openEditor(profile ? profiles.find(item => item.motorId === profile.motorId) : undefined));
  if (dataError) return toast('ตรวจข้อผิดพลาดไฟล์รายชื่อก่อนบันทึก');
  editing = profile?.motorId || null; form.reset(); $('form-error').hidden = true;
  let next = 1; while (profiles.some(item => item.motorId === `MTR-${String(next).padStart(2, '0')}`)) next++;
  const shared = profiles[0];
  fillForm(profile || { motorId: `MTR-${String(next).padStart(2, '0')}`, sensorModel: MODEL, path: shared?.path || '', baudRate: shared?.baudRate || 9600, parity: shared?.parity || 'none', stopBits: shared?.stopBits || 1, slaveId: 1, pollInterval: 2000, timeout: 1500, name: '', area: '', nameplate: '', registerType: 'holding', registerAddress: 0, dataType: 'uint16', byteOrder: 'ABCD', scale: .1, unit: 'mm/s' });
  $('dialog-title').textContent = editing ? `ตั้งค่า ${editing}` : 'เพิ่มมอเตอร์'; resetTest(); presetVisibility(); renderPorts(profile?.path || shared?.path || '');
  editorBaseline = JSON.stringify(configFromForm());
  $('connection-dialog').showModal(); await scanPorts();
}
function closeEditor() {
  if (form.elements.motorId.disabled) return;
  if (JSON.stringify(configFromForm()) === editorBaseline) $('connection-dialog').close();
  else confirmAction('ละทิ้งการแก้ไข?', 'ข้อมูลที่แก้ในหน้าต่างนี้ยังไม่ได้บันทึก', async () => $('connection-dialog').close());
}
function setDialogBusy(value) { form.querySelectorAll('input,select,textarea,button').forEach(element => { element.disabled = value; }); }
async function saveMotor(event) {
  event.preventDefault(); if (!form.reportValidity()) return;
  const raw = configFromForm(), proposed = editing ? profiles.map(profile => profile.motorId === editing ? raw : profile) : [...profiles, raw];
  setDialogBusy(true);
  try {
    const previous = profiles.find(profile => profile.motorId === editing);
    const result = check(await api.saveProfiles(proposed));
    // Never attach old readings to a newly assigned sensor, unit, or motor ID.
    const identityKeys = ['motorId', 'path', 'slaveId', 'sensorModel', 'registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale', 'unit'];
    if (previous && identityKeys.some(key => previous[key] !== raw[key])) { cache.delete(previous.motorId); cache.delete(raw.motorId); }
    profiles = result.profiles; selected = raw.motorId;
    $('connection-dialog').close(); renderProfiles(); renderSelected(); addLog('info', raw.motorId, 'บันทึกการตั้งค่ามอเตอร์'); toast('บันทึกแล้ว กดเริ่มอ่านเพื่อทดสอบและเก็บข้อมูล');
  } catch (error) { $('form-error').textContent = error.message; $('form-error').hidden = false; }
  finally { setDialogBusy(false); }
}
async function testMotor() {
  if (!form.reportValidity()) return;
  const config = configFromForm(); setDialogBusy(true); $('test-result').className = 'test-result'; $('test-result').querySelector('b').textContent = 'กำลังทดสอบ…';
  try {
    const result = check(await api.testConnection(config));
    $('test-result').className = 'test-result success'; $('test-result').querySelector('b').textContent = '✓ เซ็นเซอร์ตอบ Modbus สำเร็จ';
    $('test-result').querySelector('p').textContent = result.channels ? `Velocity X ${digits(result.channels.velocityX)} / Y ${digits(result.channels.velocityY)} / Z ${digits(result.channels.velocityZ)} mm/s\nTemperature ${digits(result.channels.temperature)} °C · ตรวจว่ารุ่นเซ็นเซอร์ตรงกับ preset ก่อนใช้งาน` : `${digits(result.value, 3)} ${result.unit} · Raw: ${result.rawRegisters.join(', ')}`;
    addLog('info', config.motorId, `ทดสอบสำเร็จ ${config.path} / Slave ${config.slaveId}`);
  } catch (error) { $('test-result').className = 'test-result error'; $('test-result').querySelector('b').textContent = 'เซ็นเซอร์ไม่ตอบตามค่าที่ตั้ง'; $('test-result').querySelector('p').textContent = `${error.message}\nตรวจไฟเลี้ยง A/B, Slave ID, Baud rate และโปรแกรมอื่นที่ใช้พอร์ตนี้`; addLog('error', config.motorId, error.message); }
  finally { setDialogBusy(false); }
}
function confirmAction(title, detail, callback) {
  $('confirm-title').textContent = title; $('confirm-message').textContent = detail;
  $('accept-confirm').onclick = () => { $('confirm-dialog').close(); action(callback); };
  $('confirm-dialog').showModal();
}
function deleteMotor(profile) {
  if (!profile || busy) return;
  if (mode !== 'offline') return stopBeforeChange(() => deleteMotor(profiles.find(item => item.motorId === profile.motorId)));
  confirmAction(`ลบ ${profile.motorId}?`, 'ลบเฉพาะการตั้งค่ามอเตอร์ ประวัติที่เก็บไว้ยังเปิดดูได้จากตัวกรองทุกมอเตอร์', async () => {
    profiles = check(await api.saveProfiles(profiles.filter(item => item.motorId !== profile.motorId))).profiles;
    cache.delete(profile.motorId);
    if (selected === profile.motorId) selected = profiles[0]?.motorId || '';
    renderProfiles(); renderSelected(); addLog('info', profile.motorId, 'ลบจากรายชื่อมอเตอร์แล้ว');
  });
}
function isTemporaryMotor(id) { return mode === 'demo' && !beforeDemo?.some(profile => profile.motorId === id); }
function stopBeforeChange(task) {
  confirmAction('หยุดอ่านข้อมูลเพื่อแก้ไข?', 'การแก้ไขทะเบียนมอเตอร์ต้องหยุดอ่านก่อน ข้อมูลที่บันทึกแล้วจะยังอยู่', async () => { await stopAndRestore(); await task(); });
}
function toggleMotor(profile) {
  if (busy || !profile) return;
  if (mode !== 'offline') return stopBeforeChange(() => toggleMotor(profiles.find(item => item.motorId === profile.motorId)));
  action(async () => {
    profiles = check(await api.saveProfiles(profiles.map(item => item.motorId === profile.motorId ? { ...item, enabled: item.enabled === false } : item))).profiles;
    renderProfiles(); renderSelected();
  });
}
async function startLive() {
  if (busy || mode !== 'offline' || !profiles.length) return;
  setBusy(true); message(); addLog('info', '', 'กำลังทดสอบทุกมอเตอร์ก่อนเริ่มอ่าน');
  try {
    const result = check(await api.connect(profiles));
    cache.clear(); successful = 0; failures = 0; frozen = false; mode = 'live';
    if (!result.configs.some(profile => profile.motorId === selected)) selected = result.configs[0].motorId;
    result.readings.forEach(addReading); renderProfiles(); renderSelected(); setTab('fleet'); addLog('info', '', `เริ่มบันทึก ${result.configs.length} มอเตอร์`);
  } catch (error) { message(`${error.message} · ยังไม่ได้เริ่มเก็บข้อมูล ตรวจการตั้งค่าแต่ละมอเตอร์แล้วลองใหม่`); addLog('error', '', error.message); }
  finally { setBusy(false); }
}
async function stop() {
  if (busy) return;
  setBusy(true);
  try {
    if (mode === 'live') check(await api.disconnect());
    clearInterval(demoTimer); mode = 'offline'; frozen = false; controlLabel($('pause-stream'), 'พักกราฟ', 'pause');
    cache.forEach(state => { state.status = 'offline'; }); renderSelected(); addLog('info', '', 'หยุดการอ่านแล้ว');
  } finally { setBusy(false); }
}
function demoFrame(profile, index, phase) {
  const channels = { temperature: 35.2 + index + Math.sin(phase / 5) * .4, velocityX: 2.1 + index * .3 + Math.sin(phase) * .35, velocityY: 3.4 + index * .4 + Math.sin(phase + 1) * .5, velocityZ: 1.5 + index * .2 + Math.sin(phase + 2) * .25, displacementX: 32 + Math.sin(phase) * 3, displacementY: 41 + Math.sin(phase + 1) * 4, displacementZ: 22 + Math.sin(phase + 2) * 2, accelerationX: 1.2 + Math.sin(phase) * .2, accelerationY: 1.6 + Math.sin(phase + 1) * .2, accelerationZ: .9 + Math.sin(phase + 2) * .15 };
  const axes = ['X', 'Y', 'Z']; const primaryAxis = axes.reduce((a, b) => channels[`velocity${a}`] > channels[`velocity${b}`] ? a : b);
  const encoded = value => Math.round(value * 10) & 65535;
  return { motorId: profile.motorId, value: channels[`velocity${primaryAxis}`], channels: profile.sensorModel === MODEL ? channels : null, rawRegisters: profile.sensorModel === MODEL ? { primary: [channels.temperature, channels.velocityX, channels.velocityY, channels.velocityZ, channels.displacementX, channels.displacementY, channels.displacementZ].map(encoded), acceleration: [channels.accelerationX, channels.accelerationY, channels.accelerationZ].map(encoded) } : [encoded(channels.velocityY)], primaryAxis: profile.sensorModel === MODEL ? primaryAxis : null, unit: profile.sensorModel === MODEL ? 'mm/s' : profile.unit, timestamp: new Date().toISOString(), source: 'SIMULATION', port: 'DEMO', slaveId: profile.slaveId, elapsedMs: 18 + index, recorded: false };
}
let beforeDemo = null;
function startDemo() {
  if (mode !== 'offline' || busy) return;
  beforeDemo = profiles;
  if (!profiles.length) profiles = [1, 2, 3].map(index => ({ motorId: `DEMO-0${index}`, name: ['Cooling water pump', 'Conveyor drive', 'Exhaust fan'][index - 1], area: ['Utility', 'Line A', 'Line B'][index - 1], path: 'DEMO', slaveId: index, baudRate: 9600, parity: 'none', stopBits: 1, sensorModel: MODEL, registerType: 'holding', unit: 'mm/s', pollInterval: 1000, timeout: 1500 }));
  cache.clear(); selected = profiles[0].motorId; successful = 0; failures = 0; mode = 'demo'; frozen = false; message();
  let phase = 0;
  profiles.forEach((profile, index) => {
    for (let sample = 0; sample < 40; sample++) {
      const frame = demoFrame(profile, index, sample * .18); frame.timestamp = new Date(Date.now() - (40 - sample) * 1000).toISOString(); addReading(frame);
    }
  });
  demoTimer = setInterval(() => { phase += .18; profiles.forEach((profile, index) => addReading(demoFrame(profile, index, 40 * .18 + phase))); }, 1000);
  renderProfiles(); renderSelected(); setTab('fleet'); addLog('info', '', 'เปิดโหมดจำลอง ข้อมูลไม่ถูกเขียนลงไฟล์ประวัติ');
}
async function stopAndRestore() {
  const wasDemo = mode === 'demo'; await stop();
  if (wasDemo && beforeDemo) { profiles = beforeDemo; beforeDemo = null; selected = profiles[0]?.motorId || ''; cache.clear(); renderProfiles(); renderSelected(); }
}
function historyFilter() { return { date: $('history-date').value, motorId: $('history-motor').value }; }
async function loadHistory() {
  const generation = ++historyGeneration; $('load-history').disabled = true;
  try {
    const result = check(await api.history(historyFilter())); if (generation !== historyGeneration) return;
    const body = $('history-body'); body.replaceChildren();
    $('history-summary').textContent = `${result.total.toLocaleString()} รายการ · แสดงล่าสุด ${result.rows.length} รายการ${result.skipped ? ` · ข้ามบรรทัดเสียหาย ${result.skipped}` : ''}`;
    for (const frame of result.rows.reverse()) {
      const row = node('tr');
      row.append(node('td', time(frame.timestamp), 'mono'), node('td', frame.motorId), ...['velocityX', 'velocityY', 'velocityZ', 'temperature'].map(key => node('td', digits(frame.channels?.[key]), 'mono')), node('td', `${digits(frame.value, 2)} ${frame.unit}`, 'mono'), node('td', `${frame.port} / ${frame.slaveId}`)); body.append(row);
    }
    if (!result.rows.length) emptyRow(body, 8, 'ไม่มีข้อมูลที่บันทึกในวันที่และมอเตอร์ที่เลือก');
  } catch (error) { if (generation === historyGeneration) { $('history-summary').textContent = error.message; toast(error.message); } }
  finally { if (generation === historyGeneration) $('load-history').disabled = false; }
}

document.querySelector('.tabs').setAttribute('role', 'tablist');
document.querySelectorAll('[data-tab]').forEach((button, index, tabs) => {
  button.id = `tab-${button.dataset.tab}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `${button.dataset.tab}-view`); button.tabIndex = index === 0 ? 0 : -1;
  const panel = $(`${button.dataset.tab}-view`); panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id);
  button.onclick = () => setTab(button.dataset.tab);
  button.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next].dataset.tab); tabs[next].focus();
  };
});
$('new-motor').onclick = $('add-motor-table').onclick = () => openEditor();
$('fleet-add').onclick = $('fleet-empty-add').onclick = () => openEditor();
$('fleet-window').onchange = refreshFleet;
$('fleet-filter').onchange = refreshFleet;
$('fleet-reset-filters').onclick = () => { $('motor-search').value = ''; $('fleet-filter').value = 'all'; renderMotorList(); };
$('edit-motor').onclick = () => openEditor(currentProfile());
$('welcome-setup').onclick = () => openEditor(currentProfile());
$('close-connection').onclick = closeEditor;
$('refresh-ports').onclick = scanPorts;
form.onsubmit = saveMotor;
form.oninput = resetTest;
$('sensor-model').onchange = () => { presetVisibility(); resetTest(); };
$('port-select').onchange = () => renderPorts();
$('test-sensor').onclick = testMotor;
$('cancel-confirm').onclick = () => $('confirm-dialog').close();
$('motor-search').oninput = () => { renderMotorList(); refreshFleet(); };
$('connect-all').onclick = () => action(startLive);
$('disconnect').onclick = () => action(stopAndRestore);
$('demo-mode').onclick = startDemo;
$('pause-stream').onclick = () => { frozen = !frozen; controlLabel($('pause-stream'), frozen ? 'แสดงกราฟต่อ' : 'พักกราฟ', frozen ? 'play' : 'pause'); $('pause-stream').setAttribute('aria-pressed', String(frozen)); if (!frozen) renderSelected(); else $('chart-live').textContent = 'PAUSED'; toast(frozen ? 'พักหน้าจอแล้ว การอ่านและบันทึกข้อมูลจริงยังทำงาน' : 'กลับมาแสดงข้อมูลล่าสุด'); };
$('chart-kind').onchange = drawChart;
$('trend-chart').onpointermove = event => { const bounds = event.currentTarget.getBoundingClientRect(); showChartPoint(Math.round(((event.clientX - bounds.left) / bounds.width * 900 - 56) / 822 * (chartFrames.length - 1))); };
$('trend-chart').onpointerleave = () => { $('chart-tooltip').hidden = true; $('crosshair')?.setAttribute('visibility', 'hidden'); };
$('trend-chart').onkeydown = event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); showChartPoint(chartIndex + (event.key === 'ArrowRight' ? 1 : -1)); } };
$('load-history').onclick = loadHistory;
$('export-csv').onclick = () => action(async () => { $('export-csv').disabled = true; try { const result = check(await api.exportData(historyFilter())); if (!result.canceled) toast(`ส่งออก ${result.total} รายการแล้ว`); } finally { $('export-csv').disabled = false; } });
$('open-data').onclick = () => action(async () => check(await api.openDataPath()));
$('export-profiles').onclick = () => action(async () => { const result = check(await api.exportProfiles()); if (!result.canceled) toast('สำรองรายชื่อแล้ว'); });
$('import-profiles').onclick = () => action(async () => { const result = check(await api.importProfiles()); if (!result.canceled) { profiles = result.profiles; selected = profiles[0]?.motorId || ''; cache.clear(); renderProfiles(); renderSelected(); toast('นำเข้ารายชื่อแล้ว'); } });
$('clear-events').onclick = () => { logs = []; $('event-count').textContent = '0'; renderLogs(); };
$('help-button').onclick = () => $('help-dialog').showModal(); $('close-help').onclick = () => $('help-dialog').close();
$('connection-dialog').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
api.onReading(reading => { if (mode === 'live') addReading(reading); });
api.onStatus(status => {
  if (status.state === 'testing') {
    $('status-text').textContent = `กำลังทดสอบ ${status.motorId} / ${status.path}`;
  } else if (status.state === 'read-error') {
    failures++; const state = stateFor(status.motorId);
    if (state.status !== 'fault' || state.message !== status.message) addLog('error', status.motorId, status.message);
    state.status = 'fault'; state.message = status.message; state.errors++; refreshSelectionState();
  } else if (status.state === 'storage-error') { message(`บันทึกข้อมูลไม่สำเร็จ: ${status.message}`); addLog('error', status.motorId, `Storage: ${status.message}`); }
});
setInterval(() => {
  $('status-clock').textContent = new Date().toLocaleString('th-TH', { hour12: false });
  refreshFleet();
  if (mode === 'live') {
    for (const profile of profiles) {
      if (profile.enabled === false) continue;
      const state = stateFor(profile.motorId), last = state.frames.at(-1);
      const busBudget = profiles.filter(item => item.path.toUpperCase() === profile.path.toUpperCase()).reduce((sum, item) => sum + item.timeout * (item.sensorModel === MODEL ? 2 : 1), 0);
      if (last && Date.now() - Date.parse(last.timestamp) > Math.max(profile.pollInterval * 3, busBudget + profile.pollInterval + 2000) && state.status !== 'stale') { state.status = 'stale'; addLog('error', profile.motorId, 'ข้อมูลเก่า เกินช่วงรอของรอบการอ่าน'); }
    }
    refreshSelectionState();
  }
}, 1000);
setupControls();
controlLabel($('pause-stream'), 'พักกราฟ', 'pause');
(async () => {
  $('history-date').value = today(); renderLogs(); renderChannels(); emptyRow($('history-body'), 8, 'เลือกวันที่แล้วโหลดข้อมูล');
  try {
    const initial = check(await api.initialize()); profiles = initial.profiles; selected = profiles[0]?.motorId || '';
    $('app-version').textContent = `v${initial.version}`; $('data-path').textContent = `ข้อมูลในเครื่อง: ${initial.dataPath}`;
    addLog('info', '', 'เปิดโปรแกรมพร้อมใช้งาน');
  } catch (error) { dataError = true; message(error.message); }
  renderProfiles(); renderSelected();
})();
