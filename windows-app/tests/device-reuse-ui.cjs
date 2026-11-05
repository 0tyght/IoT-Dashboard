'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { DataStore } = require('../electron/data-store.cjs');

(async () => {
  const project = path.resolve(__dirname, '..');
  const base = path.join(project, '.test-tmp');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'device-reuse-ui-'));
  const store = new DataStore(root);
  store.saveProfiles([
    { motorId: 'M1', path: 'COM8', slaveId: 1, sensorModel: 'custom', registerAddress: 100, dataType: 'uint16', unit: 'mm/s' },
    { motorId: 'M2', path: 'COM8', slaveId: 2, sensorModel: 'custom', registerAddress: 100, dataType: 'uint16', unit: 'mm/s' },
    { motorId: 'M3', path: 'COM9', slaveId: 1, sensorModel: 'custom', registerAddress: 100, dataType: 'uint16', unit: 'mm/s' }
  ]);
  store.saveGroups([
    { id: 'G1', name: 'พื้นที่ A', motorIds: ['M1'], meters: [] },
    { id: 'G2', name: 'พื้นที่ B', motorIds: ['M3'], meters: [{ id: 'PM3', model: 'pm2230', path: 'COM8', slaveId: 3, motorId: 'M3' }] }
  ]);
  store.saveSelectedGroup('G1');
  let app;
  try {
    app = await electron.launch({
      ...process.env.ELECTRON_EXECUTABLE ? { executablePath: process.env.ELECTRON_EXECUTABLE, args: [] } : { args: ['.'], cwd: project },
      env: { ...process.env, TEMP: base, TMP: base, VECTRA_TEST_DATA: root }
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 960, height: 680 });
    await page.locator('[data-tab="fleet"]').click();
    await page.locator('#groups-quick').click();await page.locator('#groups-edit').click();
    await page.locator('#groups-motors input[value=M2]').check();
    await page.locator('#groups-motors input[value=PM3]').check();
    await page.locator('#groups-save').click();await page.locator('#groups-editor').waitFor({state:'hidden'});await page.locator('#groups-close').click();
    assert(store.loadGroups()[0].motorIds.includes('M2'));
    assert.equal(store.loadGroups()[0].meters[0].id,'PM3');
    assert.equal(store.loadGroups()[0].meters[0].motorId,'','association from another workspace is cleared');
    await page.locator('#flow-panel .flow-actions button').filter({hasText:'เพิ่มอุปกรณ์'}).click();
    assert.equal(await page.locator('#sensor-model option[value=pm2230]').count(),1);
    assert.equal(await page.locator('[name=slaveId]').inputValue(),'','new instances require their own Slave ID');
    await page.screenshot({path:path.join(project,'.artifacts','device-add-unified.png'),animations:'disabled'});
    await page.locator('#close-connection').click();
    await page.locator('[data-tab="motors"]').click();
    assert.equal(await page.locator('#motors-body tr').count(), 5);
    assert.deepEqual(errors, []);
    console.log('PASS: existing devices join a workspace through one membership list and both appear in registry');
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
