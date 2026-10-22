'use strict';

const HistoryScatterData = (() => {
  const axes = ['X', 'Y', 'Z'];
  const units = { velocity: 'mm/s', displacement: 'µm', acceleration: 'm/s²' };
  function valueFor(frame, metric, axis) {
    const value = frame?.channels?.[`${metric}${axis}`] ?? frame?.[`${metric}${axis}`];
    return Number.isFinite(value) ? value : null;
  }
  function prepare(frames, { metric = 'velocity', budget = 1200, reduced = false, sampling = '' } = {}) {
    if (!Object.hasOwn(units, metric)) throw new Error('เลือกความเร็ว ระยะกระจัด หรือความเร่งสำหรับกราฟ XYZ');
    if (!Number.isInteger(budget) || budget < 8 || budget > 10000) throw new Error('จำนวนจุดแสดงผลต้องอยู่ระหว่าง 8–10000');
    const timed = frames.filter(frame => Number.isFinite(Date.parse(frame?.timestamp)));
    const complete = timed.map(frame => ({ frame, stamp: Date.parse(frame.timestamp), values: axes.map(axis => valueFor(frame, metric, axis)) })).filter(row => row.values.every(Number.isFinite)).sort((a, b) => a.stamp - b.stamp);
    let low = 0, high = 0;
    for (const row of complete) for (const value of row.values) { low = Math.min(low, value); high = Math.max(high, value); }
    if (low === high) { low = -.5; high = .5; }
    else { const padding = (high - low) * .05; low -= padding; high += padding; }
    const span = high - low, start = complete[0]?.stamp ?? 0, end = complete.at(-1)?.stamp ?? start;
    const chosen = new Set();
    if (complete.length <= budget) complete.forEach((row, index) => chosen.add(index));
    else if (sampling === 'uniform-record-sample') {
      for (let index = 0; index < budget; index++) chosen.add(Math.round(index * (complete.length - 1) / (budget - 1)));
    } else {
      const uniform = Math.max(2, Math.floor(budget * .35));
      for (let index = 0; index < uniform; index++) chosen.add(Math.round(index * (complete.length - 1) / (uniform - 1)));
      const buckets = Math.max(1, Math.floor((budget - uniform) / 6));
      for (let bucket = 0; bucket < buckets; bucket++) {
        const first = Math.floor(bucket * complete.length / buckets), last = Math.floor((bucket + 1) * complete.length / buckets);
        for (let axis = 0; axis < 3; axis++) {
          let min = first, max = first;
          for (let index = first + 1; index < last; index++) { if (complete[index].values[axis] < complete[min].values[axis]) min = index; if (complete[index].values[axis] > complete[max].values[axis]) max = index; }
          chosen.add(min); chosen.add(max);
        }
      }
    }
    const rows = [...chosen].sort((a, b) => a - b).map(index => {
      const row = complete[index];
      return { ...row, sourceIndex: index, x: (row.values[0] - low) / span, y: (row.values[1] - low) / span, z: (row.values[2] - low) / span, timeFraction: end === start ? .5 : (row.stamp - start) / (end - start) };
    });
    return { rows, metric, unit: units[metric], low, high, span, start, end, inputCount: frames.length, sourceCount: timed.length, completeCount: complete.length, excludedCount: timed.length - complete.length, invalidTimeCount: frames.length - timed.length, reduced: Boolean(reduced) || rows.length < complete.length, displayReduced: rows.length < complete.length, sampling };
  }
  function colorFor(fraction) {
    const t = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : .5;
    const start = [0, 123, 141], end = [103, 80, 197];
    return `rgb(${start.map((value, index) => Math.round(value + (end[index] - value) * t)).join(',')})`;
  }
  function selectedRow(data, index) {
    return Number.isInteger(index) && index >= 0 && index < (data?.rows?.length || 0) ? data.rows[index] : null;
  }
  function projection(width, height, rotation = -.65, elevation = .55, zoom = 1) {
    const c = Math.cos(rotation), s = Math.sin(rotation), tilt = Math.sin(elevation), rise = Math.cos(elevation);
    const raw = (x, y, z) => {
      const dx = (x - .5) * 2, dy = (y - .5) * 2, dz = (z - .5) * 2, rx = dx * c - dy * s, ry = dx * s + dy * c;
      return { x: rx, y: ry * tilt - dz * rise, depth: ry * rise + dz * tilt };
    };
    const corners = [0, 1].flatMap(x => [0, 1].flatMap(y => [0, 1].map(z => raw(x, y, z))));
    const xs = corners.map(p => p.x), ys = corners.map(p => p.y), lowX = Math.min(...xs), highX = Math.max(...xs), lowY = Math.min(...ys), highY = Math.max(...ys);
    const scale = Math.max(1, Math.min(Math.max(20, width - 120) / (highX - lowX), Math.max(20, height - 52) / (highY - lowY))) * zoom;
    return (x, y, z) => { const point = raw(x, y, z); return { x: width / 2 + (point.x - (lowX + highX) / 2) * scale, y: height / 2 + (point.y - (lowY + highY) / 2) * scale, depth: point.depth }; };
  }
  function nearestVisible(points, x, y, radius = 14) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || radius <= 0) return null;
    const candidates = points.map(point => ({ point, distance: (point.x - x) ** 2 + (point.y - y) ** 2 })).filter(item => item.distance <= radius * radius);
    const covering = candidates.filter(item => item.distance <= (item.point.radius || 3.5) ** 2).sort((a, b) => b.point.depth - a.point.depth || b.point.rowIndex - a.point.rowIndex);
    if (covering.length) return covering[0].point;
    candidates.sort((a, b) => a.distance - b.distance || b.point.depth - a.point.depth);
    for (const { point } of candidates) {
      const covered = points.some(front => front !== point && (front.depth > point.depth || front.depth === point.depth && front.rowIndex > point.rowIndex) && (front.x - point.x) ** 2 + (front.y - point.y) ** 2 < (front.radius || 3.5) ** 2);
      if (!covered) return point;
    }
    return null;
  }
  return { axes, units, valueFor, prepare, colorFor, selectedRow, projection, nearestVisible };
})();

