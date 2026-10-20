'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

(async () => {
  const project = path.join(__dirname, '..'), artifacts = path.join(project, '.artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vectra-ui-'));
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  fs.mkdirSync(path.join(temporary, 'data'));
  fs.writeFileSync(path.join(temporary, 'data', `readings-${date}.ndjson`), JSON.stringify({ motorId: 'MTR-01', timestamp: new Date().toISOString(), value: 2.4, channels: { velocityX: 1.2, velocityY: 2.4, velocityZ: 1.8, temperature: -5 }, port: 'COM987', slaveId: 1, unit: 'mm/s' }) + '\n');
  const packaged = process.env.ELECTRON_EXECUTABLE;
  const app = await electron.launch({ ...(packaged ? { executablePath: packaged, args: [] } : { args: ['.'], cwd: project }), env: { ...process.env, VECTRA_TEST_DATA: temporary } });
  try {
    const page = await app.firstWindow(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#app-version').filter({ hasText: 'v0.5.0' }).waitFor();
    assert(await page.locator('#connect-all').isDisabled());
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('sensor:list-ports');
      ipcMain.handle('sensor:list-ports', () => ({ ok: true, ports: [{ path: 'COM987', manufacturer: 'Test RS485 adapter', vendorId: 'TEST' }] }));
    });
    await page.locator('#new-motor').click();
    await page.locator('.port-button').click();
    await page.locator('[name="name"]').fill('Cooling water pump');
    await page.locator('[name="area"]').fill('Utility');
    await page.locator('[name="slaveId"]').fill('1');
    await page.screenshot({ path: path.join(artifacts, 'connection-setup.png') });
    await page.locator('#save-motor').click();
    await page.locator('#connection-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.motor-item').count(), 1);
    await page.locator('#new-motor').click();
    await page.locator('[name="slaveId"]').fill('2');
    await page.locator('[name="name"]').fill('Conveyor drive');
    await page.locator('#save-motor').click();
    await page.locator('#connection-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.motor-item').count(), 2);

    await page.locator('#demo-mode').click();
    await page.locator('#monitor-content').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#channel-body tr').count(), 3);
    assert(await page.locator('#new-motor').isDisabled());
    assert.equal(await page.locator('#register-body tr').count(), 10);
    await page.locator('#trend-chart').hover();
    await page.locator('#chart-tooltip').waitFor({ state: 'visible' });
    await page.locator('#pause-stream').click();
    assert((await page.locator('#chart-live').textContent()).includes('PAUSED'));
    await page.locator('#pause-stream').click();
    await page.locator('#chart-kind').selectOption('acceleration');
    assert.equal(await page.locator('#trend-chart polyline').count(), 3);
    await page.locator('#chart-kind').selectOption('velocity');
    for (const [width, height] of [[960, 680], [1366, 768], [1920, 1080]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
      await page.waitForTimeout(120);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} page overflow`);
      assert(await page.locator('#disconnect').isVisible());
      await page.screenshot({ path: path.join(artifacts, `monitor-${width}.png`) });
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    await page.locator('[data-tab="registers"]').click();
    await page.screenshot({ path: path.join(artifacts, 'register-monitor.png') });
    await page.locator('[data-tab="history"]').click();
    await page.locator('#history-summary').filter({ hasText: '1 รายการ' }).waitFor();
    assert((await page.locator('#history-body').textContent()).includes('-5.0'));
    const exportPath = path.join(temporary, 'readings-export.csv');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
    await page.locator('#export-csv').click();
    await page.waitForFunction(() => !document.getElementById('export-csv').disabled);
    assert(fs.readFileSync(exportPath, 'utf8').includes('"MTR-01"'));
    assert(fs.readFileSync(exportPath, 'utf8').includes('"-5"'));
    await page.locator('#disconnect').click();
    await page.locator('#new-motor').waitFor();
    await page.waitForFunction(() => !document.getElementById('new-motor').disabled);
    assert.equal(await page.locator('.motor-item').count(), 2);
    await page.locator('[data-tab="motors"]').click();
    const backupPath = path.join(temporary, 'backup.json');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, backupPath);
    await page.locator('#export-profiles').click();
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('สำรองรายชื่อแล้ว'));
    assert.equal(JSON.parse(fs.readFileSync(backupPath, 'utf8')).motors.length, 2);
    await page.locator('[data-delete="MTR-02"]').click();
    await page.locator('#accept-confirm').click();
    await page.waitForFunction(() => document.querySelectorAll('.motor-item').length === 1);
    const saved = JSON.parse(fs.readFileSync(path.join(temporary, 'motors.json'), 'utf8'));
    assert.equal(saved.length, 1); assert.equal(saved[0].motorId, 'MTR-01');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      dialog.showMessageBox = async () => ({ response: 1 });
    }, backupPath);
    await page.locator('#import-profiles').click();
    await page.waitForFunction(() => document.querySelectorAll('.motor-item').length === 2);
    // Exercise the complete renderer live/error/recovery lifecycle using an isolated IPC fixture.
    // The actual serial scheduler and decoder are tested with FakeClient in fleet-store.cjs.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('sensor:connect');
      ipcMain.handle('sensor:connect', (_event, configs) => ({ ok: true, configs, readings: configs.map(config => ({
        motorId: config.motorId, value: 3.4, primaryAxis: 'Z', unit: 'mm/s', port: config.path, slaveId: config.slaveId,
        timestamp: new Date().toISOString(), elapsedMs: 24, recorded: true,
        channels: { temperature: 35, velocityX: 1.2, velocityY: 2.3, velocityZ: 3.4, displacementX: 4000, displacementY: 20, displacementZ: 30, accelerationX: -1, accelerationY: 1.2, accelerationZ: 1.3 },
        rawRegisters: { primary: [350, 12, 23, 34, 40000, 200, 300], acceleration: [65526, 12, 13] }
      })) }));
    });
    await page.locator('#connect-all').click();
    await page.locator('#mode-indicator').filter({ hasText: 'ACQUIRING' }).waitFor();
    assert.equal(await page.locator('#reading-value').textContent(), '3.40');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('sensor:status', { state: 'read-error', motorId: 'MTR-01', message: 'Test timeout' }));
    await page.locator('#selection-state.fault').waitFor();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('sensor:reading', { motorId: 'MTR-01', value: 2.5, unit: 'mm/s', timestamp: new Date(Date.now() + 50).toISOString(), rawRegisters: [25], recorded: true }));
    await page.locator('#selection-state.online').waitFor();
    assert.equal(await page.locator('#reading-value').textContent(), '2.50');
    await page.locator('#disconnect').click();
    await page.waitForFunction(() => !document.getElementById('new-motor').disabled);
    assert.equal(fs.readFileSync(path.join(temporary, 'data', `readings-${date}.ndjson`), 'utf8').trim().split('\n').length, 1, 'simulation must not write readings');
    assert.deepEqual(errors, []);
    console.log('PASS: isolated profile CRUD, shared port IDs, demo, all channels, register monitor, pointer chart, pause, history and 3 screen sizes');
  } finally { await app.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
