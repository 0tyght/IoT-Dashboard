'use strict';
const fleetCards = new Map();
const FLEET_COLORS = ['--x', '--y', '--z'].map(name => getComputedStyle(document.documentElement).getPropertyValue(name).trim());
const fleetVisibility = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const refs = fleetCards.get(entry.target.dataset.fleetId); if (!refs) continue;
    refs.inViewport = entry.isIntersecting;
    if (entry.isIntersecting && currentTab === 'fleet') { refs.lastKey = ''; refreshFleet(); }
  }
}, { root: document.querySelector('main'), rootMargin: '160px' });
function fleetStatus(profile, state) {
  if (profile.enabled === false) return { text: 'พักอ่าน', kind: 'idle' };
  if (mode === 'demo') return { text: 'จำลอง', kind: 'demo' };
  if (mode !== 'live') return { text: 'หยุดอ่าน', kind: 'idle' };
  if (state.status === 'fault') return { text: 'ขัดข้อง', kind: 'fault' };
  if (state.status === 'stale') return { text: 'ข้อมูลเก่า', kind: 'fault' };
  return state.status === 'online' ? { text: 'รับข้อมูล', kind: 'online' } : { text: 'รอข้อมูล', kind: 'idle' };
}
function graphWindow(frames, width = 600) { return Measurements.windowFrames(frames, $('fleet-window').value, $('graph-count').value, width); }
function buildFleet() {
  fleetVisibility.disconnect(); fleetCards.forEach(refs => refs.resizeObserver?.disconnect()); fleetCards.clear(); $('fleet-list').replaceChildren();
  for (const profile of profiles) {
    const card = node('article', null, 'fleet-card fleet-nine'); card.dataset.fleetId = profile.motorId;
    const header = node('header', null, 'fleet-card-header'), identity = node('div', null, 'fleet-identity');
    identity.append(node('h2', profile.name || profile.motorId), node('span', `${profile.motorId} · ${profile.area || 'ไม่ระบุพื้นที่'}`));
    const actions = node('div', null, 'fleet-actions');
    const details = node('button', 'รายละเอียด'), edit = node('button', 'แก้ไข'), toggle = node('button', profile.enabled === false ? 'เปิดอ่าน' : 'พักอ่าน'), remove = node('button', 'ลบ');
    edit.dataset.edit = profile.motorId; toggle.dataset.edit = profile.motorId; remove.dataset.delete = profile.motorId;
    details.setAttribute('aria-label', `รายละเอียด ${profile.motorId}`); edit.setAttribute('aria-label', `แก้ไข ${profile.motorId}`); remove.setAttribute('aria-label', `ลบ ${profile.motorId}`);
    details.onclick = () => selectMotor(profile.motorId); edit.onclick = () => openEditor(profile); toggle.onclick = () => toggleMotor(profile); remove.onclick = () => deleteMotor(profile);
    actions.append(details, edit, toggle, remove); header.append(identity, actions);
    const body = node('div', null, 'fleet-card-body'), readings = node('div', null, 'fleet-readings');
    const connection = node('div', null, 'fleet-connection idle'), connectionText = node('strong', 'หยุดอ่าน');
    connection.append(node('i', null, 'dot'), connectionText, node('small', `${profile.path} / Slave ${profile.slaveId}`));
    const lastTile = node('div', null, 'fleet-last'), age = node('strong', '—'), lastTime = node('small', 'ยังไม่ได้รับข้อมูล');
    lastTile.append(node('small', 'รับล่าสุด'), age, lastTime);
    const valueGrid = node('div', null, 'fleet-measurements'), values = [];
    const threeAxis = profile.sensorModel === MODEL;
    for (const [kind, group] of Object.entries(Measurements.groups)) {
      if (!threeAxis && kind !== 'velocity') continue;
      const row = node('div', null, 'fleet-value-row');
      ['X', 'Y', 'Z'].slice(0, threeAxis ? 3 : 1).forEach((axis, index) => {
        const tile = node('div', null, `fleet-value axis-tile-${index}`), value = node('strong', '—'), number = node('div');
        number.append(value, node('span', threeAxis ? group.unit : profile.unit));
        tile.append(node('small', threeAxis ? `${group.label} ${axis}` : 'Custom value'), number); row.append(tile); values.push({ value, key: threeAxis ? `${kind}${axis}` : 'value' });
      }); valueGrid.append(row);
    }
    if (threeAxis) {
      const row = node('div', null, 'fleet-value-row');
      ['X', 'Y', 'Z'].forEach((axis, index) => {
        const tile = node('div', null, `fleet-value axis-tile-${index}`), value = node('strong', '—'), number = node('div');
        number.append(value, node('span', 'Hz')); tile.append(node('small', `Frequency ${axis}`), number); row.append(tile); values.push({ value, key: `frequency${axis}` });
      }); valueGrid.append(row);
    }
    const footer = node('div', null, 'fleet-reading-footer'), temperature = node('span'), samples = node('span'), storage = node('span');
    const frequencyNote = node('p', null, 'fleet-frequency-note'); frequencyNote.hidden = !threeAxis;
    const cadence = node('p', null, 'fleet-cadence'); footer.append(temperature, samples, storage); readings.append(connection, lastTile, valueGrid, frequencyNote, cadence, footer);
    const trend = node('section', null, 'fleet-trend'), trendHead = node('div', null, 'fleet-trend-heading');
    trendHead.append(node('strong', threeAxis ? 'แนวโน้มทุกช่องวัด' : `Custom value · ${profile.unit}`));
    const coverage = node('span', '', 'graph-coverage'); trendHead.append(coverage);
    const chartBox = node('div', null, 'plot-stack fleet-plots');
    const plotStack = createPlotStack(chartBox, { prefix: `fleet-${profile.motorId}`, label: profile.motorId, tooltipClass: 'fleet-tooltip' });
    const legend = node('div', null, 'fleet-chart-legend');
    if (threeAxis) ['X', 'Y', 'Z'].forEach((axis, index) => { const label = node('span', `แกน ${axis}`); label.prepend(node('i', null, `fleet-line-${index}`)); legend.append(label); });
    trend.append(trendHead, legend, chartBox); body.append(readings, trend); card.append(header, body);
    const problem = node('p', null, 'fleet-problem'); problem.hidden = true; card.append(problem); $('fleet-list').append(card);
    const refs = { card, values, age, lastTime, connection, connectionText, temperature, samples, storage, cadence, problem, plotStack, coverage, frequencyNote, inViewport: false, lastKey: '' };
    refs.redraw = () => {
      const frames = graphWindow(stateFor(profile.motorId).frames, plotStack.svg.clientWidth); plotStack.draw(frames, profile);
      coverage.textContent = `${frames.length.toLocaleString()} ค่า${plotStack.frames.length < frames.length ? ` (${plotStack.frames.length} จุด)` : ''}${frames.length ? ` · ${time(frames[0].timestamp)}–${time(frames.at(-1).timestamp)}` : ''}`;
    };
    fleetCards.set(profile.motorId, refs); fleetVisibility.observe(card);
    refs.resizeObserver = new ResizeObserver(() => { if (currentTab === 'fleet' && refs.inViewport && plotStack.svg.clientWidth > 0) refs.redraw(); }); refs.resizeObserver.observe(chartBox);
  }
  refreshFleet();
}
function refreshFleet() {
  const query = $('motor-search').value.trim().toLowerCase(), filter = $('fleet-filter').value; let online = 0, faults = 0, visible = 0;
  for (const profile of profiles) {
    const refs = fleetCards.get(profile.motorId); if (!refs) continue;
    const state = stateFor(profile.motorId), last = state.frames.at(-1), status = fleetStatus(profile, state);
    if (status.kind === 'online') online++; if (status.kind === 'fault') faults++;
    refs.card.hidden = !`${profile.motorId} ${profile.name} ${profile.area}`.toLowerCase().includes(query) || (filter !== 'all' && (filter === 'disabled' ? profile.enabled !== false : status.kind !== filter));
    if (!refs.card.hidden) visible++;
    refs.card.classList.toggle('fleet-fault', status.kind === 'fault'); refs.card.classList.toggle('fleet-retained', mode === 'offline' || profile.enabled === false);
    refs.problem.hidden = status.kind !== 'fault'; refs.problem.textContent = status.kind === 'fault' ? state.message || 'ไม่ได้รับข้อมูลใหม่ · ตรวจพอร์ตและการตั้งค่าการสื่อสาร' : '';
    refs.values.forEach(({ value, key }) => { value.textContent = digits(key === 'value' ? last?.value : last?.channels?.[key], key === 'value' ? 3 : key.startsWith('frequency') ? 2 : 1); });
    refs.frequencyNote.textContent = frequencySummary(last);
    refs.frequencyNote.dataset.state = last?.frequencyStatus || 'pending';
    refs.connection.className = `fleet-connection ${status.kind}`; refs.connectionText.textContent = status.text;
    refs.temperature.textContent = `อุณหภูมิ ${digits(last?.channels?.temperature)} °C`; refs.samples.textContent = `${state.samples.toLocaleString()} ค่า`;
    refs.storage.textContent = storageLabel(last); refs.storage.classList.toggle('storage-fault', last?.recordingState === 'error');
    refs.lastTime.textContent = last ? timestamp(last.timestamp) : 'ยังไม่ได้รับข้อมูล';
    const actual = last?.actualIntervalMs ?? state.actualIntervalMs;
    refs.cadence.textContent = `ตั้งอ่านทุก ${profile.pollInterval / 1000} s · รับจริง ${Number.isFinite(actual) ? `${(actual / 1000).toFixed(3)} s` : 'รอสองรอบ'} · ตอบกลับ ${last?.elapsedMs ?? '—'} ms`;
    refs.age.textContent = last ? `${Math.max(0, Math.floor((Date.now() - Date.parse(last.timestamp)) / 1000))} s` : '—';
    const key = `${last?.timestamp}|${$('fleet-window').value}|${$('graph-count').value}|${status.kind}`;
    if (currentTab === 'fleet' && refs.inViewport && !refs.card.hidden && refs.lastKey !== key) { refs.lastKey = key; refs.redraw(); }
  }
  $('fleet-total').textContent = profiles.length; $('fleet-online').textContent = online; $('fleet-fault').textContent = faults; $('fleet-disabled').textContent = profiles.filter(profile => profile.enabled === false).length;
  $('fleet-empty').hidden = profiles.length > 0; $('fleet-no-matches').hidden = !profiles.length || visible > 0;
}
