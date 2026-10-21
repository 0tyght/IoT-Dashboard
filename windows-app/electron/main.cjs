'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { SerialPort } = require('serialport');
const { FleetService } = require('./fleet-service.cjs');
const { DataStore, CSV_KEYS, csvRow } = require('./data-store.cjs');
const { RecordingService } = require('./recording-service.cjs');

if (process.env.VECTRA_TEST_DATA) app.setPath('userData', process.env.VECTRA_TEST_DATA);
let mainWindow, fleet, store, recording, recordingTimer, busy = false, quitting = false;
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
const send = (channel, payload) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); };
async function exclusive(action) {
  if (busy) return { ok: false, message: 'กำลังดำเนินการเชื่อมต่อ กรุณารอ' };
  busy = true;
  try { return await action(); } finally { busy = false; }
}
async function record(reading) {
  return recording.accept(reading, store);
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'light';
  store = new DataStore(app.getPath('userData'));
  recording = new RecordingService({ onChange: state => send('recording:state', state), onError: (motorId, message) => send('sensor:status', { state: 'storage-error', motorId, message }) });
  recordingTimer = setInterval(() => recording.tick(), 250);
  fleet = new FleetService({ onReading: reading => record(reading).then(result => send('sensor:reading', result)), onStatus: status => send('sensor:status', status) });
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
  handle('app:initialize', () => { recording.configure(store.loadRecording()); return { ok: true, profiles: store.loadProfiles(), dataPath: store.dataPath(), version: app.getVersion(), recording: recording.snapshot() }; });
  handle('recording:configure', raw => {
    if (fleet.buses.length || busy) throw new Error('หยุดอ่านก่อนเปลี่ยนการบันทึก');
    const settings = store.saveRecording(raw); return { ok: true, recording: recording.configure(settings) };
  });
  handle('recording:start', () => { if (busy) throw new Error('รอการเชื่อมต่อให้เสร็จก่อน'); return { ok: true, recording: recording.start() }; });
  handle('recording:stop', () => exclusive(async () => { recording.stop(); await store.queue; return { ok: true, recording: recording.snapshot() }; }));
  handle('sensor:list-ports', async () => ({ ok: true, ports: (await SerialPort.list()).map(port => ({ path: port.path, manufacturer: port.manufacturer || '', vendorId: port.vendorId || '', productId: port.productId || '' })) }));
  handle('profiles:save', raw => {
    if (fleet.buses.length || busy) throw new Error('หยุดการอ่านก่อนแก้ไขมอเตอร์');
    return { ok: true, profiles: store.saveProfiles(raw) };
  });
  handle('sensor:test', config => exclusive(() => fleet.test(config)));
  handle('sensor:connect', raw => exclusive(async () => {
    const result = await fleet.connect(raw);
    recording.connect();
    return { ...result, readings: await Promise.all(result.readings.map(record)), recording: recording.snapshot() };
  }).catch(async error => { recording.disconnect(); await fleet.disconnect(); throw error; }));
  handle('sensor:disconnect', () => exclusive(async () => { recording.disconnect(); await fleet.disconnect(); await store.queue; return { ok: true, recording: recording.snapshot() }; }));
  handle('data:history', async filter => ({ ok: true, ...await store.history(filter) }));
  handle('data:chart-range', async filter => ({ ok: true, ...await store.chartRange(filter) }));
  handle('data:open-folder', async () => {
    await fs.promises.mkdir(store.dataPath(), { recursive: true });
    const error = await shell.openPath(store.dataPath());
    return { ok: !error, message: error };
  });
  handle('data:open-run-folder', async runId => {
    const directory = store.runDataPath(runId);
    if (!fs.existsSync(directory)) throw new Error('รอบนี้ยังไม่มีไฟล์ที่บันทึก');
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
    const result = await dialog.showSaveDialog(mainWindow, { title: 'ส่งออกข้อมูล CSV', defaultPath: `VECTRA-${filter.date}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled) return { ok: true, canceled: true };
    const output = fs.createWriteStream(result.filePath, { encoding: 'utf8' });
    let streamError;
    output.on('error', error => { streamError = error; });
    try {
      output.write('\uFEFF' + CSV_KEYS.join(',') + '\r\n');
      const summary = await store.history(filter, async reading => {
        if (streamError) throw streamError;
        if (!output.write(csvRow(reading))) await once(output, 'drain');
      });
      output.end(); await once(output, 'finish');
      return { ok: true, total: summary.total, filePath: result.filePath };
    } catch (error) { output.destroy(); throw error; }
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
    return { ok: true, profiles: store.saveProfiles(raw.motors) };
  });
});

app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  clearInterval(recordingTimer); recording?.disconnect();
  Promise.resolve().then(() => fleet?.disconnect()).then(() => store?.queue).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
