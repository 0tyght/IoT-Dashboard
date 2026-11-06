'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SerialPort } = require('serialport');
const { FleetService } = require('./fleet-service.cjs');
const { DataStore } = require('./data-store.cjs');
const { RecordingService } = require('./recording-service.cjs');
const { RunDiagnostics } = require('./run-diagnostics.cjs');
const { normalizeGroups, resolveGroup } = require('./measurement-groups.cjs');
const { applyBus, applyGroupBuses } = require('./bus-config.cjs');

if (process.env.VECTRA_TEST_DATA) app.setPath('userData', process.env.VECTRA_TEST_DATA);
let mainWindow, fleet, store, recording, recordingTimer, busy = false, quitting = false, activeGroup = null;
let diagnostics, diagnosticTimer;
const pendingReadings = new Set();
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
const send = (channel, payload) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); };
async function exclusive(action) {
  if (busy) return { ok: false, message: 'กำลังดำเนินการเชื่อมต่อ กรุณารอ' };
  busy = true;
  try { return await action(); } finally { busy = false; }
}
function record(reading, power = false, phase = 'poll') {
  const current = diagnostics, group = activeGroup, started = performance.now();
  const tagged = { ...reading, groupId: group?.id || '', groupName: group?.name || '' };
  const options = { preflight: phase === 'startup' };
  const write = power ? recording.acceptPower(tagged, store, options) : recording.accept(tagged, store, options);
  const task = write.then(result => {
    current?.storage({ attemptId: reading.attemptId, deviceId: power ? reading.meterId : reading.motorId,
      deviceType: power ? 'power' : 'sensor', phase, timestamp: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started),
      outcome: result.recordingState, recordingId: result.recordingId, message: result.storageError || '' });
    return result;
  }).finally(() => pendingReadings.delete(task));
  pendingReadings.add(task);
  return task;
}
async function recordPower(reading, phase = 'poll') {
  if(reading.state!=='receiving') { send('power:reading',reading); return reading; }
  const result = await record(reading, true, phase);
  send('power:reading',result); return result;
}

function publishDiagnostics() {
  if (diagnostics) send('diagnostics:state', diagnostics.snapshot());
}

