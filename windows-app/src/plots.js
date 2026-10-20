'use strict';
function drawSensorPlot(refs, frames, kind = 'velocity', customUnit = '') {
  const { svg, tooltip } = refs;
  refs.frames = Measurements.thinFrames(frames); refs.kind = kind;
  const data = refs.frames, threeAxis = data.some(frame => frame.channels), group = Measurements.groups[kind];
  refs.series = threeAxis ? ['X', 'Y', 'Z'].map((axis, index) => ({ key: `${kind}${axis}`, label: axis, color: FLEET_COLORS[index] })) : [{ key: 'value', label: 'Value', color: FLEET_COLORS[0] }];
  refs.unit = threeAxis ? group.unit : customUnit;
  const width = Math.max(260, svg.clientWidth), height = Math.max(132, svg.clientHeight), left = 48, right = width - 12, top = 14, bottom = height - 28;
  const start = Date.parse(data[0]?.timestamp) || 0, end = Date.parse(data.at(-1)?.timestamp) || start;
  const axisTime = value => end - start >= 86400000 ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : time(value);
  const valueOf = (frame, key) => key === 'value' ? frame.value : frame.channels?.[key];
  const values = refs.series.flatMap(series => data.map(frame => valueOf(frame, series.key)).filter(Number.isFinite));
  let min = 0, max = .1; for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  const span = max - min, low = min < 0 ? min - span * .1 : 0, high = max + span * .15;
  const x = frame => left + (end === start ? .5 : (Date.parse(frame.timestamp) - start) / (end - start)) * (right - left);
  const y = value => top + (high - value) / (high - low) * (bottom - top);
  refs.plot = { width, left, span: right - left, start, end, x };
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.replaceChildren(); tooltip.hidden = true;
  for (let index = 0; index <= 4; index++) {
    const yy = top + index / 4 * (bottom - top), value = high - index / 4 * (high - low);
    svg.append(svgNode('line', { x1: left, x2: right, y1: yy, y2: yy, stroke: '#354354' }), svgNode('text', { x: left - 7, y: yy + 4, fill: '#b7c9e1', 'font-size': 11, 'text-anchor': 'end' }, digits(value, Math.abs(value) < 1 ? 2 : 1)));
  }
  for (const series of refs.series) {
    let points = [], lastValid;
    const flush = () => { if (points.length) svg.append(svgNode('polyline', { points: points.join(' '), fill: 'none', stroke: series.color, 'stroke-width': 1.6, 'stroke-linejoin': 'round' })); points = []; };
    for (const frame of data) {
      const value = valueOf(frame, series.key); if (!Number.isFinite(value)) { flush(); continue; }
      points.push(`${x(frame)},${y(value)}`); lastValid = frame;
    }
    flush(); if (lastValid) svg.append(svgNode('circle', { cx: x(lastValid), cy: y(valueOf(lastValid, series.key)), r: 2.5, fill: series.color }));
  }
  [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((index, pos, indexes) => index >= 0 && index < data.length && indexes.indexOf(index) === pos).forEach(index => svg.append(svgNode('text', { x: x(data[index]), y: height - 7, fill: '#b7c9e1', 'font-size': 11, 'text-anchor': index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle' }, axisTime(data[index].timestamp))));
  if (!values.length) svg.append(svgNode('text', { x: width / 2, y: height / 2, fill: '#b7c9e1', 'font-size': 12, 'text-anchor': 'middle' }, 'ยังไม่มีข้อมูลในช่วงนี้'));
  svg.append(svgNode('line', { class: 'plot-crosshair', x1: left, x2: left, y1: top, y2: bottom, stroke: '#bac5d4', 'stroke-dasharray': '3 3', visibility: 'hidden' }));
  if (refs.hovering || document.activeElement === svg) showPlotPoint(refs, refs.hoverIndex || 0);
}
function showPlotPoint(refs, index) {
  if (!refs.frames?.length) return;
  refs.hoverIndex = Math.max(0, Math.min(refs.frames.length - 1, index)); const frame = refs.frames[refs.hoverIndex], x = refs.plot.x(frame);
  const crosshair = refs.svg.querySelector('.plot-crosshair'); crosshair?.setAttribute('x1', x); crosshair?.setAttribute('x2', x); crosshair?.setAttribute('visibility', 'visible');
  refs.tooltip.textContent = `${timestamp(frame.timestamp)}\n${refs.series.map(series => `${series.label} ${digits(series.key === 'value' ? frame.value : frame.channels?.[series.key])}`).join('   ')} ${refs.unit || ''}`;
  refs.tooltip.hidden = false;
}
function bindPlot(refs) {
  const { svg, tooltip } = refs;
  svg.onpointermove = event => {
    if (!refs.plot || !refs.frames?.length) return; refs.hovering = true;
    const rect = svg.getBoundingClientRect(), pos = (event.clientX - rect.left) / rect.width * refs.plot.width;
    showPlotPoint(refs, Measurements.nearest(refs.frames, refs.plot.start + (pos - refs.plot.left) / refs.plot.span * (refs.plot.end - refs.plot.start)));
  };
  const clear = () => { refs.hovering = false; tooltip.hidden = true; svg.querySelector('.plot-crosshair')?.setAttribute('visibility', 'hidden'); };
  svg.onpointerleave = clear; svg.onblur = clear;
  svg.onkeydown = event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); showPlotPoint(refs, event.key === 'Home' ? 0 : event.key === 'End' ? refs.frames.length - 1 : (refs.hoverIndex || 0) + (event.key === 'ArrowRight' ? 1 : -1)); } };
}
