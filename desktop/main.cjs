'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SensorService } = require('./sensor-service.cjs');

let mainWindow;
let sensorService;

function userFile(name) {
  return path.join(app.getPath('userData'), name);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(userFile('sensor-config.json'), 'utf8'));
  } catch {
    return null;
  }
}

function writeConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(userFile('sensor-config.json'), JSON.stringify(config, null, 2), 'utf8');
}

function localDate(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(iso));
}

function appendReading(reading) {
  const directory = userFile('data');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `readings-${localDate(reading.timestamp)}.ndjson`);
  fs.appendFile(file, `${JSON.stringify(reading)}\n`, error => {
    if (error) mainWindow?.webContents.send('sensor:status', { state: 'storage-error', message: error.message });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#071413',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}

app.whenReady().then(() => {
  createWindow();
  sensorService = new SensorService({
    onReading: reading => {
      appendReading(reading);
      mainWindow?.webContents.send('sensor:reading', reading);
    },
    onStatus: status => mainWindow?.webContents.send('sensor:status', status)
  });

  ipcMain.handle('sensor:list-ports', () => SensorService.listPorts());
  ipcMain.handle('sensor:load-config', () => readConfig());
  ipcMain.handle('sensor:test', async (_event, config) => {
    try {
      return await SensorService.test(config);
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
  ipcMain.handle('sensor:connect', async (_event, config) => {
    try {
      const result = await sensorService.connect(config);
      writeConfig(result.config);
      return result;
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
  ipcMain.handle('sensor:disconnect', async () => {
    await sensorService.disconnect();
    return { ok: true };
  });
  ipcMain.handle('data:path', () => userFile('data'));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => sensorService?.disconnect());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