async function finishDiagnostics(reason) {
  await Promise.allSettled(pendingReadings);
  await diagnostics?.finish(reason);
  publishDiagnostics();
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'light';
  store = new DataStore(app.getPath('userData'));
  recording = new RecordingService({
    onChange: state => send('recording:state', state),
    onError: (motorId, message) => send('sensor:status', { state: 'storage-error', motorId, message }),
    onStop: runId => {
      void store.generateRunReport(runId).catch(error => send('sensor:status', { state: 'storage-error', motorId: '', message: `สร้าง CSV ของรอบไม่สำเร็จ: ${error.message}` }));
    }
  });
  recordingTimer = setInterval(() => recording.tick(), 250);
  diagnosticTimer = setInterval(() => {
    if (!diagnostics || diagnostics.finished) return;
    void diagnostics.flush();
    publishDiagnostics();
  }, 750);
  fleet = new FleetService({ onReading: reading => record(reading).then(result => send('sensor:reading', result)),
    onPower: reading => void recordPower(reading), onStatus: status => send('sensor:status', status),
    onAttempt: attempt => diagnostics?.attempt(attempt), onDeviceStatus: status => send('device:status',status) });
  const available = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1440, available.width), height: Math.min(940, available.height), minWidth: Math.min(768, available.width), minHeight: Math.min(680, available.height), backgroundColor: '#f7f8fb', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'app.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());

  function handle(channel, action) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Invalid sender');
      try { return await action(...args); } catch (error) { return { ok: false, message: error.message }; }
    });
  }
  handle('app:initialize', () => { recording.configure(store.loadRecording());const buses=store.loadBuses(); return { ok: true, profiles: store.loadProfiles().map(item=>applyBus(item,buses)), groups:store.loadGroups().map(item=>applyGroupBuses(item,buses)), meterLibrary:store.loadMeterLibrary(), selectedGroup:store.loadSelectedGroup(), templates:store.loadTemplates(), buses, dataPath: store.dataPath(), version: app.getVersion(), recording: recording.snapshot() }; });
  handle('group-selection:save', id => {if(fleet.buses.length||busy)throw new Error('หยุดอ่านก่อนเปลี่ยนชุด');return {ok:true,id:store.saveSelectedGroup(id)};});
  handle('buses:save', raw => {
    if(fleet.buses.length||busy)throw new Error('หยุดอ่านก่อนแก้ไขบัส');
    const previous=store.loadBuses(),next=store.normalizeBuses(raw),used=[...store.loadProfiles(),...store.loadGroups().flatMap(group=>group.meters)];
    for(const bus of previous)if(!next.some(item=>item.path.toUpperCase()===bus.path.toUpperCase())&&used.some(item=>item.path.toUpperCase()===bus.path.toUpperCase()))throw new Error(`บัส ${bus.path} ยังมีอุปกรณ์ใช้งานอยู่`);
    return {ok:true,buses:store.saveBuses(next)};
  });
  handle('groups:save', raw => {
    if(fleet.buses.length||busy) throw new Error('หยุดอ่านก่อนแก้ไขชุดการวัด');
    const incoming=normalizeGroups(raw), previous=store.loadGroups(), buses=store.loadBuses(),profiles=store.loadProfiles().map(item=>applyBus(item,buses));
    for(const group of incoming) { const old=previous.find(item=>item.id===group.id); if(!old||JSON.stringify(old)!==JSON.stringify(group)) resolveGroup(applyGroupBuses(group,buses),profiles,{allowDisabled:true}); }
    const groups=store.saveGroups(incoming.map(group=>applyGroupBuses(group,buses)));
    return {ok:true,groups,meterLibrary:store.loadMeterLibrary()};
  });
  handle('meter-library:remove', key => {
    if(fleet.buses.length||busy)throw new Error('หยุดอ่านก่อนแก้ไขคลังอุปกรณ์');
    if(store.loadGroups().some(group=>group.meters.some(meter=>`${group.id}:${meter.id}`.toUpperCase()===String(key).toUpperCase())))throw new Error('นำอุปกรณ์ออกจากพื้นที่งานก่อนลบจากคลัง');
    return {ok:true,meterLibrary:store.saveMeterLibrary(store.loadMeterLibrary().filter(entry=>entry.key!==key))};
  });
  handle('meter-library:save', (key,meter) => {
    if(fleet.buses.length||busy)throw new Error('หยุดอ่านก่อนแก้ไขคลังอุปกรณ์');
    if(store.loadGroups().some(group=>group.meters.some(item=>`${group.id}:${item.id}`.toUpperCase()===String(key).toUpperCase())))throw new Error('อุปกรณ์นี้ยังใช้ในพื้นที่งาน ตั้งค่าจากอุปกรณ์ในพื้นที่งานนั้น');
    const entries=store.loadMeterLibrary(),entry=entries.find(item=>item.key===key);if(!entry)throw new Error('ไม่พบอุปกรณ์ในคลัง');
    const nextKey=`${key.split(':')[0]}:${meter.id}`;
    return {ok:true,meterLibrary:store.saveMeterLibrary(entries.map(item=>item.key===key?{...entry,key:nextKey,meter:{...meter,motorId:''}}:item))};
  });
  handle('recording:configure', raw => {
    if (fleet.buses.length || busy) throw new Error('หยุดอ่านก่อนเปลี่ยนการบันทึก');
    const settings = store.saveRecording(raw); return { ok: true, recording: recording.configure(settings) };
  });
  handle('recording:start', () => { if (busy) throw new Error('รอการเชื่อมต่อให้เสร็จก่อน'); return { ok: true, recording: recording.start() }; });
  handle('recording:stop', () => exclusive(async () => { recording.stop(); await store.queue; await store.reportQueue; return { ok: true, recording: recording.snapshot() }; }));
  handle('sensor:list-ports', async () => ({ ok: true, ports: (await SerialPort.list()).map(port => ({ path: port.path, manufacturer: port.manufacturer || '', vendorId: port.vendorId || '', productId: port.productId || '' })) }));
  function saveProfilesChecked(raw) {
    if (fleet.buses.length || busy) throw new Error('หยุดการอ่านก่อนแก้ไขอุปกรณ์');
    const old=store.loadProfiles(),groups=store.loadGroups(),nextIds=new Set(raw.map(item=>String(item.motorId||'').toUpperCase()));
    for(const profile of old)if(!nextIds.has(profile.motorId.toUpperCase())){const refs=groups.filter(group=>group.motorIds.some(id=>id.toUpperCase()===profile.motorId.toUpperCase()));if(refs.length)throw new Error(`อุปกรณ์ ${profile.motorId} ยังอยู่ในพื้นที่งาน ${refs.map(group=>group.name).join(', ')} กรุณานำออกจากพื้นที่งานก่อนลบหรือเปลี่ยนรหัส`);}
    for(const group of groups)resolveGroup(applyGroupBuses(group,store.loadBuses()),raw.map(item=>applyBus(item,store.loadBuses())),{allowDisabled:true});
    return { ok: true, profiles: store.saveProfiles(raw.map(item=>applyBus(item,store.loadBuses()))) };
  }
  handle('profiles:save', saveProfilesChecked);
  handle('templates:save', raw => ({ok:true,templates:store.saveTemplates(raw)}));
  handle('power:test-config', raw => exclusive(() => {
    const meter=normalizeGroups([{id:'TEST',name:'Test',motorIds:[],meters:[{...raw,motorId:''}]}])[0].meters[0];
    const field=require('../src/power-registers.js').preset(meter.model).fields[0];
    return fleet.testPower({...applyBus(meter,store.loadBuses()),motorId:meter.id,sensorModel:'custom',byteOrder:'ABCD',registerAddress:0,dataType:'float32',scale:1,unit:field.unit},
      {address:field.address+meter.offsetAdjust,slaveId:meter.slaveId,registerType:meter.registerType,meterConfig:true});
  }));
  handle('sensor:test', config => exclusive(() => fleet.test(applyBus(config,store.loadBuses()))));
  handle('power:test-meter', (groupId,meterId,options) => exclusive(() => {
    const group=store.loadGroups().find(item=>item.id===groupId),meter=group?.meters.find(item=>item.id===meterId);
    if(!meter)throw new Error('ไม่พบ Power Meter ในชุดที่เลือก');
    resolveGroup(applyGroupBuses(group,store.loadBuses()),store.loadProfiles().map(item=>applyBus(item,store.loadBuses())),{allowDisabled:true});
    return fleet.testPower({...applyBus(meter,store.loadBuses()),motorId:meter.id,sensorModel:'custom',byteOrder:'ABCD',registerAddress:3017,dataType:'float32',scale:1,unit:'V'},{address:options?.address,slaveId:meter.slaveId,registerType:options?.registerType||meter.registerType,meterConfig:true});
  }));
  handle('sensor:connect', (_profiles, groupId) => exclusive(async () => {
    if (fleet.buses.length) throw new Error('หยุดรอบปัจจุบันก่อนเริ่มอ่านใหม่');
    if (!groupId) throw new Error('ยังไม่ได้เลือกพื้นที่งาน');
    const group = store.loadGroups().find(item => item.id === groupId);
    if (!group) throw new Error('ไม่พบพื้นที่งานที่เลือก');
    const buses = store.loadBuses();
    const selection = resolveGroup(applyGroupBuses(group, buses), store.loadProfiles().map(item => applyBus(item, buses)), {allowDisabled:true});
    const runId = randomUUID();
    diagnostics = new RunDiagnostics(path.join(store.runDataPath(runId), 'diagnostics'), {
      schemaVersion: 1, runId, appVersion: app.getVersion(), startedAt: new Date().toISOString(),
      group: { id: group.id, name: group.name }, recordingMode: recording.settings.startMode,
      sensors: selection.motors.filter(profile => profile.enabled !== false), meters: selection.meters
    });
    publishDiagnostics();
    activeGroup = group;
    try {
      const result = await fleet.connect(selection.motors,selection.meters);
      recording.connect(group, runId);
      return { ...result, readings: await Promise.all(result.readings.map(reading => record(reading, false, 'startup'))),
        powerReadings: await Promise.all(result.powerReadings.map(reading => recordPower(reading, 'startup'))), recording: recording.snapshot() };
    } catch (error) {
      recording.disconnect();
      await fleet.disconnect();
      if (!quitting) await finishDiagnostics('startup-error');
      activeGroup=null;
      throw error;
    }
  }));
  handle('sensor:disconnect', () => exclusive(async () => {
    recording.disconnect();
    await fleet.disconnect();
    await store.queue;
    await finishDiagnostics('disconnected');
    await store.reportQueue;
    activeGroup = null;
    return { ok: true, recording: recording.snapshot() };
  }));
  handle('diagnostics:open-folder', async () => {
    const current = diagnostics;
    await current?.flush();
    if (!current?.initialized) throw new Error('ยังไม่มีไฟล์วินิจฉัยของรอบนี้');
    const error = await shell.openPath(current.directory);
    return { ok: !error, message: error };
  });
  handle('data:history', async filter => ({ ok: true, ...await store.history(filter) }));
  handle('data:runs', async filter => ({ok:true,...await require('./record-library.cjs').listRuns(store,filter)}));
  handle('data:run-device', async filter => ({ok:true,...await require('./record-library.cjs').deviceRows(store,filter)}));
  handle('data:run-quality', async runId => ({ok:true,...await require('./record-library.cjs').runQuality(store,runId)}));
  handle('data:run-events', async filter => ({ok:true,...await require('./record-library.cjs').runEvents(store,filter)}));
  handle('data:sample-details', async filter => ({ok:true,...await require('./record-library.cjs').sampleDetails(store,filter)}));
  handle('settings:export', async () => {
    const backup=require('./settings-backup.cjs');
    const result=await dialog.showSaveDialog(mainWindow,{title:'สำรองการตั้งค่าทั้งหมด',defaultPath:`VECTRA-Settings-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'VECTRA settings',extensions:['json']}]});
    if(result.canceled)return {ok:true,canceled:true};
    await fs.promises.writeFile(result.filePath,JSON.stringify(backup.snapshot(store),null,2),'utf8');
    return {ok:true};
  });
  handle('settings:import', () => exclusive(async () => {
    if(fleet.buses.length)throw new Error('หยุดอ่านก่อนกู้คืนการตั้งค่า');
    const result=await dialog.showOpenDialog(mainWindow,{title:'กู้คืนการตั้งค่าทั้งหมด',properties:['openFile'],filters:[{name:'VECTRA settings',extensions:['json']}]});
    if(result.canceled)return {ok:true,canceled:true};
    if((await fs.promises.stat(result.filePaths[0])).size>5*1024*1024)throw new Error('ไฟล์สำรองต้องไม่เกิน 5 MB');
    const backup=require('./settings-backup.cjs'), raw=JSON.parse(await fs.promises.readFile(result.filePaths[0],'utf8')), next=backup.validate(store,raw);
    const response=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['ยกเลิก','แทนที่การตั้งค่า'],defaultId:0,cancelId:0,message:'กู้คืนการตั้งค่าจากไฟล์นี้?',detail:`${next.profiles.length} อุปกรณ์ · ${next.groups.length} พื้นที่งาน · ${next.groups.reduce((n,g)=>n+g.meters.length,0)} การตั้งค่ามิเตอร์ · ${next.buses.length} บัส · ${next.templates.length} แม่แบบ\nบันทึกสำเนาการตั้งค่าปัจจุบันก่อนแทนที่ ข้อมูลการวัดเดิมยังอยู่`});
    if(response.response!==1)return {ok:true,canceled:true};
    const restored=backup.restore(store,next);recording.configure(restored.settings.recording);
    return {ok:true,recovery:restored.recovery};
  }));
  handle('data:recorded-days', async () => ({ ok: true, days: await store.recordedDays() }));
  handle('data:point-days', async () => ({ok:true,days:await store.pointDays()}));
  handle('data:point-history', async filter => ({ok:true,...await store.pointHistory(filter)}));
  handle('data:power-days', async () => ({ok:true,days:await store.powerDays()}));
  handle('data:power-history', async filter => ({ok:true,...await store.powerHistory(filter)}));
  handle('data:chart-range', async filter => ({ ok: true, ...await store.chartRange(filter) }));
  handle('data:scatter-range', async filter => ({ ok: true, ...await store.scatterRange(filter) }));
  handle('data:trend-range', async filter => ({ ok: true, ...await store.trendRange(filter) }));
  handle('data:open-folder', async () => {
    await fs.promises.mkdir(store.outputPath(), { recursive: true });
    const error = await shell.openPath(store.outputPath());
    return { ok: !error, message: error };
  });
  handle('data:open-run-folder', async runId => {
    const { directory } = await store.generateRunReport(runId);
    if (!directory) throw new Error('รอบนี้ยังไม่มีข้อมูลที่บันทึกสำหรับสร้าง CSV');
    const error = await shell.openPath(directory); return { ok: !error, message: error };
  });
  handle('analysis:import-waveform', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'เปิด Waveform CSV', properties: ['openFile'], filters: [{ name: 'Waveform CSV', extensions: ['csv'] }] });
    if (result.canceled) return { ok: true, canceled: true };
    const file = result.filePaths[0];
    if ((await fs.promises.stat(file)).size > 32 * 1024 * 1024) throw new Error('Waveform CSV ต้องมีขนาดไม่เกิน 32 MB');
    return { ok: true, fileName: path.basename(file), text: await fs.promises.readFile(file, 'utf8') };
  });
  handle('data:export', async filter => {
    const result = await dialog.showSaveDialog(mainWindow, { title: 'ส่งออกประวัติรายค่า CSV', defaultPath: `VECTRA-History-${filter.date}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled) return { ok: true, canceled: true };
    const total = await store.exportHistory(filter, result.filePath);
    return { ok: true, total, filePath: result.filePath };
  });
  handle('profiles:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow, { title: 'สำรองรายชื่อมอเตอร์', defaultPath: 'vectra-motors.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled) return { ok: true, canceled: true };
    await fs.promises.writeFile(result.filePath, JSON.stringify({ version: 1, motors: store.loadProfiles() }, null, 2), 'utf8');
    return { ok: true };
  });
  handle('profiles:import', async () => {
    if (fleet.buses.length || busy) throw new Error('หยุดการอ่านก่อนนำเข้ามอเตอร์');
    const result = await dialog.showOpenDialog(mainWindow, { title: 'นำเข้ารายชื่อมอเตอร์', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled) return { ok: true, canceled: true };
    if ((await fs.promises.stat(result.filePaths[0])).size > 1024 * 1024) throw new Error('ไฟล์มีขนาดเกิน 1 MB');
    const raw = JSON.parse(await fs.promises.readFile(result.filePaths[0], 'utf8'));
    const confirmed = await dialog.showMessageBox(mainWindow, { type: 'question', buttons: ['ยกเลิก', 'แทนที่รายชื่อ'], defaultId: 0, cancelId: 0, message: 'แทนที่รายชื่อมอเตอร์ทั้งหมดด้วยไฟล์นี้?', detail: 'สามารถสำรองรายชื่อปัจจุบันก่อนนำเข้าได้' });
    if (confirmed.response !== 1) return { ok: true, canceled: true };
    if (!Array.isArray(raw.motors)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
    return saveProfilesChecked(raw.motors);
  });
});

app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  clearInterval(recordingTimer); clearInterval(diagnosticTimer); recording?.disconnect();
  Promise.resolve().then(() => fleet?.disconnect()).then(() => store?.queue).then(() => finishDiagnostics('app-closed')).then(() => store?.reportQueue).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
