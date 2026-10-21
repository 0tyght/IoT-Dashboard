'use strict';
function plotNumber(value) {
  if (!Number.isFinite(value)) return '—';
  return value !== 0 && (Math.abs(value) < .1 || Math.abs(value) >= 10000) ? value.toExponential(2) : digits(value, Math.abs(value) < 10 ? 2 : 1);
}
function drawSensorPlot(refs, frames, kind = 'velocity', customUnit = '') {
  const { svg, tooltip } = refs;
  refs.frames = refs.prepared ? frames : Measurements.thinFrames(frames); refs.kind = kind;
  const data = refs.frames, threeAxis = refs.threeAxis ?? data.some(frame => frame.channels), group = Measurements.groups[kind];
  refs.series = kind === 'temperature' ? [{ key: 'temperature', label: 'อุณหภูมิ', color: FLEET_COLORS[0] }] : threeAxis ? ['X', 'Y', 'Z'].map((axis, index) => ({ key: `${kind}${axis}`, label: axis, color: FLEET_COLORS[index] })) : [{ key: 'value', label: 'Value', color: FLEET_COLORS[0] }];
  refs.unit = kind === 'temperature' ? '°C' : threeAxis ? group.unit : customUnit;
  const width = Math.max(260, svg.clientWidth), height = Math.max(132, svg.clientHeight), left = 62, right = width - 12, top = 14, bottom = height - 28;
  const start = Date.parse(data[0]?.timestamp) || 0, end = Date.parse(data.at(-1)?.timestamp) || start;
  const axisTime = value => end - start >= 86400000 ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : time(value);
  const valueOf = (frame, key) => key === 'value' ? frame.value : frame.channels?.[key];
  const values = refs.series.flatMap(series => data.map(frame => valueOf(frame, series.key)).filter(Number.isFinite));
  let min = 0, max = 0; for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  if (min === 0 && max === 0) max = .1;
  const span = max - min, low = min < 0 ? min - span * .1 : 0, high = max + span * .15;
  const x = frame => left + (end === start ? .5 : (Date.parse(frame.timestamp) - start) / (end - start)) * (right - left);
  const y = value => top + (high - value) / (high - low) * (bottom - top);
  refs.plot = { width, left, span: right - left, start, end, x };
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.replaceChildren(); tooltip.hidden = true;
  for (let index = 0; index <= 4; index++) {
    const yy = top + index / 4 * (bottom - top), value = high - index / 4 * (high - low);
    svg.append(svgNode('line', { x1: left, x2: right, y1: yy, y2: yy, stroke: 'var(--chart-grid)' }), svgNode('text', { x: left - 7, y: yy + 4, fill: 'var(--chart-label)', 'font-size': 11, 'text-anchor': 'end' }, plotNumber(value)));
  }
  for (const series of refs.series) {
    let points = [], lastValid, previous;
    const flush = () => { if (points.length) svg.append(svgNode('polyline', { points: points.join(' '), fill: 'none', stroke: series.color, 'stroke-width': 1.6, 'stroke-linejoin': 'round' })); points = []; };
    for (const frame of data) {
      const value = valueOf(frame, series.key); if (!Number.isFinite(value)) { flush(); previous = null; continue; }
      const interval = frame.pollIntervalMs || refs.pollInterval;
      // Only infer missing polls before thinning; reduced history must not invent gaps.
      if (previous && refs.gapStarts?.has(frame.timestamp)) flush();
      else if (previous && !refs.prepared && interval && Date.parse(frame.timestamp) - Date.parse(previous.timestamp) > interval * 3) flush();
      points.push(`${x(frame)},${y(value)}`); lastValid = frame;
      previous = frame;
    }
    flush(); if (lastValid) svg.append(svgNode('circle', { cx: x(lastValid), cy: y(valueOf(lastValid, series.key)), r: 2.5, fill: series.color }));
  }
  [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((index, pos, indexes) => index >= 0 && index < data.length && indexes.indexOf(index) === pos).forEach(index => svg.append(svgNode('text', { x: x(data[index]), y: height - 7, fill: 'var(--chart-label)', 'font-size': 11, 'text-anchor': index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle' }, axisTime(data[index].timestamp))));
  if (!values.length) svg.append(svgNode('text', { x: width / 2, y: height / 2, fill: 'var(--chart-label)', 'font-size': 12, 'text-anchor': 'middle' }, 'ยังไม่มีข้อมูลในช่วงนี้'));
  svg.append(svgNode('line', { class: 'plot-crosshair', x1: left, x2: left, y1: top, y2: bottom, stroke: 'var(--chart-cursor)', 'stroke-dasharray': '3 3', visibility: 'hidden' }));
  if (refs.hovering || document.activeElement === svg) showPlotPoint(refs, refs.hoverIndex || 0);
}
function showPlotPoint(refs, index, showTooltip = true) {
  if (!refs.frames?.length) return;
  refs.hoverIndex = Math.max(0, Math.min(refs.frames.length - 1, index)); const frame = refs.frames[refs.hoverIndex], x = refs.plot.x(frame);
  const crosshair = refs.svg.querySelector('.plot-crosshair'); crosshair?.setAttribute('x1', x); crosshair?.setAttribute('x2', x); crosshair?.setAttribute('visibility', 'visible');
  refs.tooltip.textContent = `${timestamp(frame.timestamp)}\n${refs.series.map(series => `${series.label} ${plotNumber(series.key === 'value' ? frame.value : frame.channels?.[series.key])}`).join('   ')} ${refs.unit || ''}`;
  refs.tooltip.hidden = !showTooltip;
  if (refs.readout) refs.readout.replaceChildren(...refs.series.map(series => {
    const item = node('span', `${series.label} ${plotNumber(series.key === 'value' ? frame.value : frame.channels?.[series.key])}`); item.style.color = series.color; return item;
  }), document.createTextNode(` ${refs.unit || ''}`));
}
function bindPlot(refs) {
  const { svg, tooltip } = refs;
  svg.onpointermove = event => {
    if (!refs.plot || !refs.frames?.length) return; refs.hovering = true;
    const rect = svg.getBoundingClientRect(), pos = (event.clientX - rect.left) / rect.width * refs.plot.width;
    (refs.onPoint || (index => showPlotPoint(refs, index)))(Measurements.nearest(refs.frames, refs.plot.start + (pos - refs.plot.left) / refs.plot.span * (refs.plot.end - refs.plot.start)));
  };
  const clear = () => { refs.hovering = false; tooltip.hidden = true; svg.querySelector('.plot-crosshair')?.setAttribute('visibility', 'hidden'); refs.onClear?.(); };
  svg.onpointerleave = clear; svg.onblur = clear;
  svg.onkeydown = event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); (refs.onPoint || (index => showPlotPoint(refs, index)))(event.key === 'Home' ? 0 : event.key === 'End' ? refs.frames.length - 1 : (refs.hoverIndex || 0) + (event.key === 'ArrowRight' ? 1 : -1)); } };
}

// All measurement families share a time domain, but retain their own units/scales.
function createPlotStack(container, { prefix, label = '', tooltipClass = 'chart-tooltip' }) {
  const plots = [], grid = node('div', null, 'plot-stack-grid');
  const cursorTime = node('p', 'ชี้กราฟหรือใช้ปุ่มลูกศรเพื่อเทียบเวลา · UTC+07:00', 'plot-cursor-time');
  const note = node('p', 'แต่ละกราฟใช้สเกลตามหน่วยของตัวเอง · เวลาคือเวลาคอมพิวเตอร์รับข้อมูล', 'plot-note');
  container.replaceChildren(cursorTime, grid, note);
  for (const [kind, group] of Object.entries(Measurements.groups)) {
    const section = node('section', null, 'measurement-plot'); section.dataset.kind = kind;
    const heading = node('div', null, 'measurement-plot-heading'), title = node('h3'), readout = node('span', '—', 'plot-readout');
    heading.append(title, readout);
    const box = node('div', null, 'fleet-chart-box chart-wrap'), svg = svgNode('svg', { id: kind === 'velocity' ? `${prefix}-chart` : `${prefix}-${kind}-chart`, tabindex: 0, role: 'img', 'aria-label': `${label} ${group.label} ${group.unit} ใช้ลูกศรซ้ายขวาเพื่ออ่านค่า` });
    const tooltip = node('div', null, tooltipClass); tooltip.id = kind === 'velocity' ? `${prefix === 'trend' ? 'chart' : prefix}-tooltip` : `${prefix}-${kind}-tooltip`; tooltip.hidden = true;
    box.append(svg, tooltip); section.append(heading, box); grid.append(section);
    const refs = { svg, tooltip, section, title, readout, kind, frames: [], prepared: true, hoverIndex: 0 };
    plots.push(refs); bindPlot(refs);
    refs.onPoint = index => {
      if (!refs.frames.length) return;
      const stamp = refs.frames[Math.max(0, Math.min(refs.frames.length - 1, index))].timestamp;
      stack.cursorStamp = stamp; stack.source = refs;
      cursorTime.textContent = `เวลา ${timestamp(stamp)}`;
      for (const plot of plots.filter(plot => !plot.section.hidden)) showPlotPoint(plot, Measurements.nearest(plot.frames, Date.parse(stamp)), plot === refs);
    };
    refs.onClear = () => {
      stack.cursorStamp = null; stack.source = null;
      for (const plot of plots) { plot.tooltip.hidden = true; plot.svg.querySelector('.plot-crosshair')?.setAttribute('visibility', 'hidden'); }
      updateLatest();
    };
  }
  function updateLatest() {
    const last = stack.frames.at(-1);
    cursorTime.textContent = last ? `ล่าสุด ${timestamp(last.timestamp)}` : 'ยังไม่มีข้อมูล · UTC+07:00';
    for (const plot of plots) {
      if (last) { showPlotPoint(plot, plot.frames.length - 1, false); plot.svg.querySelector('.plot-crosshair')?.setAttribute('visibility', 'hidden'); }
      else plot.readout.textContent = '—';
    }
  }
  const stack = { plots, frames: [], svg: plots[0].svg, cursorStamp: null, source: null,
    draw(frames, profile, { reduced = false } = {}) {
      const threeAxis = profile?.sensorModel === MODEL, gaps = new Set();
      container.dataset.channelMode = threeAxis ? 'three-axis' : 'custom';
      // Compute gaps on original samples; drawing fewer points must not look like an outage.
      if (!reduced) for (let i = 1; i < frames.length; i++) {
        const interval = frames[i].pollIntervalMs || profile?.pollInterval;
        if (interval && Date.parse(frames[i].timestamp) - Date.parse(frames[i - 1].timestamp) > interval * 3) gaps.add(frames[i].timestamp);
      }
      // Preserve both sides of a gap when thinning so a line never bridges it.
      const selected = new Set(Measurements.thinFrames(frames));
      if (gaps.size) frames.forEach((frame, i) => { if (gaps.has(frame.timestamp)) { selected.add(frame); selected.add(frames[i - 1]); } });
      stack.frames = [...selected].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      for (const plot of plots) {
        plot.section.hidden = !threeAxis && plot.kind !== 'velocity'; plot.threeAxis = threeAxis;
        plot.title.textContent = !threeAxis ? `Custom value · ${profile?.unit || '—'}` : `${({ velocity: 'ความเร็ว', displacement: 'การกระจัด', acceleration: 'ความเร่ง', temperature: 'อุณหภูมิ' })[plot.kind]} · ${plot.kind === 'temperature' ? '°C' : Measurements.groups[plot.kind].unit}`;
        plot.svg.setAttribute('aria-label', `${label} ${plot.title.textContent} ใช้ลูกศรซ้ายขวาเพื่ออ่านค่า`);
        plot.gapStarts = gaps;
        if (!plot.section.hidden) drawSensorPlot(plot, stack.frames, plot.kind, profile?.unit);
      }
      if (stack.cursorStamp && stack.source?.frames.length) stack.source.onPoint(Measurements.nearest(stack.frames, Date.parse(stack.cursorStamp)));
      else updateLatest();
      note.textContent = `แต่ละกราฟใช้สเกลตามหน่วยของตัวเอง · ${gaps.size ? `เส้นขาด ${gaps.size} ช่วง (ห่างเกิน 3 รอบอ่าน)` : reduced ? 'ลดจุดจากไฟล์แล้ว จึงไม่ประเมินช่วงข้อมูลขาด' : 'เส้นขาดเมื่อห่างเกิน 3 รอบอ่าน'} · เวลาคอมพิวเตอร์รับข้อมูล`;
    }
  };
  return stack;
}
