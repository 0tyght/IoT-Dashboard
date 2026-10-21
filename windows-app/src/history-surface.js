'use strict';

const HistorySurfaceData = (() => {
  const axes = ['X', 'Y', 'Z'];
  const units = { velocity: 'mm/s', displacement: 'µm', acceleration: 'm/s²', frequency: 'Hz' };
  const keys = ['value', 'temperature', ...Object.keys(units).flatMap(metric => axes.map(axis => `${metric}${axis}`))];
  function valueFor(frame, metric, axis) {
    if (metric === 'frequency' && frame?.frequencyStatus !== 'ok') return null;
    const value = frame?.channels?.[`${metric}${axis}`] ?? frame?.[`${metric}${axis}`];
    return Number.isFinite(value) ? value : null;
  }
  function prepare(frames, { metric = 'velocity', budget = 360, reduced = false, gapStarts, pollInterval } = {}) {
    const rows = frames.filter(frame => Number.isFinite(Date.parse(frame?.timestamp))).map(frame => ({ frame, stamp: Date.parse(frame.timestamp), values: axes.map(axis => valueFor(frame, metric, axis)), segments: [] })).sort((a, b) => a.stamp - b.stamp);
    const gapsKnown = Array.isArray(gapStarts), knownGaps = gapsKnown ? gapStarts.map(Date.parse).filter(Number.isFinite).sort((a, b) => a - b) : [];
    let gapIndex = 0, gapCount = 0;
    const segments = [0, 0, 0];
    rows.forEach((row, index) => {
      const previous = rows[index - 1]; let gap = false;
      if (previous) {
        while (gapIndex < knownGaps.length && knownGaps[gapIndex] <= previous.stamp) gapIndex++;
        gap = gapIndex < knownGaps.length && knownGaps[gapIndex] <= row.stamp;
        const interval = row.frame.pollIntervalMs || previous.frame.pollIntervalMs || pollInterval;
        if (!reduced && Number.isFinite(interval) && interval > 0 && row.stamp - previous.stamp > interval * 3) gap = true;
      }
      if (gap) gapCount++;
      axes.forEach((axis, axisIndex) => {
        if (gap || !previous || !Number.isFinite(previous.values[axisIndex]) || !Number.isFinite(row.values[axisIndex])) segments[axisIndex]++;
        row.segments[axisIndex] = Number.isFinite(row.values[axisIndex]) ? segments[axisIndex] : null;
      });
    });
    // Keep the extrema of every recorded channel, including channels not currently selected.
    const selected = new Set();
    if (rows.length <= budget) rows.forEach((row, index) => selected.add(index));
    else {
      const bucketSize = Math.ceil(rows.length / Math.max(1, Math.floor(budget / (keys.length * 2 + 2))));
      for (let offset = 0; offset < rows.length; offset += bucketSize) {
        const end = Math.min(rows.length, offset + bucketSize); selected.add(offset); selected.add(end - 1);
        for (const key of keys) {
          let min = Infinity, max = -Infinity, low = -1, high = -1;
          for (let index = offset; index < end; index++) {
            const frame = rows[index].frame;
            if (key.startsWith('frequency') && frame.frequencyStatus !== 'ok') continue;
            const value = frame[key] ?? frame.channels?.[key];
            if (!Number.isFinite(value)) continue;
            if (value < min) { min = value; low = index; } if (value > max) { max = value; high = index; }
          }
          if (low >= 0) selected.add(low); if (high >= 0) selected.add(high);
        }
      }
    }
    const visibleRows = [...selected].sort((a, b) => a - b).map(index => rows[index]);
    let low = 0, high = 0, valueCount = 0;
    for (const row of rows) for (const value of row.values) if (Number.isFinite(value)) { low = Math.min(low, value); high = Math.max(high, value); valueCount++; }
    if (low === high) { low -= 1; high += 1; }
    const start = rows[0]?.stamp ?? 0, end = rows.at(-1)?.stamp ?? start, center = (low + high) / 2, span = high - low;
    visibleRows.forEach(row => { row.x = end === start ? .5 : (row.stamp - start) / (end - start); row.z = row.values.map(value => Number.isFinite(value) ? (value - center) / span : null); });
    return { rows: visibleRows, sourceCount: rows.length, valueCount, displayedValues: visibleRows.reduce((count, row) => count + row.values.filter(Number.isFinite).length, 0), low, high, center, span, start, end, gapCount, reduced: reduced || visibleRows.length < rows.length, gapsKnown: !reduced || gapsKnown, metric, unit: units[metric] || '' };
  }
  function projection(width, height, rotation, zoom = 1) {
    const cos = Math.cos(rotation), sin = Math.sin(rotation), raw = (x, y, z) => {
      const dx = (x - .5) * 2, dy = y * 2 - 1, rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
      return { x: rx - ry * .12, y: rx * .2 + ry * .43 - z * .7, depth: rx * .084 + ry * .7 + z * .454 };
    };
    const corners = [0, 1].flatMap(x => [0, 1].flatMap(y => [-.5, .5].map(z => raw(x, y, z))));
    const xs = corners.map(point => point.x), ys = corners.map(point => point.y), left = 58, top = 28, availableWidth = Math.max(40, width - 116), availableHeight = Math.max(40, height - 82);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(availableWidth / (maxX - minX), availableHeight / (maxY - minY)) * .92 * zoom;
    const centerX = left + availableWidth / 2, centerY = top + availableHeight / 2;
    return (x, y, z) => { const point = raw(x, y, z); return { x: centerX + (point.x - (minX + maxX) / 2) * scale, y: centerY + (point.y - (minY + maxY) / 2) * scale, depth: point.depth }; };
  }
  function nearestProjected(points, x, y, radius = 20) {
    let found = null, best = radius * radius;
    for (const point of points) {
      const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (distance < best || (distance === best && point.depth > (found?.depth ?? -Infinity))) { found = point; best = distance; }
    }
    return found;
  }
  return { axes, units, valueFor, prepare, projection, nearestProjected };
})();

