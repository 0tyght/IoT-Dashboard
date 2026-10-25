'use strict';

/* Pure uniform-series analysis. The waveform CSV parser rejects overall records;
 * TrendAnalysis prepares them separately with explicit receive-time provenance.
 * Scaling follows the one-sided periodogram convention documented by SciPy:
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html
 * STFT frames use complete, unpadded windows; their times are window centers.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpectralAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_SAMPLES = 262144, MAX_FRAMES = 512, MAX_CSV_BYTES = 32 * 1024 * 1024;
  const TIME_TOLERANCE = .001, RATE_TOLERANCE = .01;
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const headerName = value => value.toLowerCase().replace(/[\s_-]/g, '');
  const aggregateHeader = /^(?:velocity|acceleration|displacement|frequency|temperature|rawregister|pollinterval|actualinterval|motorid|schema|record|timestamp|source|slaveid|port)/;
  const recordMessage = 'ไฟล์นี้เป็นข้อมูล overall/record ของ VECTRA ไม่ใช่ waveform samples จึงนำมาทำ FFT การสั่นไม่ได้ · ดูข้อมูลที่โปรแกรมบันทึกในเมนู “ค่าที่บันทึก · XYZ”';

  function fail(message) { throw new Error(message); }
  function finiteNumber(value, description) {
    if (typeof value === 'string') {
      value = value.trim();
      if (!numeric.test(value)) fail(`${description} ต้องเป็นตัวเลขที่มีค่าจำกัด`);
      value = Number(value);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${description} ต้องเป็นตัวเลขที่มีค่าจำกัด`);
    return value;
  }
  function rate(value) {
    const number = finiteNumber(value, 'Sample rate (Hz)');
    if (number <= 0) fail('Sample rate (Hz) ต้องมากกว่า 0');
    return number;
  }
  function checkTextSize(text) {
    if (typeof text !== 'string') fail('ข้อมูล CSV ต้องเป็นข้อความ');
    if (text.length > MAX_CSV_BYTES) fail('CSV เกินขนาดสูงสุด 32 MiB');
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) bytes++;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
      else bytes += 3;
      if (bytes > MAX_CSV_BYTES) fail('CSV เกินขนาดสูงสุด 32 MiB');
    }
  }
  function csvRows(text) {
    checkTextSize(text);
    text = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', quoted = false, closedQuote = false;
    function cell() {
      row.push(field.trim()); field = ''; closedQuote = false;
      // Recognize our full 32-column recording header before the waveform
      // column guard. Otherwise users receive a misleading column-count error.
      if (!rows.length && aggregateHeader.test(headerName(row.at(-1)))) fail(recordMessage);
      if (row.length > 16) fail('CSV มีคอลัมน์มากเกินไปสำหรับข้อมูล waveform');
    }
    function line() {
      cell();
      // Empty physical lines are formatting; an explicit row of empty cells is
      // missing waveform data and must reach validation rather than disappear.
      if (row.length !== 1 || row[0] !== '') rows.push(row);
      row = [];
      if (rows.length > MAX_SAMPLES + 1) fail(`CSV เกิน ${MAX_SAMPLES} samples ต่อแกน`);
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') { quoted = false; closedQuote = true; }
        else field += char;
      } else if (char === '"') {
        if (closedQuote || field.trim() !== '') fail('รูปแบบเครื่องหมายคำพูดใน CSV ไม่ถูกต้อง');
        field = ''; quoted = true;
      } else if (char === ',') cell();
      else if (char === '\n' || char === '\r') { line(); if (char === '\r' && text[i + 1] === '\n') i++; }
      else {
        if (closedQuote && !/\s/.test(char)) fail('มีข้อความหลังเครื่องหมายคำพูดปิดใน CSV');
        field += char;
      }
      if (field.length > 4096) fail('ช่องข้อมูล CSV ยาวเกินไปสำหรับข้อมูล waveform');
    }
    if (quoted) fail('CSV มีเครื่องหมายคำพูดที่ยังไม่ปิด');
    if (field !== '' || row.length) line();
    return rows;
  }
  function parseCSV(text, options = {}) {
    const rows = csvRows(text);
    if (rows.length < 2) fail('CSV ต้องมีหัวคอลัมน์และข้อมูล waveform อย่างน้อย 1 sample');
    const headers = rows.shift().map(headerName);
    if (new Set(headers).size !== headers.length || headers.some(value => !value)) fail('หัวคอลัมน์ CSV ว่างหรือซ้ำกัน');
    const timingTypes = { times: 1, elapsedtimes: 1, timems: .001, elapsedtimems: .001, index: 0, sample: 0 };
    const timing = headers.map((name, index) => ({ name, index, scale: timingTypes[name] })).filter(item => item.scale !== undefined);
    if (timing.length > 1) fail('CSV ต้องใช้เวลา หรือ sample index เพียงคอลัมน์เดียว');
    const axes = headers.map((name, index) => ({ name, index })).filter(item => /^[xyz]$/.test(item.name));
    const valueIndex = headers.indexOf('value');
    if (valueIndex >= 0 && axes.length) fail('CSV ต้องใช้ x/y/z หรือ value เพียงรูปแบบเดียว');
    if (valueIndex >= 0) axes.push({ name: 'x', index: valueIndex });
    if (!axes.length) fail('CSV ต้องมีคอลัมน์ x/y/z หรือ value สำหรับ waveform');
    if (headers.some(name => timingTypes[name] === undefined && !/^(?:x|y|z|value)$/.test(name))) fail('หัวคอลัมน์ CSV ไม่รองรับ ใช้ time_s/time_ms หรือ sample/index และ x/y/z หรือ value');
    const declared = options.sampleRateHz !== undefined && options.sampleRateHz !== null && options.sampleRateHz !== '' ? rate(options.sampleRateHz) : null;
    if ((!timing.length || timing[0].scale === 0) && declared === null) fail('ข้อมูลที่ไม่มีเวลา sample ต้องระบุ Sample rate (Hz) จากอุปกรณ์บันทึก');
    const unit = options.unit === undefined ? 'a.u.' : String(options.unit).trim();
    if (!unit || unit.length > 32 || /[\x00-\x1f]/.test(unit)) fail('หน่วยข้อมูลไม่ถูกต้อง');
    const channels = {}, times = [];
    axes.forEach(axis => { channels[axis.name.toUpperCase()] = []; });
    rows.forEach((row, rowIndex) => {
      if (row.length !== headers.length) fail(`CSV แถว ${rowIndex + 2} มีจำนวนคอลัมน์ไม่ตรงกับหัวตาราง`);
      axes.forEach(axis => channels[axis.name.toUpperCase()].push(finiteNumber(row[axis.index], `CSV แถว ${rowIndex + 2} แกน ${axis.name.toUpperCase()}`)));
      if (timing.length) times.push(finiteNumber(row[timing[0].index], `เวลา/sample index ใน CSV แถว ${rowIndex + 2}`));
    });
    const sampleCount = rows.length;
    let inferred = null, timeOriginSeconds = 0;
    if (timing.length && timing[0].scale === 0) {
      times.forEach((value, index) => {
        if (!Number.isSafeInteger(value) || value < 0 || (index && value !== times[index - 1] + 1)) fail(`Sample index ไม่ต่อเนื่องที่แถว ${index + 2}; ไม่เติมหรือ resample ข้อมูลที่ขาด`);
      });
    } else if (timing.length) {
      const scale = timing[0].scale;
      timeOriginSeconds = times[0] * scale;
      if (!Number.isFinite(timeOriginSeconds)) fail('เวลา sample อยู่นอกช่วงที่รองรับ');
      if (sampleCount === 1) { if (declared === null) fail('ต้องมีเวลาอย่างน้อย 2 samples เพื่อคำนวณ Sample rate'); }
      else {
        const interval = ((times.at(-1) - times[0]) * scale) / (sampleCount - 1);
        if (!(interval > 0) || !Number.isFinite(interval)) fail('เวลา sample ต้องเรียงเพิ่มขึ้นและมีระยะห่างคงที่');
        const precision = Number.EPSILON * Math.max(Math.abs(times[0] * scale), Math.abs(times.at(-1) * scale), interval) * 8;
        if (precision > interval * .01) fail('ความละเอียดของเวลา CSV ไม่พอสำหรับยืนยันระยะห่าง sample; ใช้เวลา elapsed ที่ละเอียดกว่านี้');
        const tolerance = Math.max(interval * TIME_TOLERANCE, precision);
        times.forEach((value, index) => {
          if (!index) return;
          const step = (value - times[index - 1]) * scale;
          if (!(step > 0) || Math.abs(step - interval) > tolerance) fail(`เวลา sample ไม่สม่ำเสมอหรือมีช่องว่างที่แถว ${index + 2}; ไม่ resample ข้อมูล`);
        });
        inferred = 1 / interval;
        if (!Number.isFinite(inferred)) fail('Sample rate จากเวลาอยู่นอกช่วงที่รองรับ');
        if (declared !== null && Math.abs(declared - inferred) / inferred > RATE_TOLERANCE + 1e-12) fail('Sample rate ที่ระบุต่างจากเวลาใน CSV เกิน 1%');
      }
    }
    const sampleRateHz = declared ?? inferred;
    const durationSeconds = sampleCount / sampleRateHz;
    if (!Number.isFinite(durationSeconds)) fail('ช่วงเวลาบันทึกอยู่นอกช่วงที่รองรับ');
    return {
      sampleRateHz, sampleCount, durationSeconds, timeSpanSeconds: (sampleCount - 1) / sampleRateHz,
      unit, channels, source: 'waveform-csv', timeOriginSeconds,
      timingSource: timing.length && timing[0].scale !== 0 ? 'uniform-csv-time' : 'declared-sample-rate',
      inferredSampleRateHz: inferred
    };
  }

  function fft(real, imaginary) {
    const size = real.length;
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const value = real[i]; real[i] = real[j]; real[j] = value; }
    }
    for (let width = 2; width <= size; width <<= 1) {
      const angle = -2 * Math.PI / width, stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
      for (let offset = 0; offset < size; offset += width) {
        let weightReal = 1, weightImaginary = 0;
        for (let i = 0; i < width / 2; i++) {
          const left = offset + i, right = left + width / 2;
          const valueReal = real[right] * weightReal - imaginary[right] * weightImaginary;
          const valueImaginary = real[right] * weightImaginary + imaginary[right] * weightReal;
          real[right] = real[left] - valueReal; imaginary[right] = imaginary[left] - valueImaginary;
          real[left] += valueReal; imaginary[left] += valueImaginary;
          const nextReal = weightReal * stepReal - weightImaginary * stepImaginary;
          weightImaginary = weightReal * stepImaginary + weightImaginary * stepReal; weightReal = nextReal;
        }
      }
    }
  }
  function analyze(samples, options = {}) {
    if ((!Array.isArray(samples) && !ArrayBuffer.isView(samples)) || samples instanceof DataView) fail('ต้องส่ง waveform samples เป็น array ของตัวเลข');
    const sampleRateHz = rate(options.sampleRateHz), fftSize = options.fftSize ?? 1024;
    if (!Number.isInteger(fftSize) || fftSize < 64 || fftSize > 8192 || (fftSize & (fftSize - 1))) fail('FFT size ต้องเป็นกำลังของ 2 ตั้งแต่ 64 ถึง 8192');
    if (samples.length > MAX_SAMPLES) fail(`ข้อมูลเกิน ${MAX_SAMPLES} samples ต่อแกน`);
    if (samples.length < fftSize) fail(`ต้องมี waveform อย่างน้อย ${fftSize} samples สำหรับ FFT size นี้`);
    for (let i = 0; i < samples.length; i++) if (typeof samples[i] !== 'number' || !Number.isFinite(samples[i])) fail(`Waveform sample ${i + 1} ต้องเป็นตัวเลขที่มีค่าจำกัด`);
    const overlap = options.overlap ?? .5;
    if (typeof overlap !== 'number' || !Number.isFinite(overlap) || overlap < 0 || overlap >= 1) fail('Overlap ต้องอยู่ในช่วง 0 ถึงน้อยกว่า 1');
    const overlapSamples = Math.round(fftSize * overlap), hopSize = fftSize - overlapSamples;
    if (hopSize < 1) fail('Overlap สูงเกินไป ต้องเหลือ hop อย่างน้อย 1 sample');
    const frameCount = Math.floor((samples.length - fftSize) / hopSize) + 1;
    if (frameCount > MAX_FRAMES) fail(`ผลลัพธ์มี ${frameCount} frames เกินสูงสุด ${MAX_FRAMES}; เพิ่ม FFT size ลด overlap หรือเลือกช่วงข้อมูลสั้นลง ไม่มีการลด frames อัตโนมัติ`);
    const windowName = options.window ?? 'hann';
    if (windowName !== 'hann' && windowName !== 'rectangular') fail('Window รองรับ hann หรือ rectangular เท่านั้น');
    const weights = new Float64Array(fftSize);
    let sumWeights = 0, sumSquaredWeights = 0;
    for (let i = 0; i < fftSize; i++) {
      const value = windowName === 'hann' ? .5 - .5 * Math.cos(2 * Math.PI * i / fftSize) : 1;
      weights[i] = value; sumWeights += value; sumSquaredWeights += value * value;
    }
    const binCount = fftSize / 2 + 1, binWidthHz = sampleRateHz / fftSize;
    if (!Number.isFinite(samples.length / sampleRateHz) || binWidthHz === 0) fail('Sample rate ทำให้เวลา/ความถี่อยู่นอกช่วงตัวเลขที่รองรับ');
    const frequencies = Array.from({ length: binCount }, (_, index) => index * binWidthHz);
    const meanPSD = Array(binCount).fill(0), frames = [], real = new Float64Array(fftSize), imaginary = new Float64Array(fftSize);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const start = frameIndex * hopSize;
      let mean = 0;
      for (let i = 0; i < fftSize; i++) mean += samples[start + i] / fftSize;
      for (let i = 0; i < fftSize; i++) { real[i] = (samples[start + i] - mean) * weights[i]; imaginary[i] = 0; }
      fft(real, imaginary);
      const amplitudes = Array(binCount), psd = Array(binCount);
      for (let bin = 0; bin < binCount; bin++) {
        const factor = bin === 0 || bin === fftSize / 2 ? 1 : 2;
        const magnitude = Math.hypot(real[bin], imaginary[bin]);
        const amplitude = factor * magnitude / sumWeights;
        const density = factor * (magnitude / sumSquaredWeights) * (magnitude / sampleRateHz);
        if (!Number.isFinite(amplitude) || !Number.isFinite(density)) fail('ขนาด waveform หรือ Sample rate ทำให้คำนวณ spectrum เกินช่วงตัวเลขที่รองรับ');
        amplitudes[bin] = amplitude; psd[bin] = density; meanPSD[bin] += density / frameCount;
      }
      frames.push({ timeSeconds: (start + fftSize / 2) / sampleRateHz, startTimeSeconds: start / sampleRateHz, endTimeSeconds: (start + fftSize) / sampleRateHz, amplitudes, psd });
    }
    return {
      frequencies, frames, meanPSD, binWidthHz, nyquistHz: sampleRateHz / 2,
      fftSize, sampleRateHz, hopSize, overlapSamples, overlap: overlapSamples / fftSize,
      window: windowName, sampleCount: samples.length,
      omittedSamples: samples.length - ((frameCount - 1) * hopSize + fftSize),
      amplitudeType: 'peak', psdType: 'one-sided-density', detrend: 'remove-mean-per-frame',
      windowConvention: windowName === 'hann' ? 'periodic' : 'rectangular', frameTimeReference: 'window-center'
    };
  }
  return Object.freeze({ parseCSV, analyze, limits: Object.freeze({ maxSamples: MAX_SAMPLES, maxFrames: MAX_FRAMES, maxCSVBytes: MAX_CSV_BYTES }) });
});
