'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Spectral = require('../src/spectral-analysis.js');
const close = (actual, expected, tolerance = 1e-9, label = '') => assert(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);
const sine = (count, sampleRate, frequency, amplitude = 1, phase = 0) => Array.from({ length: count }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate + phase));
const peak = values => values.reduce((best, value, index) => value > values[best] ? index : best, 0);

const fsHz = 1024, size = 1024;
const fifty = sine(size * 3 + 7, fsHz, 50, 2.5), oneTwenty = sine(fifty.length, fsHz, 120, .8, .3);
const waveform = fifty.map((value, i) => value + oneTwenty[i] + 17);
for (const window of ['hann', 'rectangular']) {
  const result = Spectral.analyze(waveform, { sampleRateHz: fsHz, fftSize: size, window });
  assert.equal(result.frames.length, 5);
  assert.equal(result.hopSize, 512);
  assert.equal(result.omittedSamples, 7, 'incomplete trailing samples are reported, never padded');
  assert.equal(result.frequencies.length, 513);
  assert.equal(result.binWidthHz, 1);
  assert.equal(result.nyquistHz, 512);
  assert.equal(result.frameTimeReference, 'window-center');
  close(result.frames[0].timeSeconds, .5);
  close(result.frames[1].startTimeSeconds, .5);
  close(result.frames[1].endTimeSeconds, 1.5);
  for (const frame of result.frames) {
    assert.equal(result.frequencies[peak(frame.amplitudes)], 50);
    close(frame.amplitudes[50], 2.5, 1e-10, `${window} 50 Hz peak amplitude`);
    close(frame.amplitudes[120], .8, 1e-10, `${window} 120 Hz peak amplitude`);
    close(frame.amplitudes[0], 0, 1e-10, 'DC offset is removed before windowing');
    close(frame.psd.reduce((sum, value) => sum + value, 0) * result.binWidthHz, (2.5 ** 2 + .8 ** 2) / 2, 1e-9, `${window} integrated PSD = mean-square AC signal`);
  }
  close(result.meanPSD[50], result.frames.reduce((sum, frame) => sum + frame.psd[50], 0) / result.frames.length);
}

// Exact Nyquist is a single real bin; doubling it would overstate amplitude/power.
for (const window of ['hann', 'rectangular']) {
  const nyquist = Spectral.analyze(Array.from({ length: size }, (_, i) => 4 * (i % 2 ? -1 : 1) + 12), { sampleRateHz: fsHz, window });
  close(nyquist.frames[0].amplitudes[512], 4);
  close(nyquist.frames[0].amplitudes[0], 0);
  close(nyquist.frames[0].psd.reduce((sum, value) => sum + value, 0), 16, 1e-9);
  const dc = Spectral.analyze(Array(size).fill(15), { sampleRateHz: fsHz, window });
  assert(dc.frames[0].amplitudes.every(value => value === 0));
  assert(dc.meanPSD.every(value => value === 0));
}

// Parseval also checks an arbitrary signal without relying on coherent sine bins.
let seed = 1349;
const noise = Array.from({ length: size }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 - .5; });
const mean = noise.reduce((sum, value) => sum + value, 0) / size;
for (const window of ['hann', 'rectangular']) {
  const result = Spectral.analyze(noise, { sampleRateHz: 8000, window });
  let expected = 0, weightPower = 0;
  noise.forEach((value, i) => { const weight = window === 'hann' ? .5 - .5 * Math.cos(2 * Math.PI * i / size) : 1; expected += ((value - mean) * weight) ** 2; weightPower += weight ** 2; });
  close(result.meanPSD.reduce((sum, value) => sum + value, 0) * result.binWidthHz, expected / weightPower, 1e-12);
}

