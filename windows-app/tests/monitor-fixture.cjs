'use strict';

// Renderer fixtures are injected by Playwright and are excluded from the desktop build.
async function seedMonitor(page) {
  await page.evaluate(`window.fixtureFrame = ${fixtureFrame.toString()}`);
  await page.evaluate(() => {
    if (!profiles.length) profiles = [1,2].map(index => ({
      motorId: `TEST-${index}`, name: `Test device ${index}`, area: 'Test', path: 'COM987',
      slaveId: index, baudRate: 9600, parity: 'none', stopBits: 1, sensorModel: MODEL,
      registerType: 'holding', unit: 'mm/s', pollInterval: 1000, timeout: 1500
    }));
    cache.clear();
    selected = profiles[0].motorId;
    mode = 'live';
    profiles.forEach((profile, index) => {
      for (let sample = 0; sample < 40; sample++) {
        const frame = window.fixtureFrame(profile, index, sample * .18);
        frame.timestamp = new Date(Date.now() - (40 - sample) * 1000).toISOString();
        addReading(frame);
      }
    });
    renderProfiles();
    renderSelected();
    setTab('monitor');
  });
}

function fixtureFrame(profile, index, phase) {
  const channels = { temperature: 35.2 + index + Math.sin(phase / 5) * .4, velocityX: 2.1 + index * .3 + Math.sin(phase) * .35, velocityY: 3.4 + index * .4 + Math.sin(phase + 1) * .5, velocityZ: 1.5 + index * .2 + Math.sin(phase + 2) * .25, displacementX: 32 + Math.sin(phase) * 3, displacementY: 41 + Math.sin(phase + 1) * 4, displacementZ: 22 + Math.sin(phase + 2) * 2, accelerationX: 1.2 + Math.sin(phase) * .2, accelerationY: 1.6 + Math.sin(phase + 1) * .2, accelerationZ: .9 + Math.sin(phase + 2) * .15 };
  channels.frequencyX = 49.8 + Math.sin(phase) * .2; channels.frequencyY = 50.1 + Math.sin(phase + 1) * .3; channels.frequencyZ = 49.9 + Math.sin(phase + 2) * .2;
  Object.keys(channels).forEach(key => { channels[key] = key.startsWith('frequency') ? Math.fround(channels[key]) : Math.round(channels[key] * 10) / 10; });
  const axes = ['X', 'Y', 'Z']; const primaryAxis = axes.reduce((a, b) => channels[`velocity${a}`] > channels[`velocity${b}`] ? a : b);
  const encoded = value => Math.round(value * 10) & 65535;
  const floatWords = value => { const view = new DataView(new ArrayBuffer(4)); view.setFloat32(0, value); return [view.getUint16(0), view.getUint16(2)]; };
  return { motorId: profile.motorId, value: channels[`velocity${primaryAxis}`], channels: profile.sensorModel === MODEL ? channels : null, rawRegisters: profile.sensorModel === MODEL ? { primary: [channels.temperature, channels.velocityX, channels.velocityY, channels.velocityZ, channels.displacementX, channels.displacementY, channels.displacementZ].map(encoded), acceleration: [channels.accelerationX, channels.accelerationY, channels.accelerationZ].map(encoded), frequency: ['frequencyX', 'frequencyY', 'frequencyZ'].flatMap(key => floatWords(channels[key])) } : [encoded(channels.velocityY)], primaryAxis: profile.sensorModel === MODEL ? primaryAxis : null, unit: profile.sensorModel === MODEL ? 'mm/s' : profile.unit, timestamp: new Date().toISOString(), source: 'MODBUS', frequencyStatus: profile.sensorModel === MODEL ? 'ok' : undefined, frequencyByteOrder: 'ABCD', port: profile.path, slaveId: profile.slaveId, elapsedMs: 18 + index, recorded: false };
}

module.exports = { seedMonitor };
