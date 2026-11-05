'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

class RunDiagnostics {
  constructor(directory, metadata) {
    this.directory = directory;
    this.metadata = metadata;
    this.devices = new Map();
    this.pending = [];
    this.lostEvents = 0;
    this.lastError = '';
    this.initialized = false;
    this.writing = null;
  }

  device(event) {
    const key = `${event.deviceType}:${event.deviceId}`;
    if (!this.devices.has(key)) this.devices.set(key, {
      deviceType: event.deviceType, deviceId: event.deviceId, attempts: 0, ok: 0, partial: 0,
      failed: 0, timeouts: 0, saved: 0, storageErrors: 0, pollIntervalMs: null, lastSuccessAt: null,
      lastIntervalMs: null, maxIntervalMs: null, maxQueueDelayMs: 0
    });
    return this.devices.get(key);
  }

  enqueue(event) {
    if (this.pending.length < 4096) this.pending.push(JSON.stringify({ ...event, runId: this.metadata.runId }));
    else this.lostEvents++;
  }

  attempt(event) {
    this.enqueue({ type: 'attempt', ...event });
    if (event.phase !== 'poll' || event.outcome === 'cancelled') return;
    const device = this.device(event);
    device.pollIntervalMs = event.pollIntervalMs;
    device.attempts++;
    device.maxQueueDelayMs = Math.max(device.maxQueueDelayMs, event.queueDelayMs || 0);
    if (event.outcome === 'ok' || event.outcome === 'partial') {
      device[event.outcome]++;
      if (device.lastSuccessAt) {
        const gap = Date.parse(event.endedAt) - Date.parse(device.lastSuccessAt);
        if (gap >= 0) {
          device.lastIntervalMs = gap;
          device.maxIntervalMs = Math.max(device.maxIntervalMs || 0, gap);
        }
      }
      device.lastSuccessAt = event.endedAt;
    } else device.failed++;
    if (event.outcome === 'timeout' || event.frames.some(frame => frame.outcome === 'timeout')) device.timeouts++;
  }

  storage(event) {
    if (!event.attemptId) return;
    this.enqueue({ type: 'storage', ...event });
    if (event.phase !== 'poll') return;
    if (event.outcome === 'saved') this.device(event).saved++;
    if (event.outcome === 'error') this.device(event).storageErrors++;
  }

  snapshot() {
    return { runId: this.metadata.runId, devices: [...this.devices.values()], lostEvents: this.lostEvents,
      lastError: this.lastError, available: this.initialized };
  }

  async initialize() {
    if (this.initialized) return;
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(path.join(this.directory, 'run.json'), JSON.stringify(this.metadata, null, 2), 'utf8');
    this.initialized = true;
  }

  flush() {
    if (this.writing || !this.pending.length) return this.writing;
    const batch = this.pending.splice(0);
    this.writing = this.initialize().then(() => fs.appendFile(path.join(this.directory, 'events.ndjson'), batch.join('\n') + '\n', 'utf8'))
      .then(() => { this.lastError = ''; }, error => { this.lostEvents += batch.length; this.lastError = error.message; })
      .finally(() => { this.writing = null; });
    return this.writing;
  }

  finish(reason) {
    this.finishing ??= this.writeFinalState(reason);
    return this.finishing;
  }

  async writeFinalState(reason) {
    await this.writing;
    await this.flush();
    try {
      await this.initialize();
      await fs.writeFile(path.join(this.directory, 'quality.json'), JSON.stringify({ ...this.snapshot(), endedAt: new Date().toISOString(), reason }, null, 2), 'utf8');
    } catch (error) { this.lastError = error.message; }
    this.finished = true;
  }
}

module.exports = { RunDiagnostics };
