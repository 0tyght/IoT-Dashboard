'use strict';
const Measurements = (() => {
  const groups = {
    velocity: { label: 'Velocity', unit: 'mm/s' },
    displacement: { label: 'Displacement', unit: 'µm' },
    acceleration: { label: 'Acceleration', unit: 'm/s²' }
  };
  const keys = Object.keys(groups).flatMap(kind => ['X', 'Y', 'Z'].map(axis => `${kind}${axis}`));
  function windowFrames(frames, spec, count = 1000, width = 600) {
    if (!frames.length) return [];
    if (spec === 'session') return frames;
    if (spec === 'auto') return frames.slice(-Math.max(120, Math.ceil(width * 2)));
    if (spec === 'custom') return frames.slice(-Math.max(2, Math.min(20000, Number(count) || 1000)));
    if (/^\d+s$/.test(spec)) { const cutoff = Date.parse(frames.at(-1).timestamp) - Number(spec.slice(0, -1)) * 1000; return frames.filter(frame => Date.parse(frame.timestamp) >= cutoff); }
    return frames;
  }
  // Keep the first/last and extrema of every channel, rather than averaging away peaks.
  function thinFrames(frames, budget = 1600) {
    if (frames.length <= budget) return frames;
    const selected = new Set(), bucketSize = Math.ceil(frames.length / Math.max(1, Math.floor(budget / 24)));
    for (let offset = 0; offset < frames.length; offset += bucketSize) {
      const end = Math.min(frames.length, offset + bucketSize); selected.add(offset); selected.add(end - 1);
      for (const key of ['value', ...keys, 'temperature']) {
        let min = Infinity, max = -Infinity, low = -1, high = -1;
        for (let index = offset; index < end; index++) {
          const value = frames[index][key] ?? frames[index].channels?.[key]; if (!Number.isFinite(value)) continue;
          if (value < min) { min = value; low = index; } if (value > max) { max = value; high = index; }
        }
        if (low >= 0) selected.add(low); if (high >= 0) selected.add(high);
      }
    }
    return [...selected].sort((a, b) => a - b).map(index => frames[index]);
  }
  function nearest(frames, stamp) {
    let low = 0, high = frames.length - 1;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (Date.parse(frames[mid].timestamp) < stamp) low = mid + 1; else high = mid; }
    return low > 0 && Math.abs(Date.parse(frames[low - 1].timestamp) - stamp) < Math.abs(Date.parse(frames[low]?.timestamp) - stamp) ? low - 1 : low;
  }
  return { groups, keys, windowFrames, thinFrames, nearest };
})();
if (typeof module !== 'undefined') module.exports = Measurements;
