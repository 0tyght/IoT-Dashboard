'use strict';
let recordingState = { settings: { startMode: 'on-connect', startAt: '', durationMinutes: 0 }, connected: false, active: false, waiting: false, count: 0 };
let historyPlot, rangeFrames = [], rangeGeneration = 0, rangeProfile = null, rangeReduced = false, rangeGapStarts = [];
let rangeView = 'scatter', rangeSampling = 'all', rangeCompleteTotal = 0;
let invalidateHistoryRange = () => {};
let recordActionBusy = false;
let historyRuns = [];
let restoreHistoryRange = () => {};
function shortIdentity(value) { return typeof value === 'string' && value ? value.slice(0, 8) : '—'; }
function runDateLabel(value) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : 'ไม่ระบุเวลาเริ่ม';
}
function hasRunFolder(runId) { return typeof runId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId); }
function updateRunFolderButton() {
  const button = $('open-run-folder'), runId = $('history-run')?.value;
  if (!button) return;
  button.disabled = !hasRunFolder(runId);
  button.title = button.disabled ? 'เลือกรอบอ่านที่มีรหัส เพื่อเปิดโฟลเดอร์ CSV ของรอบนั้น' : `เปิด CSV ของรอบ ${runId}`;
}
function renderHistoryRuns(runs = []) {
  const select = $('history-run'); if (!select) return false;
  const previous = select.value; historyRuns = runs;
  select.replaceChildren(new Option('ทุกรอบ', ''));
  for (const run of runs) {
    const label = run.runId === '__legacy__' ? `ข้อมูลเดิม · ไม่ระบุรอบ · ${run.total.toLocaleString()} ค่า` : `${runDateLabel(run.runStartedAt || run.firstTimestamp)} · ${shortIdentity(run.runId)} · ${run.total.toLocaleString()} ค่า`;
    const option = new Option(label, run.runId);
    option.title = run.runId === '__legacy__' ? 'ข้อมูลจากรุ่นเดิมที่ยังไม่มีรหัสรอบอ่าน' : `รอบอ่าน ${run.runId}\nเริ่ม ${runDateLabel(run.runStartedAt || run.firstTimestamp)} (UTC+07:00)`;
    select.add(option);
  }
  select.value = [...select.options].some(option => option.value === previous) ? previous : '';
  syncAnalysisHistoryControls();
  updateRunFolderButton();
  return previous !== select.value;
}
function resetHistoryRun() {
  restoreHistoryRange();
  if ($('history-run')) $('history-run').value = '';
  renderHistoryRuns([]);
}
function historyIdentityCell(value, startedAt, label) {
  const cell = node('td', value ? shortIdentity(value) : 'ข้อมูลเดิม', 'mono');
  cell.title = value ? `${label} ${value}${startedAt ? `\nเริ่ม ${runDateLabel(startedAt)} (UTC+07:00)` : ''}` : `ข้อมูลเดิมที่ไม่ระบุ${label}`;
  return cell;
}
function storageLabel(last, savedHistory = false) {
  if (mode === 'demo') return 'ข้อมูลจำลอง';
  if (!last) return 'ยังไม่มีข้อมูล';
  if (savedHistory) return 'ข้อมูลจากไฟล์ประวัติ';
  if (last.recordingState === 'before-start') return 'ค่าทดสอบก่อนเริ่มบันทึก';
  if (last.recordingState === 'monitor-only') return 'ดูอย่างเดียว · ไม่บันทึก';
  return last.recorded === true || last.recordingState === 'saved' ? 'บันทึก CSV แล้ว' : last.recorded === false ? 'บันทึกไม่สำเร็จ' : 'ข้อมูลที่อ่านได้ · ไม่ยืนยันการบันทึก';
}
function renderRecording(state) {
  if (state) recordingState = state;
  const settings = recordingState.settings, live = mode === 'live';
  const modeName = settings.startMode === 'scheduled' ? 'ตั้งเวลาบันทึก' : settings.startMode === 'monitor-only' ? 'ดูอย่างเดียว' : 'อ่านและบันทึก';
  controlLabel($('record-settings'), `โหมด: ${modeName}`, 'settings');
  $('recording-strip').hidden = mode === 'offline' && !recordingState.count && !recordingState.lastError;
  $('recording-status').textContent = mode === 'demo' ? 'ข้อมูลจำลอง · ไม่บันทึก' : recordingState.lastError ? 'บันทึกไม่สำเร็จ' : !live ? 'จบรอบการทำงาน' : recordingState.active ? 'กำลังอ่านและบันทึก' : recordingState.scheduleMissed ? 'เลยเวลาที่ตั้งไว้ · ยังไม่บันทึก' : recordingState.waiting ? 'กำลังอ่าน · รอเวลาบันทึก' : recordingState.stopReason === 'duration' ? 'ครบเวลาบันทึก · กำลังอ่านต่อ' : 'กำลังอ่าน · ไม่บันทึก';
  $('recording-status').className = mode === 'demo' ? '' : recordingState.lastError ? 'storage-fault' : recordingState.active ? 'recording-active' : '';
  const runLabel = $('recording-run');
  if (runLabel) {
    runLabel.hidden = !recordingState.runId || mode === 'demo';
    runLabel.textContent = recordingState.runId ? `รอบ ${runDateLabel(recordingState.runStartedAt)} · ${shortIdentity(recordingState.runId)}` : '';
    runLabel.title = recordingState.runId ? `รอบอ่าน ${recordingState.runId}\nเริ่ม ${runDateLabel(recordingState.runStartedAt)} (UTC+07:00)${recordingState.recordingId ? `\nรอบบันทึก ${recordingState.recordingId}\nเริ่มบันทึก ${runDateLabel(recordingState.recordingStartedAt)}` : '\nยังไม่เริ่มบันทึกในรอบนี้'}` : '';
    runLabel.dataset.runId = recordingState.runId || '';
  }
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
  const runLabel = node('span'); runLabel.id = 'recording-run'; runLabel.hidden = true;
  $('recording-status').after(runLabel);
  const historyControls = $('history-view').querySelector('.section-toolbar .inline-controls');
  const runSelectLabel = node('label', 'รอบอ่าน', 'history-run-label'), runSelect = node('select');
  runSelect.id = 'history-run'; runSelect.setAttribute('aria-label', 'กรองรอบอ่าน'); runSelect.add(new Option('ทุกรอบ', '')); runSelectLabel.append(runSelect);
  $('history-motor').after(runSelectLabel);
  const openRunFolder = node('button', 'โฟลเดอร์รอบนี้'); openRunFolder.id = 'open-run-folder'; openRunFolder.type = 'button'; openRunFolder.disabled = true;
  historyControls.append(openRunFolder);
  openRunFolder.onclick = () => action(async () => {
    const runId = runSelect.value; if (!hasRunFolder(runId)) return;
    openRunFolder.disabled = true;
    try { check(await api.openRunDataPath(runId)); }
    finally { updateRunFolderButton(); }
  });
  const historyHeader = $('history-view').querySelector('.data-table thead tr');
  historyHeader.children[1].before(node('th', 'รอบอ่าน'), node('th', 'รอบบันทึก'));
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
  const bangkokDateTime = stamp => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  };
  // Leave a small clock-skew margin so a sample written while the view opens is included.
  const rangeEnd = Date.now() + 60000; $('range-from').value = bangkokDateTime(rangeEnd - 24 * 3600000); $('range-to').value = bangkokDateTime(rangeEnd);
  let rangeBeforeRun = null;
  restoreHistoryRange = () => {
    if (rangeBeforeRun) { $('range-from').value = rangeBeforeRun.from; $('range-to').value = rangeBeforeRun.to; rangeBeforeRun = null; }
  };
  $('history-date').value = $('range-from').value.slice(0, 10);
  const historyView = $('history-view'), rangePanel = historyView.querySelector('.history-range');
  const seriesLabel = node('label', 'ชุดข้อมูลที่บันทึก'), seriesSelect = node('select');
  seriesLabel.id = 'history-series-label'; seriesSelect.id = 'history-series'; seriesLabel.hidden = true; seriesLabel.append(seriesSelect);
  rangePanel.querySelector('.history-range-controls').insertBefore(seriesLabel, $('load-range'));
  historyPlot = createPlotStack($('history-plots'), { prefix: 'history', label: 'ย้อนหลัง' });
  const viewControls = node('div', null, 'history-view-switch'), twoD = node('button', 'แนวโน้มเวลา'), threeD = node('button', 'กระจาย 3D', 'active');
  twoD.type = 'button'; threeD.type = 'button'; twoD.id = 'history-view-lines'; threeD.id = 'history-view-scatter';
  const trendButton=node('button','FFT ค่ารวม');trendButton.type='button';trendButton.id='history-view-trend-fft';
  viewControls.append(threeD, twoD, trendButton); rangePanel.querySelector('.panel-heading').append(viewControls);
  const scatter = createHistoryScatter($('history-plots'), { frames: () => rangeFrames, profile: () => rangeProfile, reduced: () => rangeReduced, sampling: () => rangeSampling, total: () => rangeCompleteTotal });
  const trendHost=node('div');trendHost.id='history-trend-fft';trendHost.hidden=true;$('history-plots').after(trendHost);
  const trend=setupSpectralUI({host:trendHost,prefix:'trendfft',mode:'trend'});
  const setHistoryView = view => {
    rangeView = view; const is3d = view === 'scatter';
    $('history-plots').hidden = view!=='lines'; scatter.view.hidden = !is3d;trendHost.hidden=view!=='trend-fft';rangePanel.dataset.historyView = view;
    for(const[button,value]of[[twoD,'lines'],[threeD,'scatter'],[trendButton,'trend-fft']]){button.classList.toggle('active',view===value);button.setAttribute('aria-pressed',String(view===value));}
    rangePanel.querySelector('.chart-legend').hidden = view!=='lines';
    rangePanel.querySelector('.panel-heading p').textContent=view==='trend-fft'?'FFT ของค่ารวมตามเวลารับในคอม · แยกจาก FFT คลื่นดิบ':'จุดกระจายแสดงความสัมพันธ์ X/Y/Z ของค่ารวม · ไม่ใช่คลื่นดิบหรือสเปกตรัม FFT';
  };
  setHistoryView(rangeView);
  const drawHistory = () => {
    const profile = rangeProfile || profiles.find(profile => profile.motorId === $('history-motor').value) || { motorId: $('history-motor').value, sensorModel: MODEL, unit: 'mm/s' };
    if (rangeView === 'lines') historyPlot.draw(rangeFrames, profile, { reduced: rangeReduced, gapStarts: rangeGapStarts });
    else if(rangeView==='trend-fft')trend.draw();else scatter.draw();
    threeD.disabled = profile.sensorModel === 'custom'; threeD.title = threeD.disabled ? 'ข้อมูล Custom มีค่าหนึ่งช่อง ใช้แนวโน้มเวลา' : 'หนึ่งจุดคือค่ารวม X/Y/Z ที่บันทึกพร้อมกัน ไม่ใช่ตำแหน่งหรือ FFT';
  };
  drawHistoryAnalysis = drawHistory;
  const clearRange = ({ keepSeries = false } = {}) => {
    rangeGeneration++; rangeFrames = []; rangeProfile = null; rangeReduced = false; rangeGapStarts = []; rangeSampling = 'all'; rangeCompleteTotal = 0;
    historyPlot.cursorStamp = null; historyPlot.source = null; closeWorkbenchPopovers();
    if (!keepSeries) { seriesSelect.replaceChildren(); seriesLabel.hidden = true; }
    trend.clear();
    historyPlot.draw([], rangeProfile || { sensorModel: MODEL, unit: 'mm/s' }); drawHistory(); scatter.draw();
    rangePanel.dataset.loaded = 'false';
    $('load-range').disabled = false; $('range-summary').textContent = $('history-motor').value ? 'เงื่อนไขเปลี่ยนแล้ว · กดโหลดกราฟ' : 'เลือกมอเตอร์เพื่อเปิดกราฟย้อนหลัง';
  };
  invalidateHistoryRange = clearRange;
  for (const [button, view] of [[twoD,'lines'],[threeD,'scatter'],[trendButton,'trend-fft']]) button.onclick = () => { if(rangeView === view)return; setHistoryView(view); clearRange({ keepSeries:true }); if($('history-motor').value)$('load-range').click(); };
  scatter.select.addEventListener('change', () => { if(rangeView === 'scatter'){clearRange({keepSeries:true});if($('history-motor').value)$('load-range').click();} });
  for (const id of ['range-from', 'range-to']) $(id).onchange = () => { rangeBeforeRun = null; clearRange(); };
  $('history-motor').onchange = () => { historyGeneration++;resetHistoryRun(); clearRange(); syncAnalysisHistoryControls(); if (currentTab === 'history' || analysisHistoryActive()) { loadHistory(); if (analysisHistoryActive() && $('history-motor').value) $('load-range').click(); } };
  runSelect.onchange = () => {
    const run = historyRuns.find(item => item.runId === runSelect.value);
    if (run && Number.isFinite(Date.parse(run.firstTimestamp)) && Number.isFinite(Date.parse(run.lastTimestamp))) {
      rangeBeforeRun ||= { from: $('range-from').value, to: $('range-to').value };
      $('range-from').value = bangkokDateTime(Date.parse(run.firstTimestamp));
      $('range-to').value = bangkokDateTime(Date.parse(run.lastTimestamp) + 1000);
    } else restoreHistoryRange();
    updateRunFolderButton(); clearRange(); syncAnalysisHistoryControls();
    if (currentTab === 'history' || analysisHistoryActive()) { loadHistory(); if (analysisHistoryActive() && $('history-motor').value) $('load-range').click(); }
  };
  seriesSelect.onchange = () => { clearRange({ keepSeries: true }); $('load-range').click(); };
  new ResizeObserver(() => { if ($('history-chart').clientWidth) drawHistory(); }).observe($('history-chart'));
  $('load-range').onclick = async () => {
    const generation = ++rangeGeneration, motorId = $('history-motor').value;
    rangePanel.dataset.loaded = 'loading';
    $('load-range').disabled = true; $('range-summary').textContent = 'กำลังโหลดจากไฟล์…';
    if(rangeView==='trend-fft')trend.clear('กำลังโหลดค่าต้นฉบับจากไฟล์…');
    try {
      const filter = { motorId, runId: runSelect.value || undefined, seriesKey: seriesSelect.value || undefined, from: `${$('range-from').value}+07:00`, to: `${$('range-to').value}+07:00` };
      const result = check(await (rangeView === 'scatter' ? api.scatterRange({ ...filter, metric:scatter.select.value, limit:1200 }) : rangeView==='trend-fft'?api.trendRange(filter):api.chartRange(filter)));
      if (generation !== rangeGeneration) return;
      rangeFrames = result.rows; rangeReduced = Boolean(result.reduced); rangeGapStarts = result.gapStarts || [];
      rangeSampling = result.sampling || 'all'; rangeCompleteTotal = result.completeTotal ?? result.total;
      seriesSelect.replaceChildren(); (result.series || []).forEach(series => seriesSelect.add(new Option(`${series.label} · ${series.total.toLocaleString()} ค่า`, series.key)));
      seriesSelect.value = result.seriesKey || ''; seriesLabel.hidden = (result.series?.length || 0) < 2;
      // The recording determines its channels/units, even if the motor was edited later.
      const recordedSeries = result.series?.find(series => series.key === result.seriesKey);
      if(result.limitExceeded)throw new Error(`มี ${result.total.toLocaleString()} ค่าต้นฉบับ เกิน ${result.limit.toLocaleString()} ค่า · เลือกช่วงเวลาสั้นลง ไม่มีการลดจุดก่อน FFT`);
      rangeProfile = recordedSeries ? { motorId, sensorModel: recordedSeries.sensorModel, unit: recordedSeries.unit } : rangeFrames.length ? { motorId, sensorModel: rangeFrames[0].channels ? MODEL : 'custom', unit: rangeFrames[0].unit } : null;
      if(rangeView === 'scatter' && rangeProfile?.sensorModel === 'custom'){setHistoryView('lines');clearRange({keepSeries:true});$('load-range').click();return;}
      if(rangeView==='trend-fft'){await trend.loadTrend(rangeFrames,{...rangeProfile,...recordedSeries,motorId});if(generation!==rangeGeneration)return;}
      drawHistory();
      rangePanel.dataset.loaded = 'true';
      const runSummary = recordedSeries?.runId && recordedSeries.runId !== '__legacy__' ? ` · รอบ ${shortIdentity(recordedSeries.runId)}` : recordedSeries?.runId === '__legacy__' ? ' · ข้อมูลเดิมไม่ระบุรอบ' : '';
      const shown = rangeView === 'scatter'||rangeView==='trend-fft' ? rangeFrames.length : historyPlot.frames.length;
      $('range-summary').textContent = `${motorId} · ${result.total.toLocaleString()} รายการ · แสดง ${shown.toLocaleString()} จุด${runSummary}${result.incompleteTotal ? ` · XYZ ไม่ครบ ${result.incompleteTotal.toLocaleString()} รายการ` : ''}${result.series?.length > 1 ? ` · ชุดที่เลือกจาก ${result.series.length} รูปแบบข้อมูล` : ''}${result.reduced || shown < result.rows.length ? rangeView === 'scatter' ? ' · สุ่มตัวอย่างจากรายการที่มี XYZ ครบ' : ' · ลดจุดโดยเก็บค่าสูงสุด/ต่ำสุด' : ''}${result.skipped ? ` · ข้ามบรรทัดเสีย ${result.skipped}` : ''}`;
    } catch (error) { if (generation === rangeGeneration) { rangeFrames = []; rangeProfile = null; rangeGapStarts = []; rangeCompleteTotal = 0;trend.clear(error.message);drawHistory(); scatter.draw(); rangePanel.dataset.loaded = 'false'; $('range-summary').textContent = error.message; } }
    finally { if (generation === rangeGeneration) $('load-range').disabled = false; }
  };
}
function updateGraphWindow() {
  $('graph-count-label').hidden = $('fleet-window').value !== 'custom';
  fleetCards.forEach(refs => { refs.lastKey = ''; }); refreshFleet(); if (!frozen) renderSelected();
}