const xyz = Spectral.parseCSV('\uFEFF"time_s","x","y","z"\r\n"0","1","-2","3"\r\n"0.001","4","5","6"\r\n"0.002","7","8","9"\r\n', { unit: 'm/s²' });
assert.equal(xyz.sampleRateHz, 1000);
assert.equal(xyz.sampleCount, 3);
assert.equal(xyz.durationSeconds, .003);
assert.equal(xyz.timeSpanSeconds, .002);
assert.equal(xyz.unit, 'm/s²');
assert.deepEqual(xyz.channels, { X: [1, 4, 7], Y: [-2, 5, 8], Z: [3, 6, 9] });
assert.equal(xyz.source, 'waveform-csv');
assert.equal(xyz.timingSource, 'uniform-csv-time');
assert.equal(xyz.inferredSampleRateHz, 1000);
const scalar = Spectral.parseCSV('sample,value\n40,2\n41,-3\n42,5', { sampleRateHz: 8000 });
assert.deepEqual(scalar.channels, { X: [2, -3, 5] });
assert.equal(scalar.timingSource, 'declared-sample-rate');
assert.equal(scalar.unit, 'a.u.');
const milliseconds = Spectral.parseCSV('time_ms,x\n23000,2\n23000.25,3\n23000.5,4');
assert.equal(milliseconds.sampleRateHz, 4000);
assert.equal(milliseconds.timeOriginSeconds, 23);
assert.equal(Spectral.parseCSV('x,y\n1,2\n3,4', { sampleRateHz: 500 }).sampleRateHz, 500);
assert.equal(Spectral.parseCSV('elapsed_time_s,x\n0,1\n.001,2', { sampleRateHz: 1010 }).sampleRateHz, 1010, 'the stated 1% rate tolerance is inclusive');
assert.equal(Spectral.parseCSV('elapsedtime_s,x\n0,1\n.001,2').sampleRateHz, 1000);

assert.throws(() => Spectral.parseCSV('time_s,x\n0,1\n.001,2\n.003,3'), /ไม่สม่ำเสมอ|ช่องว่าง/);
assert.throws(() => Spectral.parseCSV('time_s,x\n0,1\n.001,2\n.001,3'), /ไม่สม่ำเสมอ|เพิ่มขึ้น/);
assert.throws(() => Spectral.parseCSV('time_s,x\n0,1\n.001,2', { sampleRateHz: 1100 }), /เกิน 1%/);
assert.throws(() => Spectral.parseCSV('sample,value\n0,1\n2,2', { sampleRateHz: 1000 }), /ไม่ต่อเนื่อง/);
assert.throws(() => Spectral.parseCSV('sample,value\n0,1\n1,2'), /Sample rate/);
assert.throws(() => Spectral.parseCSV('timestamp,motorId,velocityX,velocityY,velocityZ\n2026-10-21,M1,1,2,3', { sampleRateHz: 5000 }), /overall\/record/);
assert.throws(() => Spectral.parseCSV('schema_version,record_type,value\n3,snapshot,1', { sampleRateHz: 5000 }), /overall\/record/);
assert.throws(() => Spectral.parseCSV('x\nNaN', { sampleRateHz: 1000 }), /ตัวเลข/);
assert.throws(() => Spectral.parseCSV('x\nInfinity', { sampleRateHz: 1000 }), /ตัวเลข/);
assert.throws(() => Spectral.parseCSV('x\n0x10', { sampleRateHz: 1000 }), /ตัวเลข/);
assert.throws(() => Spectral.parseCSV('x,y\n1,', { sampleRateHz: 1000 }), /ตัวเลข/);
assert.throws(() => Spectral.parseCSV('x,y\n1,2\n,\n3,4', { sampleRateHz: 1000 }), /ตัวเลข/);
assert.throws(() => Spectral.parseCSV('x,y\n1,2,3', { sampleRateHz: 1000 }), /จำนวนคอลัมน์/);
assert.throws(() => Spectral.parseCSV('x,x\n1,2', { sampleRateHz: 1000 }), /ซ้ำ/);
assert.throws(() => Spectral.parseCSV('x,value\n1,2', { sampleRateHz: 1000 }), /เพียงรูปแบบเดียว/);
assert.throws(() => Spectral.parseCSV('x\n"1', { sampleRateHz: 1000 }), /ยังไม่ปิด/);
assert.throws(() => Spectral.parseCSV('x\n"1"2', { sampleRateHz: 1000 }), /หลังเครื่องหมาย/);
assert.throws(() => Spectral.parseCSV('x\n"1""2"', { sampleRateHz: 1000 }), /ตัวเลข/);
assert.throws(() => Spectral.parseCSV('x\n"1\n2"', { sampleRateHz: 1000 }), /ตัวเลข/);
assert.throws(() => Spectral.parseCSV('x\n' + '1'.repeat(4097), { sampleRateHz: 1000 }), /ยาวเกิน/);
assert.throws(() => Spectral.parseCSV('x\n' + '1'.repeat(Spectral.limits.maxCSVBytes), { sampleRateHz: 1000 }), /32 MiB/);
assert.throws(() => Spectral.parseCSV('x\n' + Array(Spectral.limits.maxSamples + 1).fill('1').join('\n'), { sampleRateHz: 1000 }), /samples/);
assert.equal(Spectral.parseCSV('x\n' + Array(Spectral.limits.maxSamples).fill('1').join('\n'), { sampleRateHz: 1000 }).sampleCount, Spectral.limits.maxSamples);

