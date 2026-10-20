'use strict';
let recordingState = { settings: { startMode: 'manual', startAt: '', durationMinutes: 0 }, connected: false, active: false, waiting: false, count: 0 };
let historyPlot, rangeFrames = [], rangeGeneration = 0;
let recordActionBusy = false;
function storageLabel(last) {
  if (mode === 'demo') return 'ข้อมูลจำลอง';
  if (!last) return 'ยังไม่มีข้อมูล';
  if (last.recordingState === 'monitor-only') return 'ดูอย่างเดียว · ไม่บันทึก';
  return last.recorded === false ? 'บันทึกไม่สำเร็จ' : 'CSV + NDJSON บันทึกแล้ว';
}
function renderRecording(state) {
  if (state) recordingState = state;
  const settings = recordingState.settings, live = mode === 'live';
  $('recording-status').textContent = mode === 'demo' ? 'ข้อมูลจำลอง · ไม่บันทึก' : recordingState.active ? 'กำลังบันทึก CSV + NDJSON' : recordingState.scheduleMissed ? 'เลยเวลาที่ตั้งไว้ · ยังไม่บันทึก' : recordingState.waiting ? 'รอเวลาบันทึก' : 'ดูข้อมูล · ยังไม่บันทึก';
  $('recording-status').className = recordingState.active ? 'recording-active' : '';
  $('recording-detail').textContent = recordingState.active ? `${recordingState.count.toLocaleString()} แถว · เริ่ม ${timestamp(recordingState.startedAt)}${recordingState.endsAt ? ` · หยุด ${timestamp(recordingState.endsAt)}` : ''}` : recordingState.scheduleMissed ? 'กดเริ่มบันทึกเพื่อเริ่มทันที หรือหยุดอ่านแล้วตั้งเวลาใหม่' : settings.startMode === 'scheduled' ? `กำหนดเริ่ม ${timestamp(settings.startAt)} · ต้องเปิดโปรแกรมและเริ่มอ่านไว้` : settings.startMode === 'on-connect' ? 'เริ่มอัตโนมัติเมื่อเชื่อมต่อสำเร็จ · บันทึกทุกค่าที่อ่านได้' : 'กดเริ่มบันทึกเมื่อพร้อม · บันทึกทุกค่าที่อ่านได้';
  $('record-start').disabled = busy || recordActionBusy || !live || recordingState.active;
  $('record-stop').disabled = busy || recordActionBusy || !live || (!recordingState.active && !recordingState.waiting);
  $('record-settings').disabled = busy || mode !== 'offline';
  $('record-settings').title = mode !== 'offline' ? 'หยุดอ่านก่อนเปลี่ยนเงื่อนไข' : 'ตั้งเงื่อนไขเริ่มและระยะเวลาบันทึก';
}
function recordingModeFields() {
  const scheduled = $('record-start-mode').value === 'scheduled'; $('record-schedule-label').hidden = !scheduled; $('record-start-at').required = scheduled;
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
      const result = check(await api.configureRecording({ startMode, startAt, durationMinutes: Number(recordingForm.elements.durationMinutes.value) }));
      renderRecording(result.recording); $('recording-dialog').close(); toast('บันทึกเงื่อนไขการบันทึกแล้ว');
    } catch (error) { $('record-form-error').textContent = error.message; $('record-form-error').hidden = false; }
    finally { $('save-recording').disabled = false; }
  };
  $('record-start').onclick = () => action(async () => { recordActionBusy = true; renderRecording(); try { renderRecording(check(await api.startRecording()).recording); } finally { recordActionBusy = false; renderRecording(); } });
  $('record-stop').onclick = () => action(async () => { recordActionBusy = true; renderRecording(); try { renderRecording(check(await api.stopRecording()).recording); } finally { recordActionBusy = false; renderRecording(); } });
  api.onRecording(renderRecording);
  $('graph-count').onchange = updateGraphWindow;
  $('history-end-date').value = today();
  $('history-date').onchange = () => { if ($('history-end-date').value < $('history-date').value) $('history-end-date').value = $('history-date').value; };
  $('range-from').value = `${today()}T00:00:00`; $('range-to').value = `${today()}T23:59:59`;
  historyPlot = { svg: $('history-chart'), tooltip: $('history-tooltip'), frames: [], hoverIndex: 0 };
  bindPlot(historyPlot);
  const drawHistory = () => drawSensorPlot(historyPlot, rangeFrames, $('range-kind').value, rangeFrames[0]?.unit);
  $('range-kind').onchange = drawHistory;
  new ResizeObserver(() => { if ($('history-chart').clientWidth) drawHistory(); }).observe($('history-chart'));
  $('load-range').onclick = async () => {
    const generation = ++rangeGeneration; $('load-range').disabled = true; $('range-summary').textContent = 'กำลังโหลดจากไฟล์…';
    try {
      const result = check(await api.chartRange({ motorId: $('history-motor').value, from: `${$('range-from').value}+07:00`, to: `${$('range-to').value}+07:00` }));
      if (generation !== rangeGeneration) return;
      rangeFrames = Measurements.thinFrames(result.rows);
      $('range-summary').textContent = `${$('history-motor').value} · ${result.total.toLocaleString()} ค่าจริง · แสดง ${rangeFrames.length.toLocaleString()} จุด${result.reduced || rangeFrames.length < result.rows.length ? ' (ลดจำนวนจุดโดยเก็บค่าสูงสุด/ต่ำสุดของทุกช่อง)' : ''}${result.skipped ? ` · ข้ามบรรทัดเสีย ${result.skipped}` : ''}`;
      drawHistory();
    } catch (error) { if (generation === rangeGeneration) { rangeFrames = []; drawHistory(); $('range-summary').textContent = error.message; } }
    finally { if (generation === rangeGeneration) $('load-range').disabled = false; }
  };
}
function updateGraphWindow() {
  $('graph-count-label').hidden = $('fleet-window').value !== 'custom';
  fleetCards.forEach(refs => { refs.lastKey = ''; }); refreshFleet(); if (!frozen) renderSelected();
}