function createHistorySurface(container, { frames, profile = () => null, reduced = () => false, gapStarts = () => undefined }) {
  const view = node('section', null, 'history-surface-view'); view.id = 'history-3d-view'; view.hidden = true;
  const toolbar = node('div', null, 'history-surface-toolbar'), label = node('label', 'ค่าที่แสดง'), select = node('select'); select.id = 'history-surface-metric';
  for (const [value, title] of [['velocity', 'ความเร็วสั่น · mm/s'], ['displacement', 'ระยะกระจัด · µm'], ['acceleration', 'ความเร่ง · m/s²'], ['frequency', 'ความถี่ · Hz']]) select.add(new Option(title, value));
  label.append(select);
  const controls = node('div', null, 'surface-view-controls'), zoomOut = node('button', '−'), zoomIn = node('button', '+'), reset = node('button', 'คืนมุมเริ่มต้น'), expand = node('button');
  zoomOut.type = zoomIn.type = reset.type = expand.type = 'button'; zoomOut.setAttribute('aria-label', 'ซูมกราฟออก'); zoomIn.setAttribute('aria-label', 'ซูมกราฟเข้า'); reset.id = 'history-surface-reset'; expand.id = 'history-surface-expand';
  controlLabel(expand, 'ขยายกราฟ 3D', 'expand'); expand.setAttribute('aria-controls', view.id); expand.setAttribute('aria-pressed', 'false'); controls.append(zoomOut, zoomIn, reset, expand);
  const legend = node('div', null, 'surface-axis-legend');
  HistorySurfaceData.axes.forEach((axis, index) => { const item = node('span', axis); item.style.setProperty('--axis-color', `var(--${axis.toLowerCase()})`); legend.append(item); });
  toolbar.append(label, controls, legend);
  const canvas = document.createElement('canvas'); canvas.id = 'history-surface-canvas'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
  const readout = node('p', null, 'surface-readout'); readout.id = 'history-surface-readout'; readout.setAttribute('role', 'status'); readout.setAttribute('aria-live', 'polite'); readout.setAttribute('aria-atomic', 'true');
  const help = node('p', 'ลากเพื่อหมุน · ชี้หรือแตะจุดเพื่ออ่านค่า · ←/→ เปลี่ยนเวลา · ↑/↓ เปลี่ยนแกน · Shift+←/→ หมุน · +/− ซูม · R คืนมุม', 'surface-help'); help.id = 'history-surface-help';
  const caption = node('p', null, 'surface-caption'); caption.id = 'history-surface-caption';
  canvas.setAttribute('aria-describedby', `${readout.id} ${help.id} ${caption.id}`);
  const chart = node('div', null, 'history-surface-chart'); chart.append(canvas); view.append(toolbar, chart, readout, help, caption); container.after(view);
  let rotation = -.62, zoom = 1, pointer = null, selection = null, data = null, projected = [], cachedFrames, cachedMetric, cachedReduced, cachedGaps, cachedInterval;
  const format = value => !Number.isFinite(value) ? '—' : value !== 0 && Math.abs(value) < .01 ? value.toExponential(2) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
  const summary = () => !data?.valueCount ? select.value === 'frequency' ? 'ไม่มีค่าความถี่ที่ยืนยันแล้วในช่วงนี้' : 'ไม่มีข้อมูลของหน่วยนี้ในช่วงที่เลือก' : `${data.sourceCount.toLocaleString()} เวลา · ${data.valueCount.toLocaleString()} ค่าที่อ่านได้ · วาด ${data.rows.length.toLocaleString()} เวลา${data.reduced ? ' (ลดจุดโดยเก็บค่าสูงสุด/ต่ำสุด)' : ''} · ${timestamp(data.start)} ถึง ${timestamp(data.end)}`;
  function setReadout() {
    const row = selection && data?.rows[selection.rowIndex];
    const text = row ? `${timestamp(row.stamp)} · แกน ${HistorySurfaceData.axes[selection.axisIndex]} · ${row.values.map((value, index) => `${HistorySurfaceData.axes[index]} ${format(value)}`).join(' · ')} ${data.unit}` : summary();
    if (readout.textContent !== text) readout.textContent = text;
    canvas.dataset.selectedTimestamp = row?.frame.timestamp || ''; canvas.dataset.selectedAxis = row ? HistorySurfaceData.axes[selection.axisIndex] : '';
  }
  function draw() {
    const rect = canvas.getBoundingClientRect(); if (view.hidden || !rect.width || !rect.height) return;
    const input = frames(), wasReduced = Boolean(reduced()), gaps = gapStarts(), interval = profile()?.pollInterval;
    if (!data || cachedFrames !== input || cachedMetric !== select.value || cachedReduced !== wasReduced || cachedGaps !== gaps || cachedInterval !== interval) {
      data = HistorySurfaceData.prepare(input, { metric: select.value, reduced: wasReduced, gapStarts: gaps, pollInterval: interval });
      cachedFrames = input; cachedMetric = select.value; cachedReduced = wasReduced; cachedGaps = gaps; cachedInterval = interval; selection = null;
    }
    const width = rect.width, height = rect.height, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const context = canvas.getContext('2d'); if (!context) { readout.textContent = 'อุปกรณ์นี้เปิดกราฟ Canvas ไม่ได้ · ใช้กราฟเส้นหรือตารางข้อมูล'; return; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    const project = HistorySurfaceData.projection(width, height, rotation, zoom), zero = -data.center / data.span;
    const style = getComputedStyle(document.documentElement), muted = style.getPropertyValue('--muted').trim() || '#666', lineColor = style.getPropertyValue('--line').trim() || '#ddd', colors = ['--x', '--y', '--z'].map(key => style.getPropertyValue(key).trim());
    function line(a, b, color, thickness = 1) { context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.strokeStyle = color; context.lineWidth = thickness; context.stroke(); }
    for (let tick = 0; tick <= 4; tick++) { const x = tick / 4; line(project(x, 0, zero), project(x, 1, zero), lineColor); }
    for (const y of [0, .5, 1]) line(project(0, y, zero), project(1, y, zero), lineColor);
    projected = [];
    const positions = data.rows.map((row, rowIndex) => row.z.map((z, axisIndex) => {
      if (!Number.isFinite(z)) return null;
      const point = { ...project(row.x, axisIndex / 2, z), rowIndex, axisIndex, stamp: row.stamp, value: row.values[axisIndex] }; projected.push(point); return point;
    }));
    const triangles = [];
    for (let index = 0; index < data.rows.length - 1; index++) for (let axis = 0; axis < 2; axis++) {
      const current = data.rows[index], next = data.rows[index + 1];
      if (![axis, axis + 1].every(key => current.segments[key] !== null && current.segments[key] === next.segments[key])) continue;
      const corners = [positions[index][axis], positions[index + 1][axis], positions[index][axis + 1], positions[index + 1][axis + 1]];
      if (!corners.every(Boolean)) continue;
      for (const indices of [[0, 1, 2], [1, 3, 2]]) {
        const points = indices.map(key => corners[key]);
        triangles.push({ points, depth: points.reduce((sum, point) => sum + point.depth, 0) / 3, value: points.reduce((sum, point) => sum + point.value, 0) / 3 });
      }
    }
    triangles.sort((a, b) => a.depth - b.depth);
    for (const triangle of triangles) {
      const fraction = (triangle.value - data.low) / data.span, hue = 230 - fraction * 230;
      context.beginPath(); context.moveTo(triangle.points[0].x, triangle.points[0].y); triangle.points.slice(1).forEach(point => context.lineTo(point.x, point.y)); context.closePath(); context.fillStyle = `hsl(${hue} 72% 49% / .72)`; context.fill();
    }
    // Independent axis paths and points retain valid channels beside a missing neighbour.
    data.rows.forEach((row, rowIndex) => row.values.forEach((value, axisIndex) => {
      const point = positions[rowIndex][axisIndex]; if (!point) return;
      const previous = rowIndex > 0 && positions[rowIndex - 1][axisIndex];
      if (previous && row.segments[axisIndex] === data.rows[rowIndex - 1].segments[axisIndex]) line(previous, point, colors[axisIndex], 1.4);
      context.beginPath(); context.arc(point.x, point.y, data.rows.length === 1 ? 4 : 1.5, 0, Math.PI * 2); context.fillStyle = colors[axisIndex]; context.fill();
    }));
    context.font = '11px Segoe UI, sans-serif'; context.fillStyle = muted; context.textAlign = 'center';
    const tickFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    for (const tick of [0, .5, 1]) { const point = project(tick, 0, zero); context.fillText(data.sourceCount ? tickFormat.format(data.start + tick * (data.end - data.start)) : '', point.x, point.y + 20); }
    context.textAlign = 'right'; ['X', 'Y', 'Z'].forEach((axis, index) => { const point = project(0, index / 2, zero); context.fillText(axis, point.x - 10, point.y + 4); });
    const zStart = project(1, 1, -.5), zEnd = project(1, 1, .5); line(zStart, zEnd, muted);
    context.textAlign = 'left'; [data.low, data.center, data.high].forEach((value, index) => { const point = project(1, 1, index / 2 - .5); context.fillText(format(value), point.x + 6, point.y + 4); });
    const selected = selection && positions[selection.rowIndex]?.[selection.axisIndex];
    if (selected) { context.beginPath(); context.arc(selected.x, selected.y, 6, 0, Math.PI * 2); context.strokeStyle = '#252b44'; context.lineWidth = 2; context.stroke(); context.beginPath(); context.arc(selected.x, selected.y, 3, 0, Math.PI * 2); context.fillStyle = '#fff'; context.fill(); }
    if (!data.valueCount) { context.fillStyle = muted; context.textAlign = 'center'; context.font = '13px Segoe UI, sans-serif'; context.fillText(data.sourceCount ? 'ไม่มีค่าที่ยืนยันแล้วของหน่วยนี้' : 'เลือกมอเตอร์และช่วงเวลา แล้วโหลดข้อมูล', width / 2, height / 2); }
    canvas.dataset.recordCount = data.rows.length; canvas.dataset.valueCount = data.displayedValues; canvas.dataset.metric = select.value; canvas.dataset.rotation = rotation; canvas.dataset.zoom = zoom;
    canvas.setAttribute('aria-label', `กราฟย้อนหลังสามมิติ ${select.selectedOptions[0].textContent} ${data.sourceCount} เวลา ใช้ปุ่มลูกศรเลือกเวลาและแกนวัด`);
    caption.textContent = `แกนนอน = เวลาจริง · แกนลึก = X/Y/Z · ความสูง/สี = ค่า ${data.unit} ตามสเกลช่วงนี้ · ${data.gapCount ? `เว้น ${data.gapCount} ช่วงข้อมูลขาด` : !data.gapsKnown ? 'ข้อมูลลดจุดรุ่นเดิม ไม่ยืนยันความต่อเนื่องระหว่างจุด' : 'ไม่เชื่อมข้ามค่าที่ขาด'} · ไม่ใช่ FFT`;
    setReadout();
  }
  function pick(event) {
    const rect = canvas.getBoundingClientRect(), nearest = HistorySurfaceData.nearestProjected(projected, event.clientX - rect.left, event.clientY - rect.top);
    const next = nearest ? { rowIndex: nearest.rowIndex, axisIndex: nearest.axisIndex } : null;
    if (next?.rowIndex !== selection?.rowIndex || next?.axisIndex !== selection?.axisIndex) { selection = next; draw(); }
  }
  function cancelPointer(event) { if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id); pointer = null; }
  canvas.onpointerdown = event => { if (event.button !== 0 || !event.isPrimary) return; canvas.focus({ preventScroll: true }); pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, rotation, moved: false }; canvas.setPointerCapture(event.pointerId); };
  canvas.onpointermove = event => {
    if (pointer?.id === event.pointerId) { if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) pointer.moved = true; if (pointer.moved) { rotation = pointer.rotation + (event.clientX - pointer.x) * .009; selection = null; draw(); } }
    else if (event.pointerType !== 'touch') pick(event);
  };
  canvas.onpointerup = event => { if (pointer?.id !== event.pointerId) return; const tap = !pointer.moved; cancelPointer(event); if (tap) pick(event); };
  canvas.onpointercancel = cancelPointer; canvas.onlostpointercapture = () => { pointer = null; };
  const changeZoom = factor => { zoom = Math.max(.65, Math.min(2, zoom * factor)); draw(); };
  const resetView = () => { rotation = -.62; zoom = 1; selection = null; draw(); };
  zoomIn.onclick = () => changeZoom(1.15); zoomOut.onclick = () => changeZoom(1 / 1.15); reset.onclick = resetView;
  canvas.onwheel = event => { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1.08 : 1 / 1.08); };
  canvas.onkeydown = event => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(1.1); return; }
    if (event.key === '-') { event.preventDefault(); changeZoom(1 / 1.1); return; }
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); resetView(); return; }
    if (event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); rotation += event.key === 'ArrowLeft' ? -.12 : .12; draw(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !data?.rows.length) return;
    event.preventDefault();
    let rowIndex = selection?.rowIndex ?? data.rows.length - 1, axisIndex = selection?.axisIndex ?? 0;
    if (event.key === 'Home') rowIndex = 0; else if (event.key === 'End') rowIndex = data.rows.length - 1;
    else if (event.key === 'ArrowLeft') rowIndex--; else if (event.key === 'ArrowRight') rowIndex++;
    else axisIndex += event.key === 'ArrowUp' ? -1 : 1;
    selection = { rowIndex: Math.max(0, Math.min(data.rows.length - 1, rowIndex)), axisIndex: Math.max(0, Math.min(2, axisIndex)) }; draw();
  };
  select.onchange = () => { selection = null; draw(); };
  expand.onclick = () => action(() => togglePanelFullscreen(view));
  document.addEventListener('fullscreenchange', () => {
    const expanded = document.fullscreenElement === view;
    controlLabel(expand, expanded ? 'ย่อกราฟ 3D' : 'ขยายกราฟ 3D', 'expand'); expand.setAttribute('aria-pressed', String(expanded));
    requestAnimationFrame(draw);
  });
  new ResizeObserver(draw).observe(chart);
  return { view, canvas, select, draw };
}

if (typeof module !== 'undefined') module.exports = HistorySurfaceData;
