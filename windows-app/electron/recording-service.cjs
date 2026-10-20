'use strict';

function normalizeRecording(input = {}) {
  // The primary Start command now includes recording. Preserve explicit read-only mode.
  const startMode = !input.startMode || input.startMode === 'manual' ? 'on-connect' : input.startMode;
  if (!['monitor-only', 'on-connect', 'scheduled'].includes(startMode)) throw new Error('รูปแบบเริ่มบันทึกไม่ถูกต้อง');
  const durationMinutes = Number(input.durationMinutes ?? 0);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 525600) throw new Error('ระยะเวลาบันทึกต้องเป็น 0–525600 นาที');
  if (input.startAt && !Number.isFinite(Date.parse(input.startAt))) throw new Error('วันและเวลาเริ่มบันทึกไม่ถูกต้อง');
  const startAt = input.startAt ? new Date(input.startAt).toISOString() : '';
  if (startMode === 'scheduled' && !startAt) throw new Error('เลือกวันและเวลาเริ่มบันทึก');
  return { startMode, startAt, durationMinutes };
}

class RecordingService {
  constructor({ settings = {}, onChange = () => {}, onError = () => {}, clock = Date.now } = {}) {
    this.settings = normalizeRecording(settings); this.onChange = onChange; this.onError = onError; this.clock = clock;
    this.connected = false; this.active = false; this.startedAt = ''; this.endsAt = ''; this.waiting = false; this.scheduleMissed = false; this.count = 0;
    this.lastSavedAt = ''; this.lastError = ''; this.stopReason = '';
  }
  snapshot() { return { settings: this.settings, connected: this.connected, active: this.active, waiting: this.waiting, scheduleMissed: this.scheduleMissed, startedAt: this.startedAt, endsAt: this.endsAt, count: this.count, lastSavedAt: this.lastSavedAt, lastError: this.lastError, stopReason: this.stopReason }; }
  emit() { this.onChange(this.snapshot()); return this.snapshot(); }
  configure(raw) {
    if (this.connected) throw new Error('หยุดอ่านก่อนเปลี่ยนเงื่อนไขการบันทึก');
    this.settings = normalizeRecording(raw); this.scheduleMissed = false; return this.emit();
  }
  connect() {
    this.scheduleMissed = this.settings.startMode === 'scheduled' && Date.parse(this.settings.startAt) <= this.clock();
    this.connected = true; this.active = false; this.waiting = this.settings.startMode === 'scheduled' && !this.scheduleMissed; this.count = 0;
    this.startedAt = ''; this.endsAt = ''; this.lastSavedAt = ''; this.lastError = ''; this.stopReason = '';
    if (this.settings.startMode === 'on-connect') return this.start();
    return this.emit();
  }
  start() {
    if (!this.connected) throw new Error('เริ่มอ่านข้อมูลก่อนเริ่มบันทึก');
    if (this.active) return this.snapshot();
    this.active = true; this.waiting = false; this.scheduleMissed = false; this.count = 0; this.startedAt = new Date(this.clock()).toISOString();
    this.lastSavedAt = ''; this.lastError = ''; this.stopReason = '';
    this.endsAt = this.settings.durationMinutes ? new Date(this.clock() + this.settings.durationMinutes * 60000).toISOString() : '';
    return this.emit();
  }
  stop(reason = 'user') { this.active = false; this.waiting = false; this.endsAt = ''; this.stopReason = reason; return this.emit(); }
  disconnect() { this.connected = false; return this.stop('disconnected'); }
  tick() {
    if (!this.connected) return;
    if (this.waiting && this.clock() >= Date.parse(this.settings.startAt)) this.start();
    if (this.active && this.endsAt && this.clock() >= Date.parse(this.endsAt)) this.stop('duration');
  }
  shouldRecord(timestamp = this.clock()) {
    this.tick(); const stamp = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
    return this.connected && this.active && Number.isFinite(stamp) && stamp >= Date.parse(this.startedAt);
  }
  async accept(reading, store) {
    if (!this.shouldRecord(reading.timestamp)) return { ...reading, recorded: false, recordingState: this.active && Date.parse(reading.timestamp) < Date.parse(this.startedAt) ? 'before-start' : 'monitor-only' };
    try {
      await store.append(reading); this.count++; this.lastSavedAt = new Date(this.clock()).toISOString(); this.lastError = ''; this.emit();
      return { ...reading, recorded: true, recordingState: 'saved' };
    } catch (error) {
      this.lastError = error.message; this.emit(); this.onError(reading.motorId, error.message);
      return { ...reading, recorded: false, recordingState: 'error' };
    }
  }
}
module.exports = { RecordingService, normalizeRecording };
