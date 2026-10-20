'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { SerialPort } = require('serialport');
const { FleetService } = require('./fleet-service.cjs');
const { DataStore, CSV_KEYS, csvRow } = require('./data-store.cjs');

if (process.env.VECTRA_TEST_DATA) app.setPath('userData', process.env.VECTRA_TEST_DATA);
let mainWindow, fleet, store, busy = false, quitting = false;
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
const send = (channel, payload) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); };
async function exclusive(action) {
  if (busy) return { ok: false, message: 'กำลังดำเนินการเชื่อมต่อ กรุณารอ' };
  busy = true;
  try { return await action(); } finally { busy = false; }
}
async function record(reading) {
  try { await store.append(reading); send('sensor:reading', { ...reading, recorded: true }); }
  catch (error) {
    send('sensor:reading', { ...reading, recorded: false });
    send('sensor:status', { state: 'storage-error', motorId: reading.motorId, message: error.message });
  }
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  store = new DataStore(app.getPath('userData'));
  fleet = new FleetService({ onReading: record, onStatus: status => send('sensor:status', status) });
  mainWindow = new BrowserWindow({
    width: 1440, height: 940, minWidth: 960, minHeight: 680, backgroundColor: '#101215', show: false, autoHideMenuBar: true,
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
  handle('app:initialize', () => ({ ok: true, profiles: store.loadProfiles(), dataPath: store.dataPath(), version: app.getVersion() }));
  handle('sensor:list-ports', async () => ({ ok: true, ports: (await SerialPort.list()).map(port => ({ path: port.path, manufacturer: port.manufacturer || '', vendorId: port.vendorId || '', productId: port.productId || '' })) }));
  handle('profiles:save', raw => {
    if (fleet.buses.length || busy) throw new Error('หยุดการอ่านก่อนแก้ไขมอเตอร์');
    return { ok: true, profiles: store.saveProfiles(raw) };
  });
  handle('sensor:test', config => exclusive(() => fleet.test(config)));
  handle('sensor:connect', raw => exclusive(async () => {
    const result = await fleet.connect(raw);
    await Promise.all(result.readings.map(reading => store.append(reading)));
    return { ...result, readings: result.readings.map(reading => ({ ...reading, recorded: true })) };
  }).catch(async error => { await fleet.disconnect(); throw error; }));
  handle('sensor:disconnect', () => exclusive(async () => { await fleet.disconnect(); await store.queue; return { ok: true }; }));
  handle('data:history', async filter => ({ ok: true, ...await store.history(filter) }));
  handle('data:open-folder', async () => {
    await fs.promises.mkdir(store.dataPath(), { recursive: true });
    const error = await shell.openPath(store.dataPath());
    return { ok: !error, message: error };
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
  Promise.resolve().then(() => fleet?.disconnect()).then(() => store?.queue).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