assert.throws(() => Spectral.analyze(waveform, { sampleRateHz: 0 }), /มากกว่า 0/);
assert.throws(() => Spectral.analyze(Array(64).fill(0), { sampleRateHz: Number.MIN_VALUE, fftSize: 64 }), /นอกช่วง/);
assert.throws(() => Spectral.analyze(waveform, { sampleRateHz: 1024, fftSize: 1000 }), /กำลังสอง/);
assert.throws(() => Spectral.analyze(waveform, { sampleRateHz: 1024, fftSize: 32 }), /กำลังสอง/);
assert.throws(() => Spectral.analyze(waveform.slice(0, 63), { sampleRateHz: 1024, fftSize: 64 }), /อย่างน้อย/);
assert.throws(() => Spectral.analyze(Array(64).fill(NaN), { sampleRateHz: 1024, fftSize: 64 }), /ตัวเลข/);
assert.throws(() => Spectral.analyze(Array(64).fill(null), { sampleRateHz: 1024, fftSize: 64 }), /ตัวเลข/);
assert.throws(() => Spectral.analyze(Array(64).fill('1'), { sampleRateHz: 1024, fftSize: 64 }), /ตัวเลข/);
assert.throws(() => Spectral.analyze(Array(Spectral.limits.maxSamples + 1).fill(1), { sampleRateHz: 1024 }), /samples/);
assert.throws(() => Spectral.analyze(Array(64 + 512).fill(1), { sampleRateHz: 1024, fftSize: 64, overlap: 63 / 64 }), /513 frames/);
assert.throws(() => Spectral.analyze(waveform, { sampleRateHz: 1024, overlap: 1 }), /Overlap/);
assert.throws(() => Spectral.analyze(waveform, { sampleRateHz: 1024, overlap: .99999 }), /hop/);
assert.throws(() => Spectral.analyze(waveform, { sampleRateHz: 1024, window: 'triangle' }), /Window/);
const maxFrames = Spectral.analyze(new Float64Array(64 + 511), { sampleRateHz: 1024, fftSize: 64, overlap: 63 / 64 });
assert.equal(maxFrames.frames.length, Spectral.limits.maxFrames);
assert.equal(Spectral.analyze(new Float64Array(8192), { sampleRateHz: 1024, fftSize: 8192, overlap: 0 }).frames.length, 1);

// An independent direct DFT catches radix-2 index/sign errors off coherent bins.
const short = noise.slice(0, 64), shortMean = short.reduce((sum, value) => sum + value, 0) / short.length;
const direct = Spectral.analyze(short, { sampleRateHz: 6400, fftSize: 64, window: 'rectangular' });
for (let bin = 0; bin <= 32; bin++) {
  let real = 0, imaginary = 0;
  short.forEach((value, index) => { const angle = -2 * Math.PI * bin * index / 64; real += (value - shortMean) * Math.cos(angle); imaginary += (value - shortMean) * Math.sin(angle); });
  const factor = bin === 0 || bin === 32 ? 1 : 2, magnitude = Math.hypot(real, imaginary);
  close(direct.frames[0].amplitudes[bin], factor * magnitude / 64, 1e-13);
  close(direct.frames[0].psd[bin], factor * magnitude ** 2 / (6400 * 64), 1e-15);
}

const browser = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../src/spectral-analysis.js'), 'utf8'), browser);
assert.equal(typeof browser.SpectralAnalysis.parseCSV, 'function');
assert.equal(typeof browser.SpectralAnalysis.analyze, 'function');
console.log('PASS: waveform CSV provenance/timing/limits, radix-2 FFT amplitudes, PSD normalization, complete STFT frames and browser/CommonJS exports');