function createHistoryScatter(anchor, { frames, profile = () => null, reduced = () => false, gapStarts = () => undefined, sampling = () => '', total = () => null }) {
  const view = node('section', null, 'scatter-view'); view.id = 'history-scatter-view'; view.hidden = true;
  const toolbar = node('div', null, 'scatter-toolbar'), metricLabel = node('label', 'ค่าที่แสดง'), select = node('select'); select.id = 'history-scatter-metric';
  for (const [value, label] of [['velocity', 'ความเร็วสั่น · mm/s'], ['displacement', 'ระยะกระจัด · µm'], ['acceleration', 'ความเร่ง · m/s²']]) select.add(new Option(label, value));
  metricLabel.append(select);
  const controls = node('div', null, 'scatter-controls'), zoomOut = node('button', '−'), zoomIn = node('button', '+'), reset = node('button', 'คืนมุมเริ่มต้น'), expand = node('button');
  for (const button of [zoomOut, zoomIn, reset, expand]) button.type = 'button';
  zoomOut.setAttribute('aria-label', 'ซูมกราฟกระจายออก'); zoomIn.setAttribute('aria-label', 'ซูมกราฟกระจายเข้า'); reset.id = 'history-scatter-reset'; expand.id = 'history-scatter-expand';
  controlLabel(expand, 'ขยายกราฟ', 'expand'); expand.setAttribute('aria-controls', view.id); expand.setAttribute('aria-pressed', 'false'); controls.append(zoomOut, zoomIn, reset, expand); toolbar.append(metricLabel, controls);
  const chart = node('div', null, 'scatter-chart'), canvas = document.createElement('canvas'); canvas.id = 'history-scatter-canvas'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img'); chart.append(canvas);
  const readout = node('p', 'เลือกมอเตอร์และช่วงเวลา แล้วโหลดข้อมูล', 'scatter-readout'); readout.id = 'history-scatter-readout'; readout.setAttribute('role', 'status'); readout.setAttribute('aria-live', 'polite'); readout.setAttribute('aria-atomic', 'true');
  const legend = node('div', null, 'scatter-time-legend'), legendStart = node('span'), legendRamp = node('span', null, 'scatter-time-ramp'), legendEnd = node('span'); legendRamp.setAttribute('aria-hidden', 'true'); legend.append(legendStart, legendRamp, legendEnd);
  const sliderLabel = node('label', null, 'scatter-frame'), sliderText = node('span', 'จุดตามเวลา'), slider = document.createElement('input'), output = node('output'); slider.type = 'range'; slider.min = '0'; slider.max = '0'; slider.value = '0'; slider.id = 'history-scatter-frame'; slider.setAttribute('aria-label', 'เลือกจุดกระจายตามเวลา'); sliderLabel.append(sliderText, slider, output);
  const help = node('p', 'ลากแนวนอนเพื่อหมุน แนวตั้งเพื่อปรับมุมก้ม · ชี้/แตะเพื่ออ่านค่า · ←/→ เลือกเวลา · Shift+ลูกศรปรับมุม · +/− ซูม · R คืนมุม', 'scatter-help'); help.id = 'history-scatter-help';
  canvas.title = help.textContent;
  const caption = node('p', 'หนึ่งจุดแทนค่ารวม X/Y/Z ที่บันทึกพร้อมกัน ไม่ใช่ตำแหน่งมอเตอร์หรือสเปกตรัม FFT', 'scatter-caption'); caption.id = 'history-scatter-caption';
  canvas.setAttribute('aria-describedby', `${readout.id} ${help.id} ${caption.id}`); view.append(toolbar, chart, legend, sliderLabel, readout, help, caption); anchor.after(view);
  let rotation = -.65, elevation = .55, zoom = 1, selection = null, pointer = null, data = null, projected = [], scheduled = false, cachedFrames, cachedFrameCount, cachedMetric, cachedReduced, cachedModel, cachedMotorId, cachedSampling;
  const format = value => !Number.isFinite(value) ? '—' : value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 1e7) ? value.toExponential(3) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
  function setReadout() {
    const row = HistoryScatterData.selectedRow(data, selection);
    const text = row ? `${timestamp(row.stamp)} · ${row.values.map((value, index) => `${HistoryScatterData.axes[index]} ${format(value)} ${data.unit}`).join(' · ')}` : data?.completeCount ? `${data.completeCount.toLocaleString()} จุด XYZ ที่ครบในชุดข้อมูล · แสดง ${data.rows.length.toLocaleString()} จุด${data.excludedCount ? ` · ข้าม ${data.excludedCount.toLocaleString()} รายการที่ XYZ ไม่ครบ` : ''}` : cachedModel === 'custom' ? 'ข้อมูล Custom มีเพียงค่าหนึ่งช่อง จึงสร้างจุด XYZ ไม่ได้' : data?.sourceCount ? 'ไม่มีรายการที่มีค่า X/Y/Z ครบในหน่วยนี้' : 'เลือกมอเตอร์และช่วงเวลา แล้วโหลดข้อมูล';
    if (readout.textContent !== text) readout.textContent = text;
    canvas.dataset.selectedTimestamp = row?.frame?.timestamp || ''; canvas.dataset.selectedIndex = row ? String(selection) : '';
    slider.disabled = !data?.rows.length; slider.max = String(Math.max(0, (data?.rows.length || 1) - 1)); slider.value = String(selection ?? Math.max(0, (data?.rows.length || 1) - 1));
    output.textContent = row ? `${selection + 1}/${data.rows.length}` : data?.rows.length ? `${data.rows.length} จุด` : 'ไม่มีจุด';
  }
  function draw() {
    const rect = canvas.getBoundingClientRect(); if (view.hidden || !rect.width || !rect.height) return;
    const input = frames() || [], wasReduced = Boolean(reduced()), selectedProfile = profile(), model = selectedProfile?.sensorModel, motorId = selectedProfile?.motorId, sampleKind = sampling();
    if (!data || cachedFrames !== input || cachedFrameCount !== input.length || cachedMetric !== select.value || cachedReduced !== wasReduced || cachedModel !== model || cachedMotorId !== motorId || cachedSampling !== sampleKind) {
      const matching = model === 'custom' ? [] : motorId ? input.filter(frame => !frame?.motorId || frame.motorId === motorId) : input;
      data = HistoryScatterData.prepare(matching, { metric: select.value, reduced: wasReduced, sampling: sampleKind }); cachedFrames = input; cachedFrameCount = input.length; cachedMetric = select.value; cachedReduced = wasReduced; cachedModel = model; cachedMotorId = motorId; cachedSampling = sampleKind; selection = null;
    }
    const width = rect.width, height = rect.height, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const ctx = canvas.getContext('2d'); if (!ctx) { readout.textContent = 'อุปกรณ์นี้เปิดกราฟ Canvas ไม่ได้ · ใช้กราฟเส้นหรือตารางข้อมูล'; return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); ctx.font = '11px Segoe UI, Tahoma, sans-serif';
    projected = [];
    const project = HistoryScatterData.projection(width, height, rotation, elevation, zoom);
    if (data.rows.length) {
      const line = (a, b, color = '#dde1eb', thickness = 1) => { const from = project(...a), to = project(...b); ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); };
      for (let i = 0; i <= 4; i++) { const t = i / 4; line([t, 0, 0], [t, 1, 0]); line([0, t, 0], [1, t, 0]); line([0, 0, t], [1, 0, t]); line([0, 0, t], [0, 1, t]); line([t, 0, 0], [t, 0, 1]); line([0, t, 0], [0, t, 1]); }
      line([0, 0, 0], [1, 0, 0], '#007b8d', 1.5); line([0, 0, 0], [0, 1, 0], '#3474bb', 1.5); line([0, 0, 0], [0, 0, 1], '#6750c5', 1.5);
      const radius = data.rows.length > 500 ? 2.8 : 3.8;
      projected = data.rows.map((row, rowIndex) => ({ ...project(row.x, row.y, row.z), rowIndex, radius, timeFraction: row.timeFraction })).sort((a, b) => a.depth - b.depth || a.rowIndex - b.rowIndex);
      for (const point of projected) { ctx.beginPath(); ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2); ctx.fillStyle = HistoryScatterData.colorFor(point.timeFraction); ctx.fill(); }
      ctx.fillStyle = '#50596e'; ctx.textAlign = 'center';
      for (const t of [0, .5, 1]) {
        const value = format(data.low + data.span * t), x = project(t, 0, 0), y = project(0, t, 0), z = project(0, 0, t);
        ctx.fillText(value, x.x, x.y + 16); if(t>0){ctx.fillText(value, y.x - 18, y.y + 4); ctx.fillText(value, z.x - 18, z.y + 4);}
      }
      for (const [axis, point] of [['X', project(1.08, 0, 0)], ['Y', project(0, 1.08, 0)], ['Z', project(0, 0, 1.08)]]) { ctx.font = '600 12px Segoe UI, Tahoma, sans-serif'; ctx.fillText(`${axis} · ${data.unit}`, point.x, point.y); }
      const point = selection !== null && projected.find(item => item.rowIndex === selection);
      if (point) { ctx.beginPath(); ctx.arc(point.x, point.y, point.radius + 3, 0, Math.PI * 2); ctx.strokeStyle = '#242b43'; ctx.lineWidth = 2; ctx.stroke(); }
    } else { ctx.fillStyle = '#60687b'; ctx.textAlign = 'center'; ctx.font = '13px Segoe UI, Tahoma, sans-serif'; ctx.fillText(model === 'custom' ? 'ข้อมูลหนึ่งช่อง ไม่สามารถสร้างจุด XYZ' : 'ไม่มีรายการ XYZ ที่ครบในช่วงนี้', width / 2, height / 2); }
    canvas.dataset.recordCount = String(data.rows.length); canvas.dataset.completeCount = String(data.completeCount); canvas.dataset.excludedCount = String(data.excludedCount); canvas.dataset.metric = select.value; canvas.dataset.rotation = String(rotation); canvas.dataset.elevation = String(elevation); canvas.dataset.zoom = String(zoom);
    canvas.setAttribute('aria-label', `กราฟกระจาย XYZ สามมิติ ${select.selectedOptions[0].textContent} ${data.completeCount} จุดที่ครบ หนึ่งจุดแทนรายการบันทึกพร้อมกัน`);
    legendStart.textContent = data.rows.length ? `เริ่ม ${timestamp(data.start)}` : 'ยังไม่มีข้อมูล'; legendEnd.textContent = data.rows.length ? `ล่าสุด ${timestamp(data.end)}` : '';
    const fullCount = total(), sampleSummary = sampleKind === 'uniform-record-sample' ? `แสดงตัวอย่าง ${data.rows.length.toLocaleString()} จุด${Number.isFinite(fullCount) ? ` จาก ${fullCount.toLocaleString()} รายการในตัวกรอง` : ''} · ไม่ใช่ทุกค่าที่บันทึก` : data.reduced ? 'ข้อมูลลดจุด ใช้ดูช่วงค่า ไม่ใช้สรุปความหนาแน่นของข้อมูลทั้งหมด' : 'หนึ่งจุดต่อหนึ่งรายการ XYZ ที่ครบในชุดนี้';
    caption.textContent = `แกน X/Y/Z = ค่ารวมที่วัดพร้อมกัน (${data.unit}) · สีบอกลำดับเวลา ไม่ใช่ความรุนแรง · ${sampleSummary} · ไม่ใช่ตำแหน่งมอเตอร์หรือ FFT${data.invalidTimeCount ? ` · ข้ามเวลาไม่ถูกต้อง ${data.invalidTimeCount} รายการ` : ''}`;
    caption.title = caption.textContent;
    setReadout();
  }
  function scheduleDraw() { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; draw(); }); }
  function pick(event) {
    const rect = canvas.getBoundingClientRect(), point = HistoryScatterData.nearestVisible(projected, event.clientX - rect.left, event.clientY - rect.top);
    const index = point?.rowIndex ?? null;
    if (index !== selection) { selection = index; scheduleDraw(); }
  }
  function resetView() { rotation = -.65; elevation = .55; zoom = 1; selection = null; scheduleDraw(); }
  function changeZoom(factor) { zoom = Math.max(.6, Math.min(2, zoom * factor)); scheduleDraw(); }
  const cancel = event => { if (pointer && (!event || pointer.id === event.pointerId)) { if (canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id); pointer = null; } };
  canvas.onpointerdown = event => { if (event.button !== 0 || !event.isPrimary) return; canvas.focus({ preventScroll: true }); pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, rotation, elevation, moved: false }; canvas.setPointerCapture(event.pointerId); };
  canvas.onpointermove = event => { if (pointer?.id === event.pointerId) { if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) pointer.moved = true; if (pointer.moved) { rotation = pointer.rotation + (event.clientX - pointer.x) * .009; elevation = Math.max(.2, Math.min(1.3, pointer.elevation + (event.clientY - pointer.y) * .006)); scheduleDraw(); } } else if (event.pointerType !== 'touch') pick(event); };
  canvas.onpointerup = event => { if (pointer?.id !== event.pointerId) return; const tap = !pointer.moved; cancel(event); if (tap) pick(event); };
  canvas.onpointercancel = cancel; canvas.onlostpointercapture = () => { pointer = null; };
  canvas.addEventListener('wheel', event => { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1.08 : 1 / 1.08); }, { passive: false });
  canvas.onkeydown = event => {
    if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); changeZoom(event.key === '-' ? 1 / 1.1 : 1.1); return; }
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); resetView(); return; }
    if (event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); if (event.key === 'ArrowLeft') rotation -= .12; if (event.key === 'ArrowRight') rotation += .12; if (event.key === 'ArrowUp') elevation = Math.min(1.3, elevation + .08); if (event.key === 'ArrowDown') elevation = Math.max(.2, elevation - .08); scheduleDraw(); return; }
    if (!data?.rows.length || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); let index = selection ?? data.rows.length - 1;
    if (event.key === 'Home') index = 0; else if (event.key === 'End') index = data.rows.length - 1; else index += ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1;
    selection = Math.max(0, Math.min(data.rows.length - 1, index)); scheduleDraw();
  };
  select.onchange = () => { selection = null; scheduleDraw(); }; slider.oninput = () => { selection = Number(slider.value); scheduleDraw(); };
  zoomOut.onclick = () => changeZoom(1 / 1.15); zoomIn.onclick = () => changeZoom(1.15); reset.onclick = resetView;
  expand.onclick = () => action(() => togglePanelFullscreen(view));
  document.addEventListener('fullscreenchange', () => { const active = document.fullscreenElement === view; controlLabel(expand, active ? 'ย่อกราฟ' : 'ขยายกราฟ', 'expand'); expand.setAttribute('aria-pressed', String(active)); scheduleDraw(); });
  new ResizeObserver(scheduleDraw).observe(chart);
  return { view, canvas, select, slider, draw };
}

if (typeof module !== 'undefined') module.exports = HistoryScatterData;
