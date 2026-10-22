'use strict';
importScripts('spectral-analysis.js');
let waveform = null;
function metadata() {
  const { channels, ...details } = waveform;
  return { ...details, axes: Object.keys(channels) };
}
self.onmessage = ({ data: request }) => {
  try {
    let result;
    if (request.type === 'load') {
      waveform = null;
      waveform = SpectralAnalysis.parseCSV(request.text, request.options);
      result = metadata();
    } else if (request.type === 'demo') {
      const sampleRateHz = 2048, sampleCount = 8192, channels = { X: [], Y: [], Z: [] };
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleRateHz;
        channels.X.push(Math.sin(2 * Math.PI * 50 * t) + .4 * Math.sin(2 * Math.PI * 120 * t));
        channels.Y.push(.7 * Math.sin(2 * Math.PI * 80 * t));
        const envelope = .12 + .88 * Math.exp(-(((t - 2) / .65) ** 2));
        channels.Z.push(.5 * envelope * Math.sin(2 * Math.PI * (30 * t + 20 * t * t)));
      }
      waveform = { channels, sampleRateHz, sampleCount, durationSeconds: sampleCount / sampleRateHz, timeSpanSeconds: (sampleCount - 1) / sampleRateHz, unit: 'm/s²', source: 'test-signal', timingSource: 'generated' };
      result = metadata();
    } else if (request.type === 'analyze') {
      if (!waveform) throw new Error('เปิดไฟล์ Waveform CSV ก่อนวิเคราะห์');
      const samples = waveform.channels[request.axis];
      if (!samples) throw new Error('ไม่พบแกนที่เลือกในไฟล์นี้');
      result = SpectralAnalysis.analyze(samples, { ...request.options, sampleRateHz: waveform.sampleRateHz });
      // Preserve both extrema in each preview bucket; FFT always uses every sample.
      const preview = [], bucket = Math.max(1, Math.ceil(samples.length / 700));
      for (let offset = 0; offset < samples.length; offset += bucket) {
        let low = offset, high = offset;
        const end = Math.min(samples.length, offset + bucket);
        for (let i = offset + 1; i < end; i++) { if (samples[i] < samples[low]) low = i; if (samples[i] > samples[high]) high = i; }
        for (const i of [...new Set([offset, low, high, end - 1])].sort((a, b) => a - b)) preview.push({ time: i / waveform.sampleRateHz, value: samples[i] });
      }
      result.preview = preview;
    } else throw new Error('คำสั่งวิเคราะห์ไม่ถูกต้อง');
    self.postMessage({ id: request.id, ok: true, result });
  } catch (error) { self.postMessage({ id: request.id, ok: false, message: error.message }); }
};
