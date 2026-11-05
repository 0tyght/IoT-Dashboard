'use strict';
const api = window.vectraDesktop;
const $ = id => document.getElementById(id);
const form = $('sensor-form');
const MODEL = 'vemsee-sn3001-wz3a-n01';
let profiles = [], ports = [], selected = '', editing = null, mode = 'offline', busy = false, frozen = false;
let chartFrames = [], historyGeneration = 0;
let successful = 0, failures = 0, logs = [], dataError = false;
let editorBaseline = '';
let currentTab = 'monitor';
let detailPlot;
const historyMotorIds = new Set();
const cache = new Map();
const digits = (value, precision = 1) => Number.isFinite(value) ? value.toFixed(precision) : '—';
const currentProfile = () => profiles.find(profile => profile.motorId === selected);
const portLabel = path => String(path).toUpperCase().startsWith('UNBOUND:') ? 'ยังไม่เชื่อมบัส' : path;
const stateFor = id => { if (!cache.has(id)) cache.set(id, { frames: [], errors: 0, samples: 0, status: 'offline', message: '' }); return cache.get(id); };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const time = value => value ? new Date(value).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false }) : '—';
const timestamp = value => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false }).format(new Date(value)).replace(',', '.') + ' +07:00' : '—';
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
    const row = node('tr'); row.append(node('td', timestamp(entry.timestamp), 'mono'), node('td', entry.kind === 'error' ? 'ผิดพลาด' : 'ข้อมูล', `event-${entry.kind}`), node('td', entry.motorId || 'SYSTEM'), node('td', entry.detail, 'wrap-cell')); body.append(row);
  }
}
function setBusy(value) { busy = value; updateControls(); }
function updateDeviceSettingsControl(locked = busy || recordActionBusy) {
  const meter = selectedPowerMeter(), profile = currentProfile(), button = $('edit-motor');
  const label = 'ตั้งค่าอุปกรณ์';
  if (button.textContent !== label) controlLabel(button, label, 'settings');
  button.hidden = !meter && !profile;
  button.disabled = locked || button.hidden || dataError;
  button.title = meter ? `ตั้งค่า ${meter.name || meter.id}` : profile ? `ตั้งค่า ${profile.name || profile.motorId}` : '';
}
function updateControls() {
  const locked = busy || recordActionBusy, running = mode !== 'offline';
  const readiness=workspaceReadiness();
  $('connect-all').disabled = locked || running || Boolean(readiness.message) || dataError;
  $('connect-all').title = readiness.message || `เริ่มอ่านอุปกรณ์ในพื้นที่งาน ${activeWorkspace()?.name||''}`;
  $('disconnect').disabled = locked || !running;
  for (const id of ['new-motor', 'fleet-empty-add']) $(id).disabled = locked || dataError;
  $('import-profiles').disabled = locked || running || dataError;
  updateDeviceSettingsControl(locked);
  $('new-motor').hidden = !activeWorkspace();
  document.querySelector('.command-group .separator').hidden = !activeWorkspace();
  updateGroupsControls(locked || running);
  $('export-profiles').disabled = locked || !profiles.length;
  document.querySelectorAll('[data-edit], [data-delete]').forEach(button => { button.disabled = locked || dataError; });
  $('mode-indicator').className = `mode-indicator ${mode === 'live' ? 'live' : ''}`;
  $('mode-indicator').textContent = mode === 'live' ? 'กำลังอ่าน' : 'หยุดอ่าน';
  $('connect-all').setAttribute('aria-busy', String(locked));
  $('disconnect').setAttribute('aria-busy', String(locked));
  renderRecording();
}
function setTab(tab) {
  currentTab = tab;
  updateDeviceSettingsControl();
  $('graph-tools').hidden = !((tab === 'monitor' && currentProfile() && !selectedPowerMeter()) || (tab === 'fleet' && fleetViewMode === 'list'));
  if (tab === 'fleet') renderFlow();
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== `${tab}-view`; });
  document.querySelectorAll('[data-tab]').forEach(button => { const active = button.dataset.tab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
  if (innerWidth < 1180) $(`tab-${tab}`)?.scrollIntoView({block:'nearest',inline:'nearest'});
  document.querySelector('main').scrollTop = 0;
  if (tab === 'history') {
    void refreshRecordedDays();
    loadHistory();
  }
  if (tab === 'analysis' && analysisSource === 'history') { void refreshRecordedDays(); void openHistoryAnalysis(); }
  renderSelected();
}
function renderMotorList() { renderDeviceSidebar(); }
function refreshMotorStates() { refreshDeviceIndicators(); }
function selectMotor(id, tab = 'monitor') {
  const previous = selected; selected = id; selectedMeterId = ''; frozen = false;
  refreshPowerDiagnostic();
  if ($('history-motor').value === previous && previous !== id) setHistoryMotor(id);
  controlLabel($('pause-stream'), 'พักกราฟ', 'pause'); renderMotorList(); setTab(tab); updateControls(); void restoreSavedMotorHistory(id);
}
function selectMeter(id, tab = 'monitor') {
  if (!activeWorkspace()?.meters.some(meter=>meter.id===id)) return;
  selectedMeterId=id;
  refreshPowerDiagnostic();
  closeWorkbenchPopovers();
  renderMotorList();
  setTab(tab);
}
async function restoreSavedMotorHistory(motorId) {
  const state = stateFor(motorId);
  if (mode !== 'offline' || state.frames.length || !profiles.some(profile => profile.motorId === motorId)) return;
  const profile = profiles.find(item => item.motorId === motorId);
  if (Array.isArray(profile.points)) return; // Multi-point data is kept in its own history, not the legacy scalar series.
  const token = (state.restoreToken || 0) + 1; state.restoreToken = token; state.restoring = true; state.restoreError = '';
  if (selected === motorId) renderSelected();
  const end = Date.now(), loadHours = async hours => check(await api.chartRange({ motorId, profile, from: new Date(end - hours * 3600000).toISOString(), to: new Date(end).toISOString() }));
  try {
    let result = await loadHours(24);
    if (!result.rows.length) result = await loadHours(24 * 30);
    if (state.restoreToken !== token || cache.get(motorId) !== state || mode !== 'offline' || state.frames.length) return;
    state.frames = result.rows; state.samples = result.total;
    state.restored = result.rows.length > 0; state.reduced = Boolean(result.reduced); state.gapStarts = result.gapStarts || [];
    state.actualIntervalMs = result.rows.at(-1)?.actualIntervalMs ?? null;
    if (state.restored) historyMotorIds.add(motorId);
    renderMotorList(); if (selected === motorId) renderSelected();
  } catch (error) {
    if (state.restoreToken === token) state.restoreError = error.message;
  } finally {
    if (state.restoreToken === token) { state.restoring = false; if (selected === motorId) renderSelected(); }
  }
}
function setHistoryMotor(id) {
  const select = $('history-motor'), previous = select.value;
  select.value = [...select.options].some(option => option.value === id) ? id : '';
  if (previous !== select.value) { historyGeneration++;resetHistoryRun(); invalidateHistoryRange();emptyRow($('history-body'),20,'เซ็นเซอร์เปลี่ยนแล้ว · โหลดข้อมูลตามตัวกรอง'); }
  syncAnalysisHistoryControls();
}
function renderHistoryMotors() {
  const select = $('history-motor'), previous = select.value, configured = new Set(profiles.map(profile => profile.motorId));
  select.replaceChildren(new Option('ทุกเซ็นเซอร์ · ตารางข้อมูล', ''));
  profiles.forEach(profile => select.add(new Option(profile.motorId, profile.motorId)));
  [...historyMotorIds].filter(id => !configured.has(id)).sort().forEach(id => select.add(new Option(`${id} · ประวัติ`, id)));
  select.value = [...select.options].some(option => option.value === previous) ? previous : '';
  if (previous !== select.value) { resetHistoryRun(); invalidateHistoryRange(); }
  syncAnalysisHistoryControls();
}
function renderProfiles() {
  renderDeviceRegistry();
  renderHistoryMotors();
  renderMotorList(); buildFleet(); renderFlow(); if(currentTab==='monitor')$('graph-tools').hidden=!currentProfile()||Boolean(selectedPowerMeter()); updateControls();
}
function renderSelected() {
  updateWorkbenchLayout();
  const meter=selectedPowerMeter();
  const profile = meter ? undefined : currentProfile(), state = profile ? stateFor(profile.motorId) : null, last = state?.frames.at(-1);
  const group = activeWorkspace();
  const threeAxis = profile?.sensorModel === MODEL;
  document.querySelector('.temperature-metric').hidden=!threeAxis;
  document.querySelector('.trend-panel .panel-heading h2').textContent=profile?.sensorModel==='custom'?'แนวโน้มจุดวัด':'แนวโน้มการสั่นสะเทือน';
  $('metric-type').textContent = threeAxis ? 'VELOCITY' : 'VALUE';
  [...$('chart-legend').children].slice(0, 3).forEach(element => { element.hidden = !threeAxis; });
  $('pause-stream').setAttribute('aria-pressed', String(frozen));
  $('chart-description').textContent = frozen ? 'พักเฉพาะกราฟ · ค่าล่าสุดและการบันทึกยังอัปเดตตามปกติ' : state?.restored && mode === 'offline' ? `ข้อมูลย้อนหลังที่บันทึกล่าสุด · ไม่ใช่ข้อมูลสด · ${$('fleet-window').selectedOptions[0].textContent}` : `${$('fleet-window').selectedOptions[0].textContent} · เวลาคอมพิวเตอร์รับข้อมูล (UTC+07:00)`;
  const limit = Math.min(20000, Math.floor(200000 / Math.max(1, profiles.length)));
  $('graph-buffer-note').textContent = currentTab === 'monitor' && state?.restored ? `ข้อมูลจากไฟล์ประวัติ · ${state.samples.toLocaleString()} ค่าที่บันทึก${state.reduced ? ' · ลดจุดเพื่อแสดงผล' : ''}` : `หน่วยความจำ ${limit.toLocaleString()} ค่าต่อเซ็นเซอร์ · ช่วงเก่ากว่าโหลดจากประวัติ${state?.dropped ? ' · ตัดค่าเก่าจากหน้าจอแล้ว' : ''}`;
  $('selected-title').textContent = meter ? meter.name||meter.id : profile ? profile.name || profile.motorId : 'ค่าที่อ่าน';
  $('selected-area').textContent = group?.name || '';
  $('selected-subtitle').textContent = meter ? `Schneider Electric ${PowerRegisters.label(meter.model)} · ${portLabel(meter.path)} · ID ${meter.slaveId}` : profile ? `${profile.motorId} · ${profile.sensorModel === MODEL ? 'VemSee SN-3001-WZ3A-N01' : 'อุปกรณ์ Modbus กำหนดเอง'} · ${portLabel(profile.path)} · ID ${profile.slaveId}` : '';
  $('power-view').hidden=!meter;
  if (meter && currentTab==='monitor') renderSelectedPower();
  $('reading-device').hidden=!['monitor','registers'].includes(currentTab)||$('reading-device').options.length<2;
  $('welcome').hidden = Boolean(meter || last) || mode !== 'offline';
  $('welcome').setAttribute('aria-busy', String(Boolean(state?.restoring)));
  $('monitor-content').hidden = Boolean(meter) || (!last && mode === 'offline');
  $('empty-state-title').textContent = state?.restoring ? 'กำลังค้นหาข้อมูลที่บันทึกไว้' : !group ? 'ยังไม่ได้เลือกพื้นที่งาน' : profile ? 'ยังไม่มีข้อมูลการวัด' : 'พื้นที่งานนี้ยังไม่มีอุปกรณ์';
  $('empty-state-description').textContent = state?.restoring ? 'กำลังโหลดข้อมูลล่าสุดจากไฟล์ในเครื่อง' : state?.restoreError ? `เปิดประวัติไม่ได้: ${state.restoreError} · ยังเริ่มอ่านข้อมูลใหม่ได้` : !group ? 'เลือกพื้นที่งานจากแถบด้านบน' : profile ? workspaceReadiness().message || 'กดเริ่มอ่านเพื่อรับค่าจากอุปกรณ์' : 'เพิ่มอุปกรณ์จากแผนผังการเชื่อมต่อ';
  controlLabel($('welcome-setup'), profile ? 'ตั้งค่าอุปกรณ์' : group ? 'เปิดแผนผัง' : 'เลือกพื้นที่งาน', profile ? 'settings' : 'plus');
  if (profile) {
    $('connection-name').textContent = portLabel(profile.path);
    $('connection-detail').textContent = `${profile.baudRate} baud · Slave ${profile.slaveId} · ${profile.parity.toUpperCase()}`;
    $('nameplate-display').textContent = profile.nameplate || 'ยังไม่มีข้อมูลฉลากเครื่อง · เพิ่มได้ในหน้าตั้งค่ามอเตอร์';
  }
  {
    $('reading-value').textContent = digits(last?.value, 2);
    $('reading-unit').textContent = last?.unit || profile?.unit || 'mm/s';
    $('primary-axis').textContent = last?.primaryAxis ? `MAX · AXIS ${last.primaryAxis}` : 'CUSTOM';
    $('temperature').textContent = digits(last?.channels?.temperature);
    $('temperature').title = MeasurementConversion.text(MeasurementConversion.describe(last, 'temperature')[0]);
    $('reading-time').textContent = last ? `รับล่าสุด ${timestamp(last.timestamp)}` : 'รอการตอบกลับ';
    $('sample-count').textContent = state?.samples || 0;
    $('last-response').textContent = last ? `${state.restored ? 'รอบบันทึก' : 'ตั้ง'} ${last.pollIntervalMs ?? (state.restored ? '—' : profile.pollInterval)} ms · รับจริง ${last.actualIntervalMs ?? state.actualIntervalMs ?? '—'} ms · ตอบ ${last.elapsedMs ?? '—'} ms` : 'รอการตอบกลับ';
    $('record-state').textContent = storageLabel(last, state?.restored);
    renderChannels(last);
    if(meter) renderPowerRegisters(meter); else renderRegisters(last, profile);
    renderCustomPointReadings(last,profile);
    $('frequency-note').hidden = !threeAxis; $('frequency-note').textContent = frequencySummary(last);
    $('frequency-note').dataset.state = last?.frequencyStatus || 'pending';
    updateWorkbenchValues(last, threeAxis);
    if (!frozen) { chartFrames = graphWindow(state?.frames || [], $('trend-chart').clientWidth); if (currentTab === 'monitor' && !meter) drawChart(); }
  }
  refreshSelectionState();
  if (currentTab === 'fleet') {
    $('selected-title').textContent = group?.name || 'การเชื่อมต่อ';
    $('selected-area').textContent = '';
    $('selected-subtitle').textContent = '';
  }
  const pageTitles={history:'ประวัติข้อมูล',analysis:'วิเคราะห์ข้อมูล',motors:'ทะเบียนอุปกรณ์',events:'บันทึกเหตุการณ์'};
  if (pageTitles[currentTab]) {
    $('selected-title').textContent=pageTitles[currentTab];
    $('selected-area').textContent='';
    $('selected-subtitle').textContent='';
  }
  if (currentTab === 'model') {
    $('selected-title').textContent = 'โมเดลชุดเครื่อง 3D'; $('selected-area').textContent = '';
    $('selected-subtitle').textContent = 'โมเดล V4 อ้างอิง · ยังไม่ผูกกับมอเตอร์และจุดวัดจริง';
  }
  $('selection-state').hidden = !['monitor','registers'].includes(currentTab);
  ensureAssetView();
}
function refreshSelectionState() {
  const meter=selectedPowerMeter(),profile=currentProfile();
  const signal=(meter||profile)?deviceSignal(meter?'meter':'sensor',meter||profile):{state:'offline',label:'หยุดอ่าน'};
  $('selection-state').textContent=signal.label;$('selection-state').className=`selection-state ${signal.state}`;$('selection-state').title=signal.detail||'';
  const signals=workspaceReadiness().devices.map(item=>deviceSignal(item.id?'meter':'sensor',item));
  const overall=signals.some(item=>item.state==='fault')?'fault':signals.some(item=>item.state==='waiting')?'waiting':signals.some(item=>item.state==='online')?'online':'offline';
  $('status-text').replaceChildren(node('i',null,`dot ${overall}`),document.createTextNode(mode==='live'?`กำลังอ่าน ${signals.length} อุปกรณ์`:connectingDevices?'กำลังตรวจการตอบกลับ':'หยุดการอ่าน · พร้อมตั้งค่า'));
  $('status-count').textContent = `รับสำเร็จ ${successful} · ผิดพลาด ${failures}`;
  const device=meter||profile;
  $('status-bus').textContent = device ? `${portLabel(device.path)} · ${device.baudRate} / 8${device.parity[0].toUpperCase()}${device.stopBits} · FC${device.registerType === 'input' ? '04' : '03'}` : 'Modbus RTU · 8 data bits';
  refreshMotorStates();
  refreshFleet();
}
function renderChannels(last) {
  const body = $('channel-body'); body.replaceChildren();
  for (const [label, key, unit] of [['Velocity', 'velocity', 'mm/s'], ['Displacement', 'displacement', 'µm'], ['Acceleration', 'acceleration', 'm/s²'], ['Frequency', 'frequency', 'Hz']]) {
    const row = node('tr'), title = node('td', label); title.append(node('small', unit)); row.append(title);
    const conversions = MeasurementConversion.describe(last, key);
    for (const axis of ['X', 'Y', 'Z']) {
      const missingFrequency = key === 'frequency' && !Number.isFinite(last?.channels?.[`frequency${axis}`]);
      const cell = node('td', key === 'frequency' ? frequencyDisplay(last, axis) : digits(last?.channels?.[`${key}${axis}`]), `axis-${axis.toLowerCase()}`);
      cell.title = MeasurementConversion.text(conversions[['X', 'Y', 'Z'].indexOf(axis)]);
      if (key === 'frequency') cell.title += `\n${frequencySummary(last)}`;
      cell.classList.toggle('frequency-unavailable', missingFrequency); row.append(cell);
    }
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
    ['X', 'Y', 'Z'].forEach((axis, index) => {
      const address = 0x21 + index * 2, raw = last.rawRegisters?.frequency?.slice(index * 2, index * 2 + 2), row = node('tr');
      row.append(node('td', `${hex(address)} / ${hex(address + 1)}`, 'mono'), node('td', `${40001 + address} / ${40002 + address}`, 'mono'), node('td', `Frequency ${axis} · Float32 ${last.frequencyByteOrder || 'ยังไม่ยืนยัน'}`), node('td', raw?.join(' / ') || '—', 'mono'), node('td', raw?.map(hex).join(' / ') || '—', 'mono'), node('td', digits(last.channels?.[`frequency${axis}`], 2), 'numeric'), node('td', 'Hz')); body.append(row);
    });
  } else if(Array.isArray(last.points)) {
    for(const point of last.points){const raw=point.raw||[], row=node('tr');row.append(node('td',hex(point.registerAddress),'mono'),node('td',point.registerAddress+40001,'mono'),node('td',`${point.name} · ${point.status}`),node('td',raw.join(' / ')||'—','mono'),node('td',raw.map(hex).join(' / ')||'—','mono'),node('td',Number.isFinite(point.value)?String(point.value):'—','numeric'),node('td',point.unit||'—'));body.append(row);}
  } else {
    (last.rawRegisters || []).forEach((raw, index) => {
      const address = (profile?.registerAddress || 0) + index, row = node('tr');
      row.append(node('td', hex(address), 'mono'), node('td', address + 40001, 'mono'), node('td', `Custom word ${index + 1}`), node('td', raw, 'mono'), node('td', hex(raw), 'mono'), node('td', index === 0 ? digits(last.value, 3) : '↳ รวมกับ word ก่อนหน้า', 'numeric'), node('td', last.unit)); body.append(row);
    });
  }
}
function svgNode(tag, attributes = {}, text) { const element = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value)); if (text != null) element.textContent = text; return element; }
function drawChart() {
  if (!detailPlot) return;
  const state = stateFor(selected);
  const profile=currentProfile(),point=profile?.points?.find(item=>item.id===selectedCustomPoint);
  const frames=point?chartFrames.map(frame=>({...frame,value:frame.points?.find(item=>item.id===point.id)?.value??null,unit:point.unit})):chartFrames;
  detailPlot.draw(frames, point?{...profile,unit:point.unit}:profile, { reduced: Boolean(state.reduced), gapStarts: state.gapStarts || [] });
  if(point){const chart=detailPlot.plots.find(item=>item.kind==='velocity');if(chart){chart.title.textContent=`${point.name} · ${point.unit||'ไม่มีหน่วย'}`;chart.svg.setAttribute('aria-label',`กราฟ ${point.name} ${point.unit||''}`);}}
  const restored = stateFor(selected).restored && mode === 'offline';
  $('chart-live').textContent = frozen ? 'PAUSED' : restored ? 'SAVED' : mode === 'live' ? 'LIVE' : 'STOPPED';
  $('chart-live').dataset.state = frozen ? 'paused' : restored ? 'saved' : mode;
}
function addReading(reading) {
  if (!Number.isFinite(reading.value) && !Array.isArray(reading.points)) return;
  if (mode === 'live' && reading.runId && recordingState.runId && reading.runId !== recordingState.runId) return;
  const state = stateFor(reading.motorId);
  if (reading.runId && state.frames.length && state.frames.at(-1)?.runId !== reading.runId) {
    state.frames = []; state.samples = 0; state.reduced = false; state.gapStarts = []; state.dropped = false;
    if (reading.motorId === selected && detailPlot) { detailPlot.cursorStamp = null; detailPlot.source = null; closeWorkbenchPopovers(); }
  }
  if (state.frames.some(frame => frame.timestamp === reading.timestamp)) return;
  const previous = state.frames.at(-1);
  state.actualIntervalMs = previous ? Date.parse(reading.timestamp) - Date.parse(previous.timestamp) : null;
  state.frames.push(reading);
  if (previous && reading.timestamp < previous.timestamp) state.frames.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const limit = Math.min(20000, Math.floor(200000 / Math.max(1, profiles.length)));
  if (state.frames.length > limit) { state.frames.splice(0, state.frames.length - limit); state.dropped = true; }
  state.samples++; successful++;
  state.restored = false;
  if (state.status === 'fault' || state.status === 'stale') addLog('info', reading.motorId, 'กลับมารับข้อมูลได้แล้ว');
  const hasGoodPoint = !Array.isArray(reading.points) || reading.points.some(point=>point.status==='ok');
  const failedPoint=reading.points?.find(point=>point.status==='read-error');
  state.status = !hasGoodPoint?'fault':failedPoint?'partial':'online'; state.message = !hasGoodPoint?'ไม่มีจุดวัดที่ตอบกลับ':failedPoint?`${failedPoint.name}: ${failedPoint.message}`:'';
  if (reading.motorId === selected && currentTab !== 'fleet' && !selectedPowerMeter()) renderSelected();
  else refreshSelectionState();
}
function configFromForm() {
  const raw = Object.fromEntries(new FormData(form));
  raw.sensorModel=deviceModel();
  if (raw.path === '__UNBOUND__') raw.path = `UNBOUND:DEVICE:${raw.motorId.trim()}`;
  const sharedBus=savedFlowBuses.find(bus=>bus.path.toUpperCase()===String(raw.path).toUpperCase());if(sharedBus)Object.assign(raw,{baudRate:sharedBus.baudRate,parity:sharedBus.parity,stopBits:sharedBus.stopBits});
  raw.enabled = editing ? profiles.find(profile => profile.motorId === editing)?.enabled !== false : true;
  for (const key of ['baudRate', 'stopBits', 'slaveId', 'registerAddress', 'scale', 'pollInterval', 'timeout']) raw[key] = Number(raw[key]);
  if ((raw.sensorModel === 'custom'||DeviceTemplates.isPower(raw.sensorModel)) && $('points-enabled').checked) raw.points=pointRows();
  if (raw.sensorModel === MODEL) Object.assign(raw, { dataType: 'int16', registerAddress: 0, scale: .1, unit: 'mm/s', byteOrder: 'ABCD' });
  return raw;
}
function fillForm(config) { for (const [key, value] of Object.entries(config)) { const field = form.elements.namedItem(key); if (field) field.value = String(value ?? ''); } }
function presetVisibility() {
  const vemsee=deviceModel()===MODEL;
  $('preset-note').hidden=!vemsee;document.querySelector('.wiring-note').style.display=vemsee?'':'none';$('vemsee-frequency-note').hidden=!vemsee;
  form.elements.slaveId.max=vemsee?'254':'247';updatePointEditor();renderDeviceRegisterMap();
}
function renderPorts(selectedPath = form.elements.path.value) {
  const select = $('port-select'), list = $('port-list'); select.replaceChildren(new Option('เลือกพอร์ต', ''), new Option('ยังไม่เชื่อมบัส', '__UNBOUND__')); list.replaceChildren();
  if (String(selectedPath).toUpperCase().startsWith('UNBOUND:')) selectedPath='__UNBOUND__';
  ports.sort((a, b) => Number(Boolean(b.vendorId)) - Number(Boolean(a.vendorId)) || a.path.localeCompare(b.path, undefined, { numeric: true })).forEach(port => {
    select.add(new Option(`${port.path} · ${port.manufacturer || 'Serial'}`, port.path));
    const button = node('button', null, `port-button${port.path === selectedPath ? ' selected' : ''}`); button.type = 'button';
    const text = node('span'); text.append(node('strong', port.path), node('small', `${port.manufacturer || 'Serial adapter'}${port.vendorId ? ` · VID ${port.vendorId}` : ''}`));
    button.append(node('span', port.vendorId ? 'USB' : 'COM', 'port-icon'), text); button.onclick = () => { renderPorts(port.path); resetTest(); }; list.append(button);
  });
  for(const bus of savedFlowBuses)if(![...select.options].some(option=>option.value===bus.path))select.add(new Option(`${bus.path} · บัสที่ตั้งค่าไว้ · ยังไม่พบพอร์ต`,bus.path));
  if (selectedPath && selectedPath !== '__UNBOUND__' && ![...select.options].some(option=>option.value===selectedPath)) select.add(new Option(`${selectedPath} · ยังไม่พบพอร์ต`, selectedPath));
  select.value = selectedPath;
  const bus=savedFlowBuses.find(item=>item.path.toUpperCase()===String(selectedPath).toUpperCase());
  for(const key of ['baudRate','parity','stopBits']){const input=form.elements.namedItem(key);input.closest('label').hidden=Boolean(bus);if(bus)input.value=String(bus[key]);}
  let note=$('shared-bus-note');if(!note){note=node('p',null,'footnote');note.id='shared-bus-note';select.closest('fieldset').append(note);}note.hidden=!bus;note.textContent=bus?`ใช้ค่าบัส ${bus.path}: ${bus.baudRate} baud · ${bus.parity} · ${bus.stopBits} stop bit · แก้ได้ที่โหนดบัส`:'';
  $('port-summary').textContent = `พบ ${ports.length} พอร์ต`;
  if (!ports.length) list.append(node('p', 'ยังไม่พบพอร์ต ตรวจ USB และไดรเวอร์แล้วกดสแกน', 'empty-ports'));
}
async function scanPorts() { $('refresh-ports').disabled = true; try { ports = check(await api.listPorts()).ports; renderPorts(); } catch (error) { $('port-summary').textContent = error.message; } finally { $('refresh-ports').disabled = false; } }
function resetTest() { $('test-result').className = 'test-result'; $('test-result').querySelector('b').textContent = 'ทดสอบการตั้งค่านี้ก่อนเริ่มอ่าน'; $('test-result').querySelector('p').textContent = 'ค่า Baud / Parity / Stop bits และ Slave ID ต้องตรงกับอุปกรณ์'; }
async function openEditor(profile, preferredPath = null, context = {}) {
  if (profile) flowAddingSensorGroup='';
  if (busy) return;
  if (mode !== 'offline') return stopBeforeChange(() => openEditor(profile,preferredPath,context));
  if (dataError) return toast('ตรวจข้อผิดพลาดไฟล์รายชื่อก่อนบันทึก');
  editing = context.isNew ? null : profile?.motorId || null; form.reset(); $('form-error').hidden = true;
  let next = 1; const usedIds=new Set([...profiles.map(item=>item.motorId.toUpperCase()),...measurementGroups.flatMap(group=>group.meters.map(item=>item.id.toUpperCase()))]); while(usedIds.has(`DEV-${String(next).padStart(2,'0')}`))next++;
  const shared = workspaceProfiles().find(item=>!String(item.path).toUpperCase().startsWith('UNBOUND:'));
  fillForm(profile || { motorId: `DEV-${String(next).padStart(2, '0')}`, sensorModel: MODEL, path: shared?.path || '', baudRate: shared?.baudRate || 9600, parity: shared?.parity || 'none', stopBits: shared?.stopBits || 1, slaveId: 1, pollInterval: 2000, timeout: 1500, name: '', area: '', nameplate: '', registerType: 'holding', registerAddress: 0, dataType: 'uint16', byteOrder: 'ABCD', scale: .1, unit: 'mm/s' });
  prepareDeviceEditor(profile,context);
  if(profile)loadPointRows(profile);
  $('dialog-title').textContent = editing ? `ตั้งค่า ${editing}` : 'เพิ่มอุปกรณ์'; resetTest(); presetVisibility(); renderPorts(preferredPath ?? (profile?.path || shared?.path || ''));
  editorBaseline = JSON.stringify(configFromForm());
  $('connection-dialog').showModal(); await scanPorts();
}
function closeEditor(afterClose) {
  if (form.elements.motorId.disabled) return;
  const finish = () => {
    $('connection-dialog').close();
    afterClose?.();
  };
  if (JSON.stringify(configFromForm()) === editorBaseline) finish();
  else confirmAction('ละทิ้งการแก้ไข?', 'ข้อมูลที่แก้ในหน้าต่างนี้ยังไม่ได้บันทึก', finish);
}
function setDialogBusy(value) { form.querySelectorAll('input,select,textarea,button').forEach(element => { element.disabled = value; });if(!value)updatePointEditor(); }
async function saveMotor(event) {
  event.preventDefault(); if (!form.reportValidity()) return;
  if(DeviceTemplates.isPower(deviceModel()))return saveDeviceMeter();
  const raw = configFromForm(), proposed = editing ? profiles.map(profile => profile.motorId === editing ? raw : profile) : [...profiles, raw];
  const duplicate = profiles.find(profile => profile.motorId.toUpperCase() === raw.motorId.toUpperCase() && profile.motorId !== editing);
  if(activeWorkspace()?.meters.some(item=>item.id.toUpperCase()===raw.motorId.toUpperCase())){$('form-error').textContent=`รหัสอุปกรณ์ ${raw.motorId} ซ้ำในพื้นที่งาน`;$('form-error').hidden=false;return;}
  if (duplicate) {
    const workspaces = measurementGroups.filter(group => group.motorIds.some(id => id.toUpperCase() === duplicate.motorId.toUpperCase()));
    $('form-error').textContent = `รหัส ${raw.motorId} มีอยู่ในรายการอุปกรณ์แล้ว${workspaces.length ? ` ในพื้นที่งาน ${workspaces.map(group => group.name).join(', ')}` : ' แต่ยังไม่ถูกเพิ่มในพื้นที่งานนี้'} · ใช้ปุ่มเพิ่มอุปกรณ์ในหน้าแผนผังเพื่อเลือกรายการเดิม หรือเปลี่ยนรหัสอุปกรณ์ใหม่`;
    $('form-error').hidden = false;
    $('form-error').scrollIntoView({block:'nearest',behavior:'instant'});
    return;
  }
  setDialogBusy(true);
  try {
    const previous = profiles.find(profile => profile.motorId === editing);
    const result = check(await api.saveProfiles(proposed));
    // Never attach old readings to a newly assigned sensor, unit, or motor ID.
    const identityKeys = ['motorId', 'path', 'slaveId', 'sensorModel', 'registerType', 'registerAddress', 'dataType', 'byteOrder', 'frequencyByteOrder', 'scale', 'unit'];
    if (previous && (identityKeys.some(key => previous[key] !== raw[key]) || JSON.stringify(previous.points||null)!==JSON.stringify(raw.points||null))) { cache.delete(previous.motorId); cache.delete(raw.motorId); }
    profiles = result.profiles;
    let groupWarning='';
    if (!editing && flowAddingSensorGroup) {
      const group=measurementGroups.find(item=>item.id===flowAddingSensorGroup);
      if(group && !group.motorIds.includes(raw.motorId)) {
        try { measurementGroups=check(await api.saveGroups(measurementGroups.map(item=>item.id===group.id?{...item,motorIds:[...item.motorIds,raw.motorId]}:item))).groups;renderGroupOptions(); }
        catch(error) { groupWarning=`บันทึกเซ็นเซอร์แล้ว แต่เพิ่มเข้าในชุดไม่สำเร็จ: ${error.message}`; }
      }
    }
    selected = workspaceProfiles().find(profile=>profile.motorId===raw.motorId)?.motorId || workspaceProfiles()[0]?.motorId || '';
    flowAddingSensorGroup='';selectedMeterId='';
    $('connection-dialog').close(); renderProfiles(); if (!$('history-motor').value || $('history-motor').value === previous?.motorId) setHistoryMotor(selected); renderSelected(); if(selected)void restoreSavedMotorHistory(selected); addLog('info', raw.motorId, 'บันทึกการตั้งค่าเซ็นเซอร์'); toast(groupWarning || 'บันทึกแล้ว กดเริ่มอ่านเพื่อทดสอบและเก็บข้อมูล');
  } catch (error) { $('form-error').textContent = error.message; $('form-error').hidden = false; $('form-error').scrollIntoView({block:'nearest',behavior:'instant'}); }
  finally { setDialogBusy(false); }
}
async function testMotor() {
  if(DeviceTemplates.isPower(deviceModel()))return testDeviceMeter();
  if (!form.reportValidity()) return;
  const config = configFromForm(); setDialogBusy(true); $('test-result').className = 'test-result'; $('test-result').querySelector('b').textContent = 'กำลังทดสอบ…';
  try {
    const result = check(await api.testConnection(config));
    const pointResults=Array.isArray(result.points)?result.points:null, anyPointOk=pointResults?.some(point=>point.status==='ok');
    $('test-result').className = `test-result ${pointResults&&!anyPointOk?'error':'success'}`; $('test-result').querySelector('b').textContent = pointResults&&!anyPointOk?'ไม่มีจุดวัดตอบกลับ':pointResults?.some(point=>point.status==='read-error')?'บางจุดวัดอ่านไม่สำเร็จ · ดูรายละเอียด':'✓ อุปกรณ์ตอบ Modbus สำเร็จ';
    $('test-result').querySelector('p').textContent = result.points ? result.points.map(point=>`${point.name}: ${point.status==='ok'?`${point.value} ${point.unit} · Raw ${point.raw.join(' / ')}`:point.status==='disabled'?'พักอ่าน':point.message}`).join('\n') : result.channels ? [
      ...[['Velocity', 'velocity', 'mm/s'], ['Displacement', 'displacement', 'µm'], ['Acceleration', 'acceleration', 'm/s²']].map(([label, key, unit]) => `${label} X ${digits(result.channels[`${key}X`])} / Y ${digits(result.channels[`${key}Y`])} / Z ${digits(result.channels[`${key}Z`])} ${unit}`),
      `Temperature ${digits(result.channels.temperature)} °C`,
      `Frequency X ${frequencyDisplay(result, 'X')} / Y ${frequencyDisplay(result, 'Y')} / Z ${frequencyDisplay(result, 'Z')} Hz`,
      frequencySummary(result),
      result.rawRegisters?.frequency?.length === 6 ? `Raw Hz 0021H–0026H: ${result.rawRegisters.frequency.join(', ')}` : 'ยังไม่มีค่าดิบความถี่ตอบกลับ',
      'ตรวจว่ารุ่นเซ็นเซอร์ตรงกับ preset ก่อนใช้งาน'
    ].join('\n') : `${digits(result.value, 3)} ${result.unit} · Raw: ${result.rawRegisters.join(', ')}`;
    addLog('info', config.motorId, `ทดสอบสำเร็จ ${config.path} / Slave ${config.slaveId}`);
  } catch (error) { $('test-result').className = 'test-result error'; $('test-result').querySelector('b').textContent = 'เซ็นเซอร์ไม่ตอบตามค่าที่ตั้ง'; $('test-result').querySelector('p').textContent = `${error.message}\nตรวจไฟเลี้ยง A/B, Slave ID, Baud rate และโปรแกรมอื่นที่ใช้พอร์ตนี้`; addLog('error', config.motorId, error.message); }
  finally { setDialogBusy(false); $('test-result').scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
}
function confirmAction(title, detail, callback) {
  $('confirm-title').textContent = title; $('confirm-message').textContent = detail;
  $('accept-confirm').onclick = () => { $('confirm-dialog').close(); action(callback); };
  $('confirm-dialog').showModal();
}
function deleteMotor(profile) {
  if (!profile || busy) return;
  if (mode !== 'offline') return stopBeforeChange(() => deleteMotor(profiles.find(item => item.motorId === profile.motorId)));
  const refs=measurementGroups.filter(group=>group.motorIds.some(id=>id.toUpperCase()===profile.motorId.toUpperCase()));if(refs.length){toast(`ยังลบไม่ได้: ${profile.motorId} อยู่ในพื้นที่งาน ${refs.map(group=>group.name).join(', ')} · นำอุปกรณ์ออกจากพื้นที่งานก่อน`);return;}
  confirmAction(`ลบ ${profile.motorId}?`, 'ลบการตั้งค่าอุปกรณ์ออกจากทะเบียน ข้อมูลที่บันทึกยังเปิดได้จากประวัติ', async () => {
    profiles = check(await api.saveProfiles(profiles.filter(item => item.motorId !== profile.motorId))).profiles;
    cache.delete(profile.motorId);
    if (selected === profile.motorId) selected = workspaceProfiles()[0]?.motorId || '';
    renderProfiles(); renderSelected(); if (selected) void restoreSavedMotorHistory(selected); addLog('info', profile.motorId, 'ลบจากรายชื่อมอเตอร์แล้ว');
  });
}
function stopBeforeChange(task) {
  confirmAction('หยุดอ่านข้อมูลเพื่อแก้ไข?', 'หยุดรอบปัจจุบันเพื่อแก้การตั้งค่า ข้อมูลที่บันทึกแล้วจะยังอยู่', async () => { await stop(); await task(); });
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
  if (busy || mode !== 'offline' || dataError) return;
  const readiness=workspaceReadiness();
  if(readiness.message) return message(readiness.message);
  if (recordingState.settings.startMode === 'scheduled' && Date.parse(recordingState.settings.startAt) <= Date.now()) {
    $('record-settings').click(); $('record-form-error').textContent = 'เวลาบันทึกผ่านแล้ว เลือกเวลาใหม่หรือเปลี่ยนเป็นอ่านและบันทึกอัตโนมัติ'; $('record-form-error').hidden = false; return;
  }
  deviceTraffic.clear();connectingDevices=true;setBusy(true);refreshMotorStates();message(); addLog('info', '', 'กำลังตรวจการตอบกลับของอุปกรณ์ในพื้นที่งาน');
  try {
    clearPowerReadings(); const result = check(await api.connect(workspaceProfiles(),selectedGroupId()));
    cache.clear(); successful = 0; failures = 0; frozen = false; mode = 'live';
    for(const failure of result.initialFailures||[]){const state=stateFor(failure.motorId);state.status='fault';state.message=failure.message;state.errors++;failures++;addLog('error',failure.motorId,`อ่านครั้งแรกไม่สำเร็จ: ${failure.message}`);}
    if (result.configs.length && !result.configs.some(profile => profile.motorId === selected)) selected = result.configs[0].motorId;
    if (!result.configs.length && !selectedPowerMeter()) {
      selectedMeterId=activeWorkspace()?.meters[0]?.id||'';
      refreshPowerDiagnostic();
    }
    if (result.recording) renderRecording(result.recording);
    if (result.recording?.scheduleMissed) message('เวลาบันทึกผ่านไประหว่างตรวจเซ็นเซอร์ · กำลังอ่านโดยไม่บันทึก เลือก เพิ่มเติม → เริ่มบันทึกทันที');
    result.readings.forEach(addReading); (result.powerReadings || []).forEach(renderPowerReading); renderProfiles(); renderSelected(); setTab('monitor'); addLog('info', '', `เริ่มอ่าน ${result.configs.length+(result.powerReadings?.length||0)} อุปกรณ์ · ${recordingState.active ? 'บันทึกอัตโนมัติ' : recordingState.waiting ? 'รอเวลาบันทึก' : 'ดูอย่างเดียว'}`);
  } catch (error) { message(`${error.message} · ตรวจการตั้งค่าอุปกรณ์แล้วลองใหม่`); addLog('error', '', error.message); }
  finally { connectingDevices=false;setBusy(false);refreshSelectionState(); }
}
async function stop() {
  if (busy) return;
  setBusy(true);
  try {
    if (mode === 'live') { const result = check(await api.disconnect()); if (result.recording) renderRecording(result.recording); }
    mode = 'offline';deviceTraffic.clear();clearPowerReadings(); frozen = false; controlLabel($('pause-stream'), 'พักกราฟ', 'pause');
    cache.forEach(state => { state.status = 'offline'; }); renderSelected(); addLog('info', '', 'หยุดการอ่านและปิดรอบบันทึกแล้ว');
  } finally { setBusy(false); }
}
function historyFilter() { return { date: $('history-date').value, endDate: $('history-end-date').value || $('history-date').value, motorId: $('history-motor').value, runId: $('history-run')?.value || '' }; }
async function loadHistory() {
  const generation = ++historyGeneration; $('load-history').disabled = true;
  emptyRow($('history-body'),20,'กำลังโหลดข้อมูลตามตัวกรอง…');
  try {
    const result = check(await api.history(historyFilter())); if (generation !== historyGeneration) return;
    (result.motorIds || []).forEach(id => historyMotorIds.add(id)); renderHistoryMotors();
    if (renderHistoryRuns(result.runs || [])) {
      restoreHistoryRange(); invalidateHistoryRange();
      await loadHistory();
      if (analysisHistoryActive() && $('history-motor').value) $('load-range').click();
      return;
    }
    const body = $('history-body'); body.replaceChildren();
    $('history-summary').textContent = `${result.total.toLocaleString()} รายการ · แสดงล่าสุด ${result.rows.length} รายการ${result.skipped ? ` · ข้ามบรรทัดเสียหาย ${result.skipped}` : ''}`;
    for (const frame of result.rows.reverse()) {
      const row = node('tr');
      row.append(node('td', timestamp(frame.timestamp), 'mono'), historyIdentityCell(frame.runId, frame.runStartedAt, 'รอบอ่าน'), historyIdentityCell(frame.recordingId, frame.recordingStartedAt, 'รอบบันทึก'), node('td', frame.motorId), ...[...Measurements.keys.slice(0, 9), 'temperature', ...Measurements.keys.slice(9)].map(key => node('td', digits(frame.channels?.[key], key.startsWith('frequency') ? 2 : 1), 'mono')), node('td', frame.frequencyStatus === 'ok' ? 'Hz พร้อมใช้' : frame.frequencyStatus === 'unconfirmed' ? 'รอยืนยัน Float' : frame.frequencyStatus ? 'Hz ไม่พร้อม' : 'ไม่มี Hz ในข้อมูลรุ่นเดิม'), node('td', `${digits(frame.value, 2)} ${frame.unit}`, 'mono'), node('td', `${frame.port} / ${frame.slaveId}`)); body.append(row);
    }
    if (!result.rows.length) emptyRow(body, 20, 'ไม่มีข้อมูลที่บันทึกในวันที่และมอเตอร์ที่เลือก');
  } catch (error) { if (generation === historyGeneration) { emptyRow($('history-body'),20,'โหลดข้อมูลไม่สำเร็จ · ตรวจตัวกรองแล้วลองใหม่');$('history-summary').textContent = error.message; toast(error.message); } }
  finally { if (generation === historyGeneration) $('load-history').disabled = false; }
}

document.querySelector('.tabs').setAttribute('role', 'tablist');
document.querySelectorAll('[data-tab]').forEach((button, index, tabs) => {
  button.id = `tab-${button.dataset.tab}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `${button.dataset.tab}-view`); button.tabIndex = index === 0 ? 0 : -1;
  const panel = $(`${button.dataset.tab}-view`); panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id);
  button.onclick = () => setTab(button.dataset.tab);
  button.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    if (['ArrowUp','ArrowDown'].includes(event.key) && innerWidth < 1180) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next].dataset.tab); tabs[next].focus();
  };
});
$('new-motor').onclick = () => openFlowAddDevice();
$('fleet-empty-add').onclick = () => openFlowAddDevice();
$('reading-device').onchange = event => {
  const [kind,id]=event.target.value.split(':');
  if (kind==='meter') selectMeter(id,currentTab);
  if (kind==='sensor') selectMotor(id,currentTab);
};
$('fleet-window').onchange = updateGraphWindow;
$('fleet-filter').onchange = refreshFleet;
$('fleet-reset-filters').onclick = () => { $('motor-search').value = ''; $('fleet-filter').value = 'all'; renderMotorList(); };
$('edit-motor').onclick = () => {
  const meter = selectedPowerMeter();
  if (meter) openFlowMeterEditor(meter.id);
  else if (currentProfile()) openEditor(currentProfile());
};
$('welcome-setup').onclick = () => currentProfile() ? openEditor(currentProfile()) : activeWorkspace()?setTab('fleet'):showWorkspacePicker();
$('close-connection').onclick = () => closeEditor();
$('save-register-template').onclick = () => openTemplateLibrary(true);
$('refresh-ports').onclick = scanPorts;
form.onsubmit = saveMotor;
form.oninput = resetTest;
$('sensor-model').onchange = applyRegisterTemplate;
$('port-select').onchange = () => renderPorts();
$('test-sensor').onclick = testMotor;
$('cancel-confirm').onclick = () => $('confirm-dialog').close();
$('motor-search').oninput = () => { renderMotorList(); refreshFleet(); };
$('connect-all').onclick = () => action(startLive);
$('disconnect').onclick = () => action(stop);
$('pause-stream').onclick = () => { frozen = !frozen; controlLabel($('pause-stream'), frozen ? 'แสดงกราฟต่อ' : 'พักกราฟ', frozen ? 'play' : 'pause'); $('pause-stream').setAttribute('aria-pressed', String(frozen)); if (!frozen) renderSelected(); else { $('chart-live').textContent = 'PAUSED'; $('chart-description').textContent = 'พักเฉพาะกราฟ · ค่าล่าสุดและการบันทึกยังอัปเดตตามปกติ'; } };



$('load-history').onclick = loadHistory;
$('export-csv').onclick = () => action(async () => { $('export-csv').disabled = true; try { const result = check(await api.exportData(historyFilter())); if (!result.canceled) toast(`ส่งออก ${result.total} รายการแล้ว`); } finally { $('export-csv').disabled = false; } });
$('open-data').onclick = () => action(async () => check(await api.openDataPath()));
$('export-profiles').onclick = () => action(async () => { const result = check(await api.exportProfiles()); if (!result.canceled) toast('สำรองรายชื่อแล้ว'); });
$('import-profiles').onclick = () => action(async () => { const result = check(await api.importProfiles()); if (!result.canceled) { profiles = result.profiles; selected = workspaceProfiles()[0]?.motorId || ''; cache.clear(); renderProfiles(); renderSelected(); if (selected) void restoreSavedMotorHistory(selected); toast('นำเข้ารายชื่อแล้ว'); } });
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
    for (const profile of workspaceProfiles()) {
      if (profile.enabled === false) continue;
      const state = stateFor(profile.motorId), last = state.frames.at(-1);
      const group=activeWorkspace(),onBus=item=>item.path.toUpperCase()===profile.path.toUpperCase();
      const activeProfiles=workspaceProfiles().filter(item=>item.enabled!==false&&onBus(item));
      const meterBudget=(group?.meters||[]).filter(onBus).reduce((sum,item)=>sum+item.timeout*(Object.keys(PowerRegisters.preset(item.model).blocks).length+(item.points||[]).filter(point=>point.enabled).length),0);
      const busBudget = meterBudget+activeProfiles.reduce((sum,item)=>sum+item.timeout*(item.sensorModel===MODEL?3:Array.isArray(item.points)?Math.max(1,item.points.filter(point=>point.enabled).length):1),0);
      if (last && Date.now() - Date.parse(last.timestamp) > Math.max(profile.pollInterval * 3, busBudget + profile.pollInterval + 2000) && state.status !== 'stale') { state.status = 'stale'; addLog('error', profile.motorId, 'ข้อมูลเก่า เกินช่วงรอของรอบการอ่าน'); }
    }
    refreshSelectionState();
  }
}, 1000);
setupControls();
setupGroupsUI();
setupCustomPointsUI();
setupCustomPointReadings();
setupPointHistory();
setupFlowUI();
setupDeviceUI();

setupAssetView();
setupWorkbench();
setupAcquisitionUI();
setupSpectralUI();
setupAnalysisWorkspace();
detailPlot = createPlotStack($('detail-plots'), { prefix: 'trend', label: 'มอเตอร์ที่เลือก' });
new ResizeObserver(() => { if ($('trend-chart').clientWidth) drawChart(); }).observe($('trend-chart'));
controlLabel($('pause-stream'), 'พักกราฟ', 'pause');
(async () => {
  $('history-date').value ||= today(); renderLogs(); renderChannels(); emptyRow($('history-body'), 20, 'เลือกวันที่แล้วโหลดข้อมูล');
  try {
    const initial = check(await api.initialize()); profiles = initial.profiles; registerTemplates=initial.templates||[]; measurementGroups=initial.groups || []; selectedMeasurementGroup=initial.selectedGroup || ''; savedFlowBuses=initial.buses || []; renderGroupOptions(); selected = workspaceProfiles()[0]?.motorId || '';
    if (initial.recording) renderRecording(initial.recording);
    $('record-path').textContent = `โฟลเดอร์: ${initial.dataPath}`;
    $('app-version').textContent = `v${initial.version}`; $('data-path').textContent = `ข้อมูลในเครื่อง: ${initial.dataPath}`;
    addLog('info', '', 'เปิดโปรแกรมพร้อมใช้งาน');
  } catch (error) { dataError = true; message(error.message); }
  renderProfiles(); if (selected) setHistoryMotor(selected); renderSelected(); setTab(workspaceReadiness().message?'fleet':'monitor'); if (selected) void restoreSavedMotorHistory(selected);
})();
