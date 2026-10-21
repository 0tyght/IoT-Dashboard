'use strict';
let recordingState = { settings: { startMode: 'on-connect', startAt: '', durationMinutes: 0 }, connected: false, active: false, waiting: false, count: 0 };
let historyPlot, rangeFrames = [], rangeGeneration = 0, rangeProfile = null, rangeReduced = false;
let recordActionBusy = false;
function storageLabel(last) {
  if (mode === 'demo') return 'ข้อมูลจำลอง';
  if (!last) return 'ยังไม่มีข้อมูล';
  if (last.recordingState === 'before-start') return 'ค่าทดสอบก่อนเริ่มบันทึก';
  if (last.recordingState === 'monitor-only') return 'ดูอย่างเดียว · ไม่บันทึก';
  return last.recorded === false ? 'บันทึกไม่สำเร็จ' : 'บันทึก CSV แล้ว';
}
function renderRecording(state) {
  if (state) recordingState = state;
  const settings = recordingState.settings, live = mode === 'live';
  const modeName = settings.startMode === 'scheduled' ? 'ตั้งเวลาบันทึก' : settings.startMode === 'monitor-only' ? 'ดูอย่างเดียว' : 'อ่านและบันทึก';
  controlLabel($('record-settings'), `โหมด: ${modeName}`, 'settings');
  $('recording-strip').hidden = mode === 'offline' && !recordingState.count && !recordingState.lastError;
  $('recording-status').textContent = mode === 'demo' ? 'ข้อมูลจำลอง · ไม่บันทึก' : recordingState.lastError ? 'บันทึกไม่สำเร็จ' : !live ? 'จบรอบการทำงาน' : recordingState.active ? 'กำลังอ่านและบันทึก' : recordingState.scheduleMissed ? 'เลยเวลาที่ตั้งไว้ · ยังไม่บันทึก' : recordingState.waiting ? 'กำลังอ่าน · รอเวลาบันทึก' : recordingState.stopReason === 'duration' ? 'ครบเวลาบันทึก · กำลังอ่านต่อ' : 'กำลังอ่าน · ไม่บันทึก';
  $('recording-status').className = mode === 'demo' ? '' : recordingState.lastError ? 'storage-fault' : recordingState.active ? 'recording-active' : '';
  $('recording-detail').textContent = mode === 'demo' ? 'ใช้ทดสอบหน้าจอเท่านั้น' : recordingState.lastError ? `${recordingState.lastError} · ${live ? 'อ่านข้อมูลต่อ' : 'หยุดแล้ว'} · ตรวจโฟลเดอร์และพื้นที่ดิสก์` : recordingState.active ? `${recordingState.count.toLocaleString()} แถว${recordingState.lastSavedAt ? ` · บันทึกล่าสุด ${timestamp(recordingState.lastSavedAt)}` : ' · รอค่ารอบแรก'}${recordingState.endsAt ? ` · สิ้นสุด ${time(recordingState.endsAt)}` : ''}` : recordingState.waiting ? `เริ่ม ${timestamp(settings.startAt)}` : !live ? `${recordingState.count.toLocaleString()} แถว${recordingState.lastSavedAt ? ` · บันทึกล่าสุด ${timestamp(recordingState.lastSavedAt)}` : ''}` : recordingState.scheduleMissed ? 'เพิ่มเติม → เริ่มบันทึกทันที หรือหยุดเพื่อตั้งเวลาใหม่' : 'เริ่มบันทึกได้จากเมนูเพิ่มเติม';
  $('record-start').hidden = !live || recordingState.active;
  $('record-stop').hidden = !live || (!recordingState.active && !recordingState.waiting);
  $('record-start').disabled = busy || recordActionBusy || !live || recordingState.active;
  $('record-stop').disabled = busy || recordActionBusy || !live || (!recordingState.active && !recordingState.waiting);
  $('record-settings').disabled = busy || mode !== 'offline';
  $('record-settings').title = mode !== 'offline' ? 'หยุดก่อนเปลี่ยนโหมดการทำงาน' : 'เลือกอ่านและบันทึก ดูอย่างเดียว หรือตั้งเวลา';
  updateSessionButtons();
}
function updateSessionButtons() {
  const running = mode !== 'offline', settings = recordingState.settings;
  $('connect-all').hidden = running; $('disconnect').hidden = !running;
  $('disconnect').disabled = busy || recordActionBusy || !running;
  controlLabel($('connect-all'), busy ? 'กำลังตรวจเซ็นเซอร์…' : settings.startMode === 'monitor-only' ? 'เริ่มดูข้อมูล' : settings.startMode === 'scheduled' ? 'เริ่มอ่านและรอบันทึก' : 'เริ่มอ่านและบันทึก', 'play');
  controlLabel($('disconnect'), busy ? 'กำลังหยุด…' : mode === 'demo' ? 'จบการทดลอง' : recordingState.active ? 'หยุดอ่านและบันทึก' : 'หยุดการทำงาน', 'stop');
}
function recordingModeFields() {
  const value = $('record-start-mode').value, scheduled = value === 'scheduled';
  $('record-schedule-label').hidden = !scheduled; $('record-start-at').required = scheduled;
  $('record-duration-label').hidden = value === 'monitor-only';
  $('record-duration-note').hidden = value === 'monitor-only';
  $('record-form-error').hidden = true;
  $('record-mode-help').textContent = scheduled ? 'กดเริ่มเพื่ออ่านค่ารอไว้ แล้วบันทึกเมื่อถึงเวลา · ต้องเปิดโปรแกรมไว้' : value === 'monitor-only' ? 'อ่านค่าจริงโดยไม่เขียนไฟล์ · เริ่มบันทึกภายหลังได้จากเมนูเพิ่มเติม' : 'กดเริ่มครั้งเดียวเพื่อตรวจเซ็นเซอร์ อ่านค่า และบันทึกอัตโนมัติ';
}
function inputLocal(value) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19); }
function createHistorySurface(container, { frames, metric, note }) {
  const view = node('section', null, 'history-surface-view'); view.id = 'history-3d-view'; view.hidden = true;
  const toolbar = node('div', null, 'history-surface-toolbar'), selectLabel = node('label', 'ค่าที่แสดง'), select = node('select'); select.id = 'history-surface-metric';
  for (const [value, label] of [['velocity', 'ความเร็วสั่น · mm/s'], ['displacement', 'ระยะกระจัด · µm'], ['acceleration', 'ความเร่ง · m/s²'], ['frequency', 'ความถี่ · Hz']]) select.add(new Option(label, value));
  selectLabel.append(select);
  const legend = node('div', 'X · Y · Z', 'surface-axis-legend');
  for (const [axis, color] of [['X', 'var(--x)'], ['Y', 'var(--y)'], ['Z', 'var(--z)']]) { const item = node('span', axis); item.style.setProperty('--axis-color', color); legend.append(item); }
  toolbar.append(selectLabel, legend);
  const canvas = document.createElement('canvas'); canvas.id = 'history-surface-canvas'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'กราฟพื้นผิวสามมิติจากค่าการสั่นที่บันทึกย้อนหลัง ลากเพื่อหมุน ใช้ล้อเมาส์เพื่อซูม');
  const readout = node('p', 'ลากเพื่อหมุน · ล้อเมาส์เพื่อซูม · ปุ่มลูกศรเพื่อหมุนเมื่อใช้คีย์บอร์ด', 'surface-readout'); readout.id = 'history-surface-readout';
  const caption = node('p', 'แกนนอน = เวลา · แกนลึก = แกนวัด X/Y/Z · ความสูงและสี = ค่าที่เลือก · ไม่ใช่กราฟ FFT', 'surface-caption');
  const chart = node('div', null, 'history-surface-chart'); chart.append(canvas);
  view.append(toolbar, chart, readout, caption); container.after(view);
  let rotation = -.62, zoom = 1, pointer = null;
  const valueFor = (frame, axis) => { const key = `${select.value}${axis}`; const value = frame?.channels?.[key] ?? frame?.[key]; return Number.isFinite(value) ? value : null; };
  const format = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) : '—';
  const draw = () => {
    const rect = canvas.getBoundingClientRect(), cssWidth = Math.max(240, rect.width), cssHeight = Math.max(250, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1), width = Math.round(cssWidth * dpr), height = Math.round(cssHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d'); context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, cssWidth, cssHeight);
    const key = select.value, axes = ['X', 'Y', 'Z'];
    let rows = frames().filter(frame => Number.isFinite(Date.parse(frame.timestamp)));
    if (rows.length > 120) rows = Array.from({ length: 120 }, (_, index) => rows[Math.round(index * (rows.length - 1) / 119)]);
    const points = rows.map(frame => axes.map(axis => valueFor(frame, axis)));
    const allValues = points.flat().filter(Number.isFinite), low = allValues.length ? Math.min(0, ...allValues) : 0, high = allValues.length ? Math.max(...allValues) : 0;
    const valueSpan = high - low || Math.abs(high) || 1, centerValue = (high + low) / 2;
    const margin = { left: 72, right: 45, top: 26, bottom: 48 }, plotWidth = Math.max(100, cssWidth - margin.left - margin.right), plotHeight = Math.max(100, cssHeight - margin.top - margin.bottom);
    const scale = Math.min(plotWidth * .44, plotHeight * .72) * zoom;
    const cx = margin.left + plotWidth * .53, cy = margin.top + plotHeight * .69, cos = Math.cos(rotation), sin = Math.sin(rotation);
    const project = (x, y, z) => { const dx = (x - .5) * 2, dy = y * 2 - 1, rx = dx * cos - dy * sin, ry = dx * sin + dy * cos; return { x: cx + (rx - ry * .12) * scale, y: cy + (rx * .2 + ry * .43) * scale - z * scale * .7, depth: ry + z * .1 }; };
    const ground = [[project(0, 0, 0), project(1, 0, 0)], [project(1, 0, 0), project(1, 1, 0)], [project(1, 1, 0), project(0, 1, 0)], [project(0, 1, 0), project(0, 0, 0)]];
    context.lineWidth = 1; context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#d9dce8';
    for (const [a, b] of ground) { context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); }
    for (let tick = 1; tick < 5; tick++) { const t = tick / 5, a = project(t, 0, 0), b = project(t, 1, 0); context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); }
    for (let tick = 1; tick < 3; tick++) { const t = tick / 3, a = project(0, t, 0), b = project(1, t, 0); context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); }
    const triangles = [];
    for (let index = 0; index < rows.length - 1; index++) for (let axis = 0; axis < axes.length - 1; axis++) {
      const values = [points[index][axis], points[index + 1][axis], points[index][axis + 1], points[index + 1][axis + 1]];
      if (!values.every(Number.isFinite)) continue;
      const normalized = values.map(value => Math.max(-.48, Math.min(.48, (value - centerValue) / valueSpan)));
      const positions = [project(index / Math.max(rows.length - 1, 1), axis / 2, normalized[0]), project((index + 1) / Math.max(rows.length - 1, 1), axis / 2, normalized[1]), project(index / Math.max(rows.length - 1, 1), (axis + 1) / 2, normalized[2]), project((index + 1) / Math.max(rows.length - 1, 1), (axis + 1) / 2, normalized[3])];
      for (const [corner, average] of [[[0, 1, 2], (normalized[0] + normalized[1] + normalized[2]) / 3], [[1, 3, 2], (normalized[1] + normalized[3] + normalized[2]) / 3]]) triangles.push({ points: corner.map(point => positions[point]), depth: corner.reduce((sum, point) => sum + positions[point].depth, 0) / 3, average });
    }
    triangles.sort((a, b) => a.depth - b.depth);
    for (const triangle of triangles) { const hue = Math.round(230 - Math.max(0, Math.min(1, (triangle.average + .48) / .96)) * 230); context.beginPath(); context.moveTo(triangle.points[0].x, triangle.points[0].y); for (const point of triangle.points.slice(1)) context.lineTo(point.x, point.y); context.closePath(); context.fillStyle = `hsl(${hue} 78% 50% / .88)`; context.fill(); context.strokeStyle = 'rgba(255,255,255,.28)'; context.lineWidth = .55; context.stroke(); }
    context.font = '11px Segoe UI, sans-serif'; context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#666'; context.textAlign = 'center';
    const dateAt = index => rows.length ? new Date(rows[Math.round(index * (rows.length - 1))].timestamp).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '';
    for (const tick of [0, .5, 1]) { const p = project(tick, 0, 0); context.fillText(dateAt(tick), p.x, p.y + 17); }
    context.textAlign = 'right'; for (const tick of [0, .5, 1]) { const p = project(0, tick, 0); context.fillText(['X', 'Y', 'Z'][Math.round(tick * 2)], p.x - 8, p.y + 4); }
    context.textAlign = 'left'; const zLow = project(1, 1, -.48), zMid = project(1, 1, 0), zHigh = project(1, 1, .48); context.fillText(format(low), zLow.x + 7, zLow.y + 4); context.fillText(format(centerValue), zMid.x + 7, zMid.y + 4); context.fillText(format(high), zHigh.x + 7, zHigh.y + 4);
    canvas.dataset.valueCount = allValues.length; canvas.dataset.recordCount = rows.length; canvas.dataset.metric = key;
    if (!allValues.length) { context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#666'; context.textAlign = 'center'; context.font = '14px Segoe UI, sans-serif'; context.fillText(rows.length ? 'ไม่มีค่าของหน่วยนี้ในข้อมูลที่เลือก' : 'เลือกมอเตอร์และช่วงเวลา แล้วโหลดข้อมูลย้อนหลัง', cssWidth / 2, cssHeight / 2); }
    const group = Measurements.groups[key]; readout.textContent = allValues.length ? `${rows.length.toLocaleString()} เวลา · ${allValues.length.toLocaleString()} ค่า ${group?.unit || 'Hz'} · ${rows.length ? timestamp(rows[0].timestamp) : ''} ถึง ${rows.length ? timestamp(rows.at(-1).timestamp) : ''}` : key === 'frequency' ? 'ไม่มีค่าความถี่ที่ยืนยันแล้วในข้อมูลช่วงนี้' : 'ไม่มีข้อมูลสำหรับช่วงเวลาที่เลือก';
  };
  select.onchange = draw;
  canvas.onpointerdown = event => { pointer = { x: event.clientX, rotation }; canvas.setPointerCapture(event.pointerId); };
  canvas.onpointermove = event => {
    if (pointer) { rotation = pointer.rotation + (event.clientX - pointer.x) * .009; draw(); return; }
    const rows = frames(); if (!rows.length) return; const rect = canvas.getBoundingClientRect(), fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), frame = rows[Math.round(fraction * (rows.length - 1))];
    readout.textContent = `${timestamp(frame.timestamp)} · X ${format(valueFor(frame, 'X'))} · Y ${format(valueFor(frame, 'Y'))} · Z ${format(valueFor(frame, 'Z'))} ${Measurements.groups[select.value]?.unit || 'Hz'}`;
  };
  canvas.onpointerup = () => { pointer = null; }; canvas.onpointercancel = () => { pointer = null; };
  canvas.onwheel = event => { event.preventDefault(); zoom = Math.max(.65, Math.min(1.8, zoom * (event.deltaY < 0 ? 1.08 : .92))); draw(); };
  canvas.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); rotation += event.key === 'ArrowLeft' ? -.12 : .12; draw(); } else if (event.key === '+' || event.key === '=') { zoom = Math.min(1.8, zoom * 1.1); draw(); } else if (event.key === '-') { zoom = Math.max(.65, zoom / 1.1); draw(); } };
  new ResizeObserver(draw).observe(chart); window.addEventListener('resize', draw);
  return { view, canvas, select, draw };
}
function setupAcquisitionUI() {
  const recordingForm = $('recording-form');
  $('record-settings').onclick = () => {
    const settings = recordingState.settings;
    recordingForm.elements.startMode.value = settings.startMode; recordingForm.elements.durationMinutes.value = settings.durationMinutes;
    $('record-start-at').value = settings.startAt ? inputLocal(settings.startAt) : inputLocal(Date.now() + 3600000);
    $('record-form-error').hidden = true; recordingModeFields(); $('recording-dialog').showModal();
  };
  $('record-start-mode').onchange = recordingModeFields;
  $('close-recording').onclick = () => $('recording-dialog').close();
  recordingForm.onsubmit = async event => {
    event.preventDefault(); if (!recordingForm.reportValidity()) return; $('save-recording').disabled = true;
    try {
      const startMode = $('record-start-mode').value, startAt = startMode === 'scheduled' ? new Date($('record-start-at').value).toISOString() : '';
      if (startMode === 'scheduled' && Date.parse(startAt) <= Date.now()) throw new Error('เลือกวันและเวลาเริ่มในอนาคต');
      const result = check(await api.configureRecording({ startMode, startAt, durationMinutes: startMode === 'monitor-only' ? 0 : Number(recordingForm.elements.durationMinutes.value) }));
      renderRecording(result.recording); $('recording-dialog').close(); toast('บันทึกเงื่อนไขการบันทึกแล้ว');
    } catch (error) { $('record-form-error').textContent = error.message; $('record-form-error').hidden = false; }
    finally { $('save-recording').disabled = false; }
  };
  $('record-start').onclick = () => action(async () => { recordActionBusy = true; updateControls(); try { renderRecording(check(await api.startRecording()).recording); } finally { recordActionBusy = false; updateControls(); } });
  $('record-stop').onclick = () => action(async () => { recordActionBusy = true; updateControls(); try { renderRecording(check(await api.stopRecording()).recording); } finally { recordActionBusy = false; updateControls(); } });
  api.onRecording(renderRecording);
  $('graph-count').onchange = updateGraphWindow;
  $('history-end-date').value = today();
  $('history-date').onchange = () => { if ($('history-end-date').value < $('history-date').value) $('history-end-date').value = $('history-date').value; };
  $('range-from').value = `${today()}T00:00:00`; $('range-to').value = `${today()}T23:59:59`;
  const historyView = $('history-view'), rangePanel = historyView.querySelector('.history-range');
  historyView.querySelector('.table-scroll').before(rangePanel);
  historyPlot = createPlotStack($('history-plots'), { prefix: 'history', label: 'ย้อนหลัง' });
  const viewControls = node('div', null, 'history-view-switch'), twoD = node('button', 'กราฟเส้น', 'active'), threeD = node('button', 'พื้นผิว 3D');
  twoD.type = 'button'; threeD.type = 'button'; twoD.id = 'history-view-lines'; threeD.id = 'history-view-surface'; twoD.setAttribute('aria-pressed', 'true'); threeD.setAttribute('aria-pressed', 'false');
  viewControls.append(twoD, threeD); $('history-view').querySelector('.history-range .panel-heading').append(viewControls);
  const surface = createHistorySurface($('history-plots'), { frames: () => rangeFrames });
  const setHistoryView = is3d => { $('history-plots').hidden = is3d; surface.view.hidden = !is3d; rangePanel.dataset.historyView = is3d ? 'surface' : 'lines'; twoD.classList.toggle('active', !is3d); threeD.classList.toggle('active', is3d); twoD.setAttribute('aria-pressed', String(!is3d)); threeD.setAttribute('aria-pressed', String(is3d)); if (is3d) surface.draw(); };
  twoD.onclick = () => setHistoryView(false); threeD.onclick = () => setHistoryView(true);
  const drawHistory = () => historyPlot.draw(rangeFrames, rangeProfile || profiles.find(profile => profile.motorId === $('history-motor').value) || { sensorModel: MODEL, unit: 'mm/s' }, { reduced: rangeReduced });
  const clearRange = () => {
    rangeGeneration++; rangeFrames = []; rangeProfile = null; drawHistory(); surface.draw();
    $('load-range').disabled = false; $('range-summary').textContent = 'เงื่อนไขเปลี่ยนแล้ว · กดโหลดกราฟย้อนหลัง';
  };
  for (const id of ['history-motor', 'range-from', 'range-to']) $(id).onchange = clearRange;
  new ResizeObserver(() => { if ($('history-chart').clientWidth) drawHistory(); }).observe($('history-chart'));
  $('load-range').onclick = async () => {
    const generation = ++rangeGeneration, motorId = $('history-motor').value;
    $('load-range').disabled = true; $('range-summary').textContent = 'กำลังโหลดจากไฟล์…';
    try {
      const result = check(await api.chartRange({ motorId, from: `${$('range-from').value}+07:00`, to: `${$('range-to').value}+07:00` }));
      if (generation !== rangeGeneration) return;
      rangeFrames = result.rows; rangeReduced = Boolean(result.reduced);
      // The recording determines its channels/units, even if the motor was edited later.
      rangeProfile = rangeFrames.length ? { sensorModel: rangeFrames.some(frame => frame.channels) ? MODEL : 'custom', unit: rangeFrames[0].unit } : null;
      drawHistory(); surface.draw();
      $('range-summary').textContent = `${motorId} · ${result.total.toLocaleString()} ค่าจริง · แสดง ${historyPlot.frames.length.toLocaleString()} จุด${result.reduced || historyPlot.frames.length < result.rows.length ? ' (ลดจุดโดยเก็บค่าสูงสุด/ต่ำสุดของทุกช่อง)' : ''}${result.skipped ? ` · ข้ามบรรทัดเสีย ${result.skipped}` : ''}`;
    } catch (error) { if (generation === rangeGeneration) { rangeFrames = []; rangeProfile = null; drawHistory(); surface.draw(); $('range-summary').textContent = error.message; } }
    finally { if (generation === rangeGeneration) $('load-range').disabled = false; }
  };
}
function updateGraphWindow() {
  $('graph-count-label').hidden = $('fleet-window').value !== 'custom';
  fleetCards.forEach(refs => { refs.lastKey = ''; }); refreshFleet(); if (!frozen) renderSelected();
}
