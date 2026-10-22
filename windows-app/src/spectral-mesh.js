'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpectralMesh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fail(message) { throw new Error(message); }
  function number(value) { return typeof value === 'number' && Number.isFinite(value); }
  function budget(value, name) { if (!Number.isInteger(value) || value < 2 || value > 4096) fail(`${name} ต้องเป็นจำนวนเต็ม 2–4096`); return value; }
  function array(value) { return Array.isArray(value) || ArrayBuffer.isView(value) && !(value instanceof DataView); }
  function evenly(count, wanted) {
    const result = new Set();
    if (!count) return result;
    const total = Math.min(count, wanted);
    for (let i = 0; i < total; i++) result.add(Math.round(i * (count - 1) / Math.max(1, total - 1)));
    return result;
  }
  function prepare(spectrum, { metric = 'amplitude', selectedFrame = 0, maxFrequencyHz, maxFrames = 80, maxBins = 240 } = {}) {
    if (!spectrum || !array(spectrum.frequencies) || !Array.isArray(spectrum.frames)) fail('Spectrum ต้องมี frequencies และ frames');
    if (!['amplitude', 'psd'].includes(metric)) fail('Metric ต้องเป็น amplitude หรือ psd');
    budget(maxFrames, 'maxFrames'); budget(maxBins, 'maxBins');
    if (!Number.isInteger(selectedFrame)) fail('selectedFrame ต้องเป็นจำนวนเต็ม');
    if (maxFrequencyHz !== undefined && (!number(maxFrequencyHz) || maxFrequencyHz < 0)) fail('maxFrequencyHz ต้องเป็นค่าความถี่ตั้งแต่ 0');
    const frequencies = spectrum.frequencies, frames = spectrum.frames;
    for (let bin = 0; bin < frequencies.length; bin++) if (!number(frequencies[bin]) || frequencies[bin] < 0 || bin && frequencies[bin] <= frequencies[bin - 1]) fail('Frequency bins ต้องเรียงเพิ่มขึ้นและมีค่าจำกัด');
    let eligible = frequencies.length;
    if (maxFrequencyHz !== undefined) { eligible = 0; while (eligible < frequencies.length && frequencies[eligible] <= maxFrequencyHz) eligible++; }
    const key = metric === 'psd' ? 'psd' : 'amplitudes';
    const maxima = new Float64Array(eligible), frameMaxima = new Float64Array(frames.length);
    let maxValue = 0;
    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi], list = frame?.[key];
      if (!number(frame?.timeSeconds) || fi && frame.timeSeconds <= frames[fi - 1].timeSeconds) fail('Frame times ต้องเรียงเพิ่มขึ้นและมีค่าจำกัด');
      if (!array(list) || list.length !== frequencies.length) fail('จำนวนค่าใน frame ต้องตรงกับ frequency bins');
      for (let bin = 0; bin < list.length; bin++) {
        const value = list[bin];
        if (!number(value) || value < 0) fail('ขนาด spectrum ต้องเป็นค่าจำกัดตั้งแต่ 0');
        if (bin < eligible) { maxima[bin] = Math.max(maxima[bin], value); frameMaxima[fi] = Math.max(frameMaxima[fi], value); maxValue = Math.max(maxValue, value); }
      }
    }
    const totalFrames = frames.length, totalBins = eligible;
    const frequencyMaxHz = eligible ? frequencies[eligible - 1] : 0;
    const timeStart = frames[0]?.timeSeconds ?? 0, timeEnd = frames.at(-1)?.timeSeconds ?? timeStart;
    const empty = { rows: [], maxValue, frequencyMaxHz, timeStart, timeEnd, totalFrames, totalBins, sourceBins: frequencies.length, displayedFrames: 0, displayedBins: 0 };
    if (!frames.length || !eligible) return empty;
    const selected = Math.max(0, Math.min(frames.length - 1, selectedFrame));
    const bins = evenly(eligible, maxBins);
    if (eligible > maxBins) {
      const buckets = Math.max(1, Math.floor(maxBins / 2)), selectedValues = frames[selected][key];
      for (let bucket = 0; bucket < buckets; bucket++) {
        const start = Math.floor(bucket * eligible / buckets), end = Math.floor((bucket + 1) * eligible / buckets);
        let globalPeak = start, selectedPeak = start;
        for (let bin = start + 1; bin < end; bin++) { if (maxima[bin] > maxima[globalPeak]) globalPeak = bin; if (selectedValues[bin] > selectedValues[selectedPeak]) selectedPeak = bin; }
        bins.add(globalPeak); bins.add(selectedPeak);
      }
    }
    const shown = evenly(frames.length, frames.length <= maxFrames ? maxFrames : Math.max(2, Math.ceil(maxFrames * .65)));
    if (frames.length > maxFrames) {
      const buckets = Math.max(1, maxFrames - shown.size);
      for (let bucket = 0; bucket < buckets; bucket++) {
        const start = Math.floor(bucket * frames.length / buckets), end = Math.floor((bucket + 1) * frames.length / buckets);
        let peak = start; for (let fi = start + 1; fi < end; fi++) if (frameMaxima[fi] > frameMaxima[peak]) peak = fi;
        shown.add(peak);
      }
    }
    shown.add(0); shown.add(frames.length - 1); shown.add(selected);
    const orderedBins = [...bins].sort((a, b) => a - b);
    const rows = [...shown].sort((a, b) => a - b).map(fi => {
      const frame = frames[fi], y = totalFrames === 1 ? .5 : (frame.timeSeconds - timeStart) / (timeEnd - timeStart);
      return { fi, timeSeconds: frame.timeSeconds, vertices: orderedBins.map(bin => {
        const value = frame[key][bin], frequencyHz = frequencies[bin];
        return { fi, bin, frequencyHz, timeSeconds: frame.timeSeconds, value, x: frequencyMaxHz ? frequencyHz / frequencyMaxHz : 0, y, z: value / (maxValue || 1) - .5 };
      }) };
    });
    return { ...empty, rows, displayedFrames: rows.length, displayedBins: orderedBins.length };
  }
  const colors = [[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0], [255, 0, 255]];
  // A shared lookup table avoids allocating an RGB array at every raster pixel.
  const paletteSize = 4096, palette = new Uint8ClampedArray(paletteSize * 3);
  for (let step = 0; step < paletteSize; step++) {
    const value = step / (paletteSize - 1) * (colors.length - 1), index = Math.min(colors.length - 2, Math.floor(value)), mix = value - index;
    for (let channel = 0; channel < 3; channel++) palette[step * 3 + channel] = Math.round(colors[index][channel] * (1 - mix) + colors[index + 1][channel] * mix);
  }
  function rasterize(mesh, { width, height, project } = {}) {
    if (!Number.isInteger(width) || width < 1 || width > 4096 || !Number.isInteger(height) || height < 1 || height > 4096 || width * height > 4194304) fail('ขนาดภาพ Surface ต้องเป็นจำนวนเต็มและไม่เกิน 4 ล้านพิกเซล');
    if (typeof project !== 'function' || !mesh || !Array.isArray(mesh.rows) || !number(mesh.maxValue) || mesh.maxValue < 0) fail('Mesh หรือ projection ไม่ถูกต้อง');
    const pixels = new Uint8ClampedArray(width * height * 4), depths = new Float32Array(width * height), picks = new Int32Array(width * height);
    depths.fill(-Infinity);
    const vertices = [], projected = [], offsets = [];
    let bins = null;
    for (const row of mesh.rows) {
      if (!Array.isArray(row.vertices) || bins !== null && row.vertices.length !== bins) fail('Surface rows ต้องมีจำนวน bins ตรงกัน');
      bins = row.vertices.length; offsets.push(vertices.length);
      for (const vertex of row.vertices) {
        if (!['x', 'y', 'z', 'value'].every(key => number(vertex[key])) || vertex.value < 0) fail('Surface vertex ไม่ถูกต้อง');
        const point = project(vertex.x, vertex.y, vertex.z);
        if (!point || !['x', 'y', 'depth'].every(key => number(point[key])) || Math.abs(point.depth) > 1e30) fail('Projection ต้องคืน x, y, depth ที่มีค่าจำกัด');
        vertices.push(vertex); projected.push(point);
      }
    }
    function triangle(ia, ib, ic) {
      const a = projected[ia], b = projected[ib], c = projected[ic];
      const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (!number(denominator) || Math.abs(denominator) < 1e-10) return;
      const left = Math.max(0, Math.ceil(Math.min(a.x, b.x, c.x) - .5)), right = Math.min(width - 1, Math.floor(Math.max(a.x, b.x, c.x) - .5));
      const top = Math.max(0, Math.ceil(Math.min(a.y, b.y, c.y) - .5)), bottom = Math.min(height - 1, Math.floor(Math.max(a.y, b.y, c.y) - .5));
      const av = vertices[ia].value, bv = vertices[ib].value, cv = vertices[ic].value;
      for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
        const x = px + .5, y = py + .5;
        const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
        const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator, wc = 1 - wa - wb;
        if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
        const depth = wa * a.depth + wb * b.depth + wc * c.depth, index = py * width + px;
        if (depth < depths[index]) continue;
        depths[index] = depth;
        const ratio = (wa * av + wb * bv + wc * cv) / (mesh.maxValue || 1), colorOffset = Math.round(Math.max(0, Math.min(1, ratio)) * (paletteSize - 1)) * 3, offset = index * 4;
        pixels[offset] = palette[colorOffset]; pixels[offset + 1] = palette[colorOffset + 1]; pixels[offset + 2] = palette[colorOffset + 2]; pixels[offset + 3] = 255;
        const da = (x - a.x) ** 2 + (y - a.y) ** 2, db = (x - b.x) ** 2 + (y - b.y) ** 2, dc = (x - c.x) ** 2 + (y - c.y) ** 2;
        picks[index] = (da <= db && da <= dc ? ia : db <= dc ? ib : ic) + 1;
      }
    }
    for (let row = 0; row + 1 < mesh.rows.length; row++) for (let bin = 0; bin + 1 < bins; bin++) {
      const a = offsets[row] + bin, b = a + 1, c = offsets[row + 1] + bin, d = c + 1;
      triangle(a, b, c); triangle(b, d, c);
    }
    return { pixels, depths, picks, vertices };
  }
  return Object.freeze({ prepare, rasterize });
});
