'use strict';

const { randomUUID } = require('node:crypto');

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
    this.runId = ''; this.runStartedAt = ''; this.runGroupId=''; this.runGroupName=''; this.recordingId = ''; this.recordingStartedAt = '';
    this.lastSavedAt = ''; this.lastError = ''; this.stopReason = '';
  }
  snapshot() { return { settings: this.settings, connected: this.connected, active: this.active, waiting: this.waiting, scheduleMissed: this.scheduleMissed, runId: this.runId, runStartedAt: this.runStartedAt, groupId:this.runGroupId, groupName:this.runGroupName, recordingId: this.recordingId, recordingStartedAt: this.recordingStartedAt, startedAt: this.startedAt, endsAt: this.endsAt, count: this.count, lastSavedAt: this.lastSavedAt, lastError: this.lastError, stopReason: this.stopReason }; }
  emit() { this.onChange(this.snapshot()); return this.snapshot(); }
  configure(raw) {
    if (this.connected) throw new Error('หยุดอ่านก่อนเปลี่ยนเงื่อนไขการบันทึก');
    this.settings = normalizeRecording(raw); this.scheduleMissed = false; return this.emit();
  }
  connect(group = null) {
    const now = this.clock();
    this.runId = randomUUID(); this.runStartedAt = new Date(now).toISOString(); this.runGroupId=group?.id||'';this.runGroupName=group?.name||'';this.recordingId = ''; this.recordingStartedAt = '';
    this.scheduleMissed = this.settings.startMode === 'scheduled' && Date.parse(this.settings.startAt) <= now;
    this.connected = true; this.active = false; this.waiting = this.settings.startMode === 'scheduled' && !this.scheduleMissed; this.count = 0;
    this.startedAt = ''; this.endsAt = ''; this.lastSavedAt = ''; this.lastError = ''; this.stopReason = '';
    if (this.settings.startMode === 'on-connect') return this.start();
    return this.emit();
  }
  start() {
    if (!this.connected) throw new Error('เริ่มอ่านข้อมูลก่อนเริ่มบันทึก');
    if (this.active) return this.snapshot();
    const now = this.clock();
    this.recordingId = randomUUID(); this.recordingStartedAt = new Date(now).toISOString();
    this.active = true; this.waiting = false; this.scheduleMissed = false; this.count = 0; this.startedAt = this.recordingStartedAt;
    this.lastSavedAt = ''; this.lastError = ''; this.stopReason = '';
    this.endsAt = this.settings.durationMinutes ? new Date(now + this.settings.durationMinutes * 60000).toISOString() : '';
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
    const save = this.shouldRecord(reading.timestamp);
    // Capture identity before asynchronous I/O: a late write belongs to its original run.
    const runId = this.runId, recordingId = this.recordingId;
    const tagged = { ...reading, schemaVersion: 4, runId, runStartedAt: this.runStartedAt, recordingId: save ? recordingId : '', recordingStartedAt: save ? this.recordingStartedAt : '' };
    if (!save) return { ...tagged, recorded: false, recordingState: this.active && Date.parse(reading.timestamp) < Date.parse(this.startedAt) ? 'before-start' : 'monitor-only' };
    try {
      await store.append(tagged);
      if (this.runId === runId && this.recordingId === recordingId) { this.count++; this.lastSavedAt = new Date(this.clock()).toISOString(); this.lastError = ''; this.emit(); }
      return { ...tagged, recorded: true, recordingState: 'saved' };
    } catch (error) {
      if (this.runId === runId && this.recordingId === recordingId) { this.lastError = error.message; this.emit(); this.onError(reading.motorId, error.message); }
      return { ...tagged, recorded: false, recordingState: 'error' };
    }
  }
  async acceptPower(reading, store) {
    const save=this.shouldRecord(reading.timestamp),runId=this.runId,recordingId=this.recordingId;
    const tagged={...reading,runId,runStartedAt:this.runStartedAt,recordingId:save?recordingId:'',recordingStartedAt:save?this.recordingStartedAt:''};
    if(!save)return {...tagged,recorded:false,recordingState:'monitor-only'};
    try {
      await store.appendPower(tagged);
      if(this.runId===runId&&this.recordingId===recordingId){this.count++;this.lastSavedAt=new Date(this.clock()).toISOString();this.lastError='';this.emit();}
      return {...tagged,recorded:true,recordingState:'saved'};
    } catch(error) {
      if(this.runId===runId&&this.recordingId===recordingId){this.lastError=error.message;this.emit();this.onError(reading.meterId,error.message);}
      return {...tagged,recorded:false,recordingState:'error',storageError:error.message};
    }
  }
}
module.exports = { RecordingService, normalizeRecording };
