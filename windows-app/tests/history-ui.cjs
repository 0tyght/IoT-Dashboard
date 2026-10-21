'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { DataStore, dayKey } = require('../electron/data-store.cjs');
const { normalizeConfig } = require('../electron/sensor-codec.cjs');

(async () => {
  const project = path.resolve(__dirname, '..');
  const artifacts = path.join(project, '.artifacts');
  const tempRoot = path.join(project, '.test-tmp');
  fs.mkdirSync(artifacts, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'vectra-history-ui-'));
  const model = 'vemsee-sn3001-wz3a-n01';
  const profile = normalizeConfig({ motorId: 'MTR-01', name: 'Cooling water pump', area: 'Utility', path: 'COM987', slaveId: 1, sensorModel: model, registerType: 'holding', registerAddress: 0, dataType: 'int16', byteOrder: 'ABCD', frequencyByteOrder: 'ABCD', scale: .1, unit: 'mm/s', pollInterval: 1000 });
  const decodeConfig = config => Object.fromEntries(['sensorModel', 'registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale', 'unit'].map(key => [key, config[key]]));
  const historyStart = Date.now() - 12 * 60000;
  const stamp = seconds => new Date(historyStart + seconds * 1000).toISOString();
  const preset = (seconds, index, changes = {}) => ({
    motorId: profile.motorId, timestamp: stamp(seconds), value: 2 + index / 1000,
    unit: 'mm/s', port: profile.path, slaveId: profile.slaveId, sensorModel: model,
    source: 'RS485 / Modbus RTU', pollIntervalMs: 1000, frequencyStatus: 'ok', frequencyByteOrder: 'ABCD',
    decodeConfig: decodeConfig(profile),
    channels: {
      velocityX: 1 + index / 1000, velocityY: 2 + index / 1000, velocityZ: 1.5 + index / 1000,
      displacementX: 10 + index / 10, displacementY: 20 + index / 10, displacementZ: 15 + index / 10,
      accelerationX: .5 + index / 2000, accelerationY: 1 + index / 2000, accelerationZ: .8 + index / 2000,
      frequencyX: 49 + index / 1000, frequencyY: 50 + index / 1000, frequencyZ: 51 + index / 1000, temperature: 30 + index / 1000
    },
    rawRegisters: { primary: [300, 10, 20, 15, 100, 200, 150], acceleration: [5, 10, 8], frequency: [16964, 0, 16968, 0, 16972, 0] },
    ...changes
  });
  const saved = Array.from({ length: 600 }, (_, index) => preset(index, index));
  const archived = Array.from({ length: 12 }, (_, index) => preset(610 + index, index, { motorId: 'DELETE-01', port: 'COM988', slaveId: 2 }));
  const custom = (seconds, value, unit) => ({
    motorId: 'MIXED-01', timestamp: stamp(seconds), value, unit, port: 'COM989', slaveId: 3,
    sensorModel: 'custom', source: 'RS485 / Modbus RTU', pollIntervalMs: 1000,
    rawRegisters: [Math.round(value * 10)],
    decodeConfig: { sensorModel: 'custom', registerType: 'holding', registerAddress: 200, dataType: 'uint16', byteOrder: 'ABCD', scale: .1, unit }
  });
  const mixed = [custom(640, 3, 'mm/s'), custom(641, 4, 'mm/s'), custom(650, 120, 'µm'), custom(651, 130, 'µm')];
  const rowsByDate = new Map();
  for (const row of [...saved, ...archived, ...mixed]) {
    const date = dayKey(new Date(row.timestamp));
    if (!rowsByDate.has(date)) rowsByDate.set(date, []);
    rowsByDate.get(date).push(row);
  }
  fs.mkdirSync(path.join(temporary, 'data'));
  fs.writeFileSync(path.join(temporary, 'motors.json'), JSON.stringify([profile], null, 2));
  for (const [date, rows] of rowsByDate) fs.writeFileSync(path.join(temporary, 'data', `readings-${date}.ndjson`), rows.map(row => JSON.stringify(row)).join('\n') + '\n');

  let app, page;
  const errors = [];
  try {
    // The fixture must actually be reduced with long distances between displayed points.
    const reduced = await new DataStore(temporary).chartRange({ from: new Date(historyStart - 86400000).toISOString(), to: new Date(Date.now() + 60000).toISOString(), motorId: profile.motorId, profile });
    assert.equal(reduced.total, saved.length);
    assert(reduced.reduced && reduced.rows.length < 100, 'startup fixture exercises reduced history rather than 600 original points');
    assert.deepEqual(reduced.gapStarts, [], 'original acquisition has no missing polls');

    const packaged = process.env.ELECTRON_EXECUTABLE;
    app = await electron.launch({
      ...(packaged ? { executablePath: packaged, args: [] } : { args: ['.'], cwd: project }),
      env: { ...process.env, TEMP: tempRoot, TMP: tempRoot, VECTRA_TEST_DATA: temporary }
    });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#app-version').filter({ hasText: `v${require('../package.json').version}` }).waitFor();
    await page.locator('#chart-live').filter({ hasText: 'SAVED' }).waitFor();
    assert(await page.locator('#monitor-view').isVisible(), 'opening an existing profile lands directly in its monitor');
    assert(await page.locator('#fleet-view').isHidden());
    assert((await page.locator('#selected-title').textContent()).includes(profile.name));
    assert.equal((await page.locator('#sample-count').textContent()).trim(), String(saved.length));
    assert.equal(await page.locator('#detail-plots .measurement-plot:visible').count(), 3, 'all three measurement families restore automatically');
    await page.waitForFunction(() => document.querySelectorAll('#detail-plots svg polyline').length === 9);
    for (const kind of ['velocity', 'displacement', 'acceleration']) {
      assert.equal(await page.locator(`#detail-plots [data-kind="${kind}"] svg polyline`).count(), 3, `${kind}: reduced continuous history draws one uninterrupted line per axis`);
    }
    assert(await page.locator('#connect-all').isEnabled(), 'restoring a file does not open serial acquisition');
    assert(await page.locator('#disconnect').isHidden());
    await page.screenshot({ path: path.join(artifacts, 'monitor-saved-startup.png'), animations: 'disabled' });

    await page.locator('[data-tab="history"]').click();
    const waitForRange = async motorId => {
      await page.waitForFunction(id => document.querySelector('.history-range').dataset.loaded === 'true' && document.querySelector('#range-summary').textContent.startsWith(`${id} ·`), motorId);
    };
    await waitForRange(profile.motorId);
    assert((await page.locator('#range-summary').textContent()).includes('600 ค่าจริง'));
    assert.equal(await page.locator('#history-plots .measurement-plot:visible').count(), 3);
    assert.equal(await page.locator('#history-plots svg polyline').count(), 9, 'history uses the same original continuity metadata');
    await page.waitForFunction(() => [...document.querySelector('#history-motor').options].some(option => option.value === 'DELETE-01'));
    assert(await page.locator('#history-motor option[value="MIXED-01"]').count(), 'history catalogue includes an ID absent from configured motors');
    assert.equal(await page.locator('.motor-item').count(), 1, 'archived IDs remain history entries rather than becoming configured motors');

    // Native 3D is a view of the same selected history and is keyboard operable.
    assert(await page.locator('#history-view-surface').isEnabled());
    await page.locator('#history-view-surface').click();
    await page.locator('#history-3d-view').waitFor({ state: 'visible' });
    const canvas = page.locator('#history-surface-canvas');
    assert(Number(await canvas.getAttribute('data-record-count')) > 1);
    assert(!(await page.locator('#history-surface-caption').textContent()).match(/เว้น \d+ ช่วงข้อมูลขาด/), 'reduction must not create false gaps in the 3D surface');
    await canvas.focus();
    await canvas.press('Home');
    assert.equal(await canvas.getAttribute('data-selected-timestamp'), saved[0].timestamp);
    assert.equal(await canvas.getAttribute('data-selected-axis'), 'X');
    await canvas.press('ArrowDown');
    assert.equal(await canvas.getAttribute('data-selected-axis'), 'Y');
    assert((await page.locator('#history-surface-readout').textContent()).includes('แกน Y'));
    await canvas.press('End');
    assert.equal(await canvas.getAttribute('data-selected-timestamp'), saved.at(-1).timestamp);
    await canvas.press('=');
    assert(Number(await canvas.getAttribute('data-zoom')) > 1);
    await canvas.press('Shift+ArrowRight');
    assert(Number(await canvas.getAttribute('data-rotation')) > -.62);
    await canvas.press('r');
    assert.equal(Number(await canvas.getAttribute('data-zoom')), 1);
    assert.equal(Number(await canvas.getAttribute('data-rotation')), -.62);
    assert.equal(await canvas.getAttribute('data-selected-timestamp'), '');
    await page.locator('#history-surface-expand').click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'history-3d-view');
    assert.equal(await page.locator('#history-surface-expand').getAttribute('aria-pressed'), 'true');
    assert(await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    }), 'fullscreen 3D canvas stays inside the viewport');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await page.locator('#history-surface-expand').getAttribute('aria-pressed'), 'false');

    await page.locator('#history-motor').selectOption('DELETE-01');
    await waitForRange('DELETE-01');
    assert((await page.locator('#range-summary').textContent()).includes('12 ค่าจริง'), 'a deleted profile still has selectable saved graphs');
    assert.equal(await page.locator('#history-view-surface').getAttribute('aria-pressed'), 'true', 'changing between preset motors preserves the chosen view');
    await page.locator('#history-view-lines').click();
    assert.equal(await page.locator('#history-plots .measurement-plot:visible').count(), 3);
    assert.equal(await page.locator('#history-plots svg polyline').count(), 9);

    // Select a scalar record while 3D is open: the UI must return to usable 2D.
    await page.locator('#history-view-surface').click();
    await page.locator('#history-motor').selectOption('MIXED-01');
    await waitForRange('MIXED-01');
    assert(await page.locator('#history-series-label').isVisible());
    const options = await page.locator('#history-series option').evaluateAll(elements => elements.map(element => ({ value: element.value, text: element.textContent })));
    assert.equal(options.length, 2, 'different custom units appear as separate recorded series');
    const micrometres = options.find(option => option.text.includes('µm'));
    const millimetresPerSecond = options.find(option => option.text.includes('mm/s'));
    assert(micrometres && millimetresPerSecond);
    assert.equal(await page.locator('#history-series').inputValue(), micrometres.value, 'the newest compatible series is selected initially');
    const customTitle = page.locator('#history-plots [data-kind="velocity"] h3');
    assert.equal((await customTitle.textContent()).trim(), 'Custom value · µm');
    assert.equal(await page.locator('#history-plots .measurement-plot:visible').count(), 1);
    assert(await page.locator('#history-view-surface').isDisabled(), 'a scalar custom reading cannot be shown as XYZ');
    assert(await page.locator('#history-3d-view').isHidden(), 'switching to custom data exits 3D');
    assert.equal(await page.locator('#history-plots svg polyline').count(), 1);
    assert((await page.locator('#range-summary').textContent()).includes('2 ค่าจริง'), 'count describes only the selected unit series');

    await page.locator('#history-series').selectOption(millimetresPerSecond.value);
    await waitForRange('MIXED-01');
    assert.equal((await customTitle.textContent()).trim(), 'Custom value · mm/s', 'changing the recorded series updates the chart unit');
    assert.equal(await page.locator('#history-series').inputValue(), millimetresPerSecond.value);
    assert.equal((await page.locator('#history-plots .plot-axis-value strong').first().textContent()).trim(), '4.00', 'the scalar readout follows values from the selected unit only');
    assert(await page.locator('#history-plots .plot-axis-value').first().evaluate(row => row.querySelector('span').getBoundingClientRect().right < row.querySelector('strong').getBoundingClientRect().left), 'the custom value label has its own space beside the numerical readout');
    assert(await page.locator('#history-view-surface').isDisabled());
    await page.screenshot({ path: path.join(artifacts, 'history-mixed-series.png'), animations: 'disabled' });
    assert.deepEqual(errors, [], 'no renderer errors during restore, history selection or 3D interaction');
    console.log('History UI regression passed: startup SAVED, archived motors, isolated units, continuous plots and native 3D keyboard controls.');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, 'history-ui-failure.png'), animations: 'disabled' }).catch(() => {});
    throw error;
  } finally {
    if (app) await app.close();
    // Only remove the per-run workspace directory allocated above.
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tempRoot));
    assert(path.basename(temporary).startsWith('vectra-history-ui-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
