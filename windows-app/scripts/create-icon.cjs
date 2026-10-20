'use strict';
// Build the application-owned Windows icon without an external graphics dependency.
const fs = require('node:fs');
const path = require('node:path');
function segmentDistance(x, y, ax, ay, bx, by) {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
}
const entries = [16, 24, 32, 48, 64, 128, 256].map(size => {
  const maskStride = Math.ceil(size / 32) * 4;
  const dib = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  dib.writeUInt32LE(40, 0); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8); dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let coverage = 0, white = 0;
    for (const dx of [.25, .75]) for (const dy of [.25, .75]) {
      const xx = (x + dx) / size, yy = (y + dy) / size;
      const qx = Math.max(Math.abs(xx - .5) - .29, 0), qy = Math.max(Math.abs(yy - .5) - .29, 0);
      if (Math.hypot(qx, qy) <= .17) {
        coverage++;
        if (Math.min(segmentDistance(xx, yy, .29, .28, .48, .72), segmentDistance(xx, yy, .48, .72, .72, .28)) < .048) white++;
      }
    }
    const offset = 40 + ((size - 1 - y) * size + x) * 4;
    const mix = coverage ? white / coverage : 0;
    dib[offset] = Math.round(233 + 22 * mix); dib[offset + 1] = Math.round(82 + 173 * mix); dib[offset + 2] = Math.round(98 + 157 * mix); dib[offset + 3] = Math.round(coverage / 4 * 255);
    if (!coverage) dib[40 + size * size * 4 + (size - 1 - y) * maskStride + Math.floor(x / 8)] |= 128 >> (x % 8);
  }
  return { size, dib };
});
const header = Buffer.alloc(6 + entries.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach(({ size, dib }, index) => {
  const position = 6 + index * 16; header[position] = size === 256 ? 0 : size; header[position + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6); header.writeUInt32LE(dib.length, position + 8); header.writeUInt32LE(offset, position + 12); offset += dib.length;
});
const directory = path.join(__dirname, '..', 'assets'); fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'app.ico'), Buffer.concat([header, ...entries.map(entry => entry.dib)]));
