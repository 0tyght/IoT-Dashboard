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
  historyPlot = createPlotStack($('history-plots'), { prefix: 'history', label: 'ย้อนหลัง' });
  const drawHistory = () => historyPlot.draw(rangeFrames, rangeProfile || profiles.find(profile => profile.motorId === $('history-motor').value) || { sensorModel: MODEL, unit: 'mm/s' }, { reduced: rangeReduced });
  const clearRange = () => {
    rangeGeneration++; rangeFrames = []; rangeProfile = null; drawHistory();
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
      drawHistory();
      $('range-summary').textContent = `${motorId} · ${result.total.toLocaleString()} ค่าจริง · แสดง ${historyPlot.frames.length.toLocaleString()} จุด${result.reduced || historyPlot.frames.length < result.rows.length ? ' (ลดจุดโดยเก็บค่าสูงสุด/ต่ำสุดของทุกช่อง)' : ''}${result.skipped ? ` · ข้ามบรรทัดเสีย ${result.skipped}` : ''}`;
    } catch (error) { if (generation === rangeGeneration) { rangeFrames = []; rangeProfile = null; drawHistory(); $('range-summary').textContent = error.message; } }
    finally { if (generation === rangeGeneration) $('load-range').disabled = false; }
  };
}
function updateGraphWindow() {
  $('graph-count-label').hidden = $('fleet-window').value !== 'custom';
  fleetCards.forEach(refs => { refs.lastKey = ''; }); refreshFleet(); if (!frozen) renderSelected();
}
