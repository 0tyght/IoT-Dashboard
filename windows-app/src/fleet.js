'use strict';
const fleetCards = new Map();
const FLEET_COLORS = ['#6ed3a3', '#e5bf69', '#67b6e8'];
function fleetStatus(profile, state) {
  if (profile.enabled === false) return { text: 'พักอ่าน', kind: 'idle' };
  if (mode === 'demo') return { text: 'จำลอง', kind: 'demo' };
  if (mode !== 'live') return { text: 'หยุดอ่าน', kind: 'idle' };
  if (state.status === 'fault') return { text: 'ขัดข้อง', kind: 'fault' };
  if (state.status === 'stale') return { text: 'ข้อมูลเก่า', kind: 'fault' };
  return state.status === 'online' ? { text: 'รับข้อมูล', kind: 'online' } : { text: 'รอข้อมูล', kind: 'idle' };
}
function buildFleet() {
  fleetCards.clear(); $('fleet-list').replaceChildren();
  for (const profile of profiles) {
    const card = node('article', null, 'fleet-card'); card.dataset.fleetId = profile.motorId;
    const header = node('header', null, 'fleet-card-header'), identity = node('div', null, 'fleet-identity');
    identity.append(node('h2', profile.name || profile.motorId), node('span', `${profile.motorId} · ${profile.area || 'ไม่ระบุพื้นที่'}`));
    const actions = node('div', null, 'fleet-actions');
    const details = node('button', 'รายละเอียด'), edit = node('button', 'แก้ไข'), toggle = node('button', profile.enabled === false ? 'เปิดอ่าน' : 'พักอ่าน'), remove = node('button', 'ลบ');
    edit.dataset.edit = profile.motorId; toggle.dataset.edit = profile.motorId; remove.dataset.delete = profile.motorId;
    details.setAttribute('aria-label', `รายละเอียด ${profile.motorId}`); edit.setAttribute('aria-label', `แก้ไข ${profile.motorId}`); remove.setAttribute('aria-label', `ลบ ${profile.motorId}`);
    details.onclick = () => selectMotor(profile.motorId);
    edit.onclick = () => openEditor(profile); toggle.onclick = () => toggleMotor(profile); remove.onclick = () => deleteMotor(profile);
    actions.append(details, edit, toggle, remove); header.append(identity, actions);
    const body = node('div', null, 'fleet-card-body'), readings = node('div', null, 'fleet-readings');
    const statusRow = node('div', null, 'fleet-status-row'), axisTiles = [];
    for (const axis of ['X', 'Y', 'Z']) {
      const tile = node('div', null, 'fleet-axis-status idle');
      const caption = node('small', `Velocity ${axis}`), value = node('strong', 'รอข้อมูล');
      tile.append(caption, value); statusRow.append(tile); axisTiles.push({ tile, value });
    }
    const lastTile = node('div', null, 'fleet-last'), age = node('strong', '—'), lastTime = node('small', 'ยังไม่ได้รับข้อมูล');
    lastTile.append(node('small', 'รับข้อมูลล่าสุด'), age, lastTime); statusRow.append(lastTile);
    const valueRow = node('div', null, 'fleet-value-row'), values = [];
    ['X', 'Y', 'Z'].forEach((axis, index) => {
      const tile = node('div', null, `fleet-value axis-tile-${index}`), value = node('strong', '—'), unit = node('span', 'mm/s');
      const number = node('div'); number.append(value, unit); tile.append(node('small', `Velocity ${axis}`), number); valueRow.append(tile); values.push({ value, unit });
    });
    const connection = node('div', null, 'fleet-connection idle'), connectionText = node('strong', 'หยุดอ่าน');
    connection.append(node('small', `${profile.path} / Slave ${profile.slaveId}`), connectionText); valueRow.append(connection);
    const footer = node('div', null, 'fleet-reading-footer'), temperature = node('span', 'Temperature — °C'), samples = node('span', '0 samples'), storage = node('span', 'ยังไม่มีข้อมูล');
    footer.append(temperature, samples, storage); readings.append(statusRow, valueRow, footer);
    const trend = node('section', null, 'fleet-trend'), trendHead = node('div', null, 'fleet-trend-heading');
    trendHead.append(node('h3', 'Velocity X / Y / Z'), node('span', 'mm/s'));
    const chartBox = node('div', null, 'fleet-chart-box'), svg = svgNode('svg', { viewBox: '0 0 680 200', tabindex: 0, role: 'img', 'aria-label': `กราฟ ${profile.motorId} ใช้ลูกศรซ้ายขวาอ่านค่า` });
    const tooltip = node('div', null, 'fleet-tooltip'); tooltip.hidden = true; chartBox.append(svg, tooltip);
    const legend = node('div', null, 'fleet-chart-legend');
    ['X', 'Y', 'Z'].forEach((axis, index) => { const label = node('span', `Velocity ${axis}`); label.prepend(node('i', null, `fleet-line-${index}`)); legend.append(label); });
    trend.append(trendHead, chartBox, legend); body.append(readings, trend); card.append(header, body); $('fleet-list').append(card);
    const refs = { card, axisTiles, values, age, lastTime, connection, connectionText, temperature, samples, storage, svg, tooltip, trendHead, legend, unit: profile.unit, frames: [], hoverIndex: -1, hovering: false, lastKey: '' };
    fleetCards.set(profile.motorId, refs);
    svg.onpointermove = event => { refs.hovering = true; const rect = svg.getBoundingClientRect(); fleetPoint(refs, Math.round(((event.clientX - rect.left) / rect.width * 680 - 48) / 610 * (refs.frames.length - 1))); };
    svg.onpointerleave = () => { refs.hovering = false; tooltip.hidden = true; svg.querySelector('.fleet-crosshair')?.setAttribute('visibility', 'hidden'); };
    svg.onkeydown = event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); fleetPoint(refs, refs.hoverIndex + (event.key === 'ArrowRight' ? 1 : -1)); } };
  }
  refreshFleet();
}
function refreshFleet() {
  const query = $('motor-search').value.trim().toLowerCase();
  let online = 0, faults = 0, visible = 0;
  for (const profile of profiles) {
    const refs = fleetCards.get(profile.motorId); if (!refs) continue;
    const state = stateFor(profile.motorId), last = state.frames.at(-1), status = fleetStatus(profile, state);
    if (status.kind === 'online') online++;
    if (status.kind === 'fault') faults++;
    refs.card.hidden = !`${profile.motorId} ${profile.name} ${profile.area}`.toLowerCase().includes(query);
    if (!refs.card.hidden) visible++;
    refs.card.classList.toggle('fleet-fault', status.kind === 'fault');
    refs.card.title = state.message || '';
    const threeAxis = profile.sensorModel === MODEL;
    refs.axisTiles.forEach(({ tile, value }, index) => {
      tile.className = `fleet-axis-status ${!threeAxis && index > 0 ? 'idle' : status.kind}`;
      value.textContent = !threeAxis && index > 0 ? 'ไม่รองรับ' : status.text;
      tile.querySelector('small').textContent = threeAxis ? `Velocity ${'XYZ'[index]}` : index === 0 ? 'Custom value' : `Axis ${'XYZ'[index]}`;
    });
    refs.values.forEach(({ value, unit }, index) => {
      value.textContent = threeAxis ? digits(last?.channels?.[`velocity${'XYZ'[index]}`], 1) : index === 0 ? digits(last?.value, 3) : '—';
      unit.textContent = threeAxis ? 'mm/s' : index === 0 ? profile.unit : '';
    });
    refs.connection.className = `fleet-connection ${status.kind}`; refs.connectionText.textContent = status.text;
    refs.temperature.textContent = `Temperature ${digits(last?.channels?.temperature)} °C`;
    refs.samples.textContent = `${state.samples} samples`;
    refs.storage.textContent = mode === 'demo' ? 'ข้อมูลจำลอง' : last?.recorded === false ? 'บันทึกไม่สำเร็จ' : last ? 'บันทึกแล้ว' : 'ยังไม่มีข้อมูล';
    refs.lastTime.textContent = last ? time(last.timestamp) : 'ยังไม่ได้รับข้อมูล';
    if (last) { const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(last.timestamp)) / 1000)); refs.age.textContent = seconds < 60 ? `${seconds} วินาที` : `${Math.floor(seconds / 60)} นาที`; }
    else refs.age.textContent = '—';
    const key = `${last?.timestamp}|${$('fleet-window').value}|${threeAxis}`;
    if (refs.lastKey !== key) { refs.lastKey = key; refs.frames = state.frames.slice(-Number($('fleet-window').value)); drawFleetChart(refs, threeAxis); }
  }
  $('fleet-total').textContent = profiles.length; $('fleet-online').textContent = online; $('fleet-fault').textContent = faults; $('fleet-disabled').textContent = profiles.filter(profile => profile.enabled === false).length;
  $('fleet-demo').hidden = mode !== 'demo'; $('fleet-empty').hidden = profiles.length > 0;
  $('fleet-no-matches').hidden = !profiles.length || visible > 0;
}
function drawFleetChart(refs, threeAxis) {
  const { svg, frames } = refs; svg.replaceChildren();
  const series = threeAxis ? ['X', 'Y', 'Z'].map((axis, index) => ({ key: `velocity${axis}`, color: FLEET_COLORS[index] })) : [{ key: 'value', color: FLEET_COLORS[0] }];
  const valueOf = (frame, key) => key === 'value' ? frame.value : frame.channels?.[key];
  const values = series.flatMap(item => frames.map(frame => valueOf(frame, item.key)).filter(Number.isFinite));
  const min = Math.min(0, ...values), max = Math.max(.1, ...values), range = max - min;
  const low = min < 0 ? min - range * .1 : 0, high = max + range * .15;
  const xx = index => 48 + index / Math.max(1, frames.length - 1) * 610, yy = value => 16 + (high - value) / (high - low) * 151;
  for (let index = 0; index <= 4; index++) {
    const y = 16 + index / 4 * 151, value = high - index / 4 * (high - low);
    svg.append(svgNode('line', { x1: 48, x2: 658, y1: y, y2: y, stroke: '#303741', 'stroke-width': 1 }), svgNode('text', { x: 39, y: y + 3, fill: '#98a4b3', 'font-size': 10, 'text-anchor': 'end' }, digits(value, value < 1 ? 2 : 1)));
  }
  for (const item of series) {
    const valid = frames.map((frame, index) => [index, valueOf(frame, item.key)]).filter(([, value]) => Number.isFinite(value));
    const points = valid.map(([index, value]) => `${xx(index)},${yy(value)}`).join(' ');
    if (points) svg.append(svgNode('polyline', { points, fill: 'none', stroke: item.color, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  }
  [0, Math.floor((frames.length - 1) / 2), frames.length - 1].filter((index, position, array) => index >= 0 && array.indexOf(index) === position).forEach(index => svg.append(svgNode('text', { x: xx(index), y: 188, fill: '#98a4b3', 'font-size': 10, 'text-anchor': index === 0 ? 'start' : index === frames.length - 1 ? 'end' : 'middle' }, time(frames[index]?.timestamp))));
  if (!values.length) svg.append(svgNode('text', { x: 350, y: 98, fill: '#7d8998', 'text-anchor': 'middle', 'font-size': 12 }, 'ยังไม่มีข้อมูล'));
  svg.append(svgNode('line', { class: 'fleet-crosshair', x1: 48, x2: 48, y1: 15, y2: 167, stroke: '#bac5d4', 'stroke-dasharray': '3 3', visibility: 'hidden' }));
  refs.trendHead.querySelector('h3').textContent = threeAxis ? 'Velocity X / Y / Z' : 'Custom value';
  refs.trendHead.querySelector('span').textContent = threeAxis ? 'mm/s' : refs.unit || '';
  refs.legend.hidden = !threeAxis;
  if (refs.hovering || document.activeElement === svg) fleetPoint(refs, refs.hoverIndex);
}
function fleetPoint(refs, index) {
  if (!refs.frames.length) return;
  refs.hoverIndex = Math.max(0, Math.min(refs.frames.length - 1, index));
  const frame = refs.frames[refs.hoverIndex], x = 48 + refs.hoverIndex / Math.max(1, refs.frames.length - 1) * 610;
  const crosshair = refs.svg.querySelector('.fleet-crosshair'); crosshair?.setAttribute('x1', x); crosshair?.setAttribute('x2', x); crosshair?.setAttribute('visibility', 'visible');
  refs.tooltip.textContent = `${time(frame.timestamp)}\n${frame.channels ? ['X', 'Y', 'Z'].map(axis => `${axis} ${digits(frame.channels[`velocity${axis}`], 3)}`).join('   ') : digits(frame.value, 3)} ${frame.unit || ''}`;
  refs.tooltip.hidden = false;
}
