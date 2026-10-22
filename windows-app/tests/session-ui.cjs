'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { _electron: electron } = require('playwright');
const { DataStore } = require('../electron/data-store.cjs');
const { normalizeConfig } = require('../electron/sensor-codec.cjs');

(async () => {
  const project = path.resolve(__dirname, '..'), tempRoot = path.join(project, '.test-tmp'), artifacts = path.join(project, '.artifacts');
  fs.mkdirSync(tempRoot, { recursive: true }); fs.mkdirSync(artifacts, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'vectra-session-ui-'));
  const profile = normalizeConfig({ motorId: 'MTR-01', name: 'Cooling water pump', area: 'Utility', path: 'COM987', slaveId: 1, sensorModel: 'custom', registerType: 'holding', registerAddress: 200, dataType: 'uint16', byteOrder: 'ABCD', scale: .1, unit: 'mm/s', pollInterval: 1000 });
  const decodeConfig = Object.fromEntries(['sensorModel', 'registerType', 'registerAddress', 'dataType', 'byteOrder', 'scale', 'unit'].map(key => [key, profile[key]]));
  const start = Math.floor((Date.now() - 5 * 60000) / 1000) * 1000;
  const stamp = seconds => new Date(start + seconds * 1000).toISOString();
  const firstRun = randomUUID(), secondRun = randomUUID(), otherRun = randomUUID();
  const firstRecording = randomUUID(), resumedRecording = randomUUID(), secondRecording = randomUUID();
  const reading = (seconds, value, runId, recordingId, changes = {}) => ({ motorId: profile.motorId, timestamp: stamp(seconds), value, unit: profile.unit, port: profile.path, slaveId: profile.slaveId, sensorModel: profile.sensorModel, source: 'RS485 / Modbus RTU', pollIntervalMs: 1000, rawRegisters: [Math.round(value * 10)], decodeConfig, ...(runId ? { schemaVersion: 4, runId, runStartedAt: stamp(runId === secondRun ? 60 : 0), recordingId, recordingStartedAt: stamp(recordingId === secondRecording ? 60 : recordingId === resumedRecording ? 2 : 0) } : {}), ...changes });
  const older = [reading(0, 11, firstRun, firstRecording), reading(1, 12, firstRun, firstRecording), reading(2, 13, firstRun, resumedRecording)];
  const newer = [reading(60, 41, secondRun, secondRecording), reading(61, 42, secondRun, secondRecording)];
  const legacy = reading(-60, 99);
  const other = [reading(0, 71, otherRun, randomUUID(), { motorId: 'MTR-02', port: 'COM988', slaveId: 2 }), reading(1, 72, otherRun, randomUUID(), { motorId: 'MTR-02', port: 'COM988', slaveId: 2 })];
  fs.writeFileSync(path.join(temporary, 'motors.json'), JSON.stringify([profile], null, 2));
  const store = new DataStore(temporary);
  for (const row of [legacy, ...older, ...newer, ...other]) await store.append(row);

  let app, page;
  const errors = [];
  try {
    const packaged = process.env.ELECTRON_EXECUTABLE;
    app = await electron.launch({ ...(packaged ? { executablePath: packaged, args: [] } : { args: ['.'], cwd: project }), env: { ...process.env, TEMP: tempRoot, TMP: tempRoot, VECTRA_TEST_DATA: temporary } });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#app-version').filter({ hasText: `v${require('../package.json').version}` }).waitFor();
    await page.locator('#chart-live').filter({ hasText: 'SAVED' }).waitFor();
    // A newly shown native window can inherit an OS cursor already over a chart.
    await page.mouse.move(0, 0);
    assert.equal((await page.locator('#sample-count').textContent()).trim(), '2', 'startup restores only the newest compatible run');
    assert.equal((await page.locator('#detail-plots .plot-axis-value strong').first().textContent()).trim(), '42.0');
    assert.equal(await page.locator('#detail-plots .measurement-plot:visible').count(), 1, 'a saved custom scalar stays a single graph');
    assert(await page.locator('#disconnect').isHidden(), 'restored data does not automatically read the serial port');

    // Suppress shell actions while retaining the actual UI and selected run argument.
    await app.evaluate(({ ipcMain }) => {
      globalThis.sessionUIOpenedRun = '';
      ipcMain.removeHandler('data:open-run-folder');
      ipcMain.handle('data:open-run-folder', (_event, runId) => { globalThis.sessionUIOpenedRun = runId; return { ok: true }; });
    });
    await page.locator('[data-tab="history"]').click();
    assert.equal(await page.locator('#history-view .history-range').count(), 0, 'record history no longer embeds a duplicate graph workspace');
    await page.locator('#history-open-analysis').click();
    assert(await page.locator('#analysis-history').isVisible());
    const waitForRange = async (motorId, count) => {
      await page.waitForFunction(({ motorId, count }) => document.querySelector('.history-range').dataset.loaded === 'true' && document.querySelector('#range-summary').textContent.includes(motorId) && document.querySelector('#range-summary').textContent.includes(`${count} รายการ`), { motorId, count });
      await page.waitForFunction(() => !document.querySelector('#load-history').disabled);
    };
    await waitForRange(profile.motorId, 2);
    const originalRange = await page.evaluate(() => [document.querySelector('#range-from').value, document.querySelector('#range-to').value]);
    const runSelect = page.locator('#analysis-history-run');
    await page.waitForFunction(() => document.querySelector('#history-run').options.length === 4);
    const options = await runSelect.locator('option').evaluateAll(elements => elements.map(element => ({ value: element.value, text: element.textContent })));
    assert.equal(await runSelect.inputValue(), '', 'history begins with all runs available');
    assert(options.find(option => option.value === '').text.includes('ทุกรอบ'));
    assert(options.some(option => option.value === '__legacy__'), 'records created before run tracking remain selectable');
    for (const runId of [firstRun, secondRun]) {
      const option = options.find(option => option.value === runId);
      assert(option && option.text.includes(runId.slice(0, 8)) && /\d{2}:\d{2}/.test(option.text), 'run labels contain start time and an identifiable short ID');
    }
    assert(await page.locator('#open-run-folder').isDisabled(), 'all-runs is not a real run folder');
    assert.equal(await page.locator('#history-body tr').count(), 6, 'table includes both runs and legacy data while the graph shows one coherent run');
    const headings = await page.locator('#history-view thead th').allTextContents();
    assert(headings[1].includes('รอบอ่าน') && headings[2].includes('รอบบันทึก'), 'run and recording columns precede motor identity');

    await runSelect.selectOption(firstRun);
    await waitForRange(profile.motorId, 3);
    assert.equal(await page.locator('#history-run').inputValue(), firstRun, 'analysis and record-table run filters stay synchronized');
    assert.equal(await page.locator('#history-run option').count(), 4, 'selecting a run keeps the complete date/motor catalog');
    assert.equal(await page.locator('#history-body tr').count(), 3, 'run selection reloads the table automatically');
    assert(await page.locator('#open-run-folder').isEnabled());
    const parsedRange = await page.evaluate(() => [document.querySelector('#range-from').value, document.querySelector('#range-to').value].map(value => Date.parse(`${value}+07:00`)));
    assert.deepEqual(parsedRange, [Date.parse(older[0].timestamp), Date.parse(older.at(-1).timestamp) + 1000], 'selecting a run fits its first sample through one second beyond its last');
    const identityCells = await page.locator('#history-body tr').first().locator('td').evaluateAll(elements => elements.slice(0, 4).map(element => ({ text: element.textContent, title: element.title })));
    assert(identityCells[1].text.includes(firstRun.slice(0, 8)) && identityCells[1].title.includes(firstRun), 'table uses a short run label with its full identity available');
    assert(identityCells[2].text.includes(resumedRecording.slice(0, 8)) && identityCells[2].title.includes(resumedRecording), 'resumed recording segments remain distinguishable within a run');
    assert.equal(identityCells[3].text, profile.motorId);
    assert.equal((await page.locator('#history-plots .plot-axis-value strong').first().textContent()).trim(), '13.0', 'run filter updates the graph values');
    await page.locator('#analysis-history-open-folder').click();
    await page.waitForFunction(() => !document.querySelector('#open-run-folder').disabled);
    assert.equal(await app.evaluate(() => globalThis.sessionUIOpenedRun), firstRun, 'folder action receives exactly the selected UUID');

    const exportPath = path.join(temporary, 'selected-run.csv');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
    await page.locator('[data-tab="history"]').click();
    await page.waitForFunction(() => !document.querySelector('#load-history').disabled);
    assert.equal(await page.locator('#history-run').inputValue(), firstRun, 'opening the table retains the analysis run used for export');
    await page.locator('#export-csv').click();
    await page.waitForFunction(() => !document.querySelector('#export-csv').disabled);
    const csv = fs.readFileSync(exportPath, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const columns = csv[0].split(','), runColumn = columns.indexOf('runId'), motorColumn = columns.indexOf('motorId');
    assert(runColumn >= 0 && motorColumn >= 0);
    const exported = csv.slice(1).map(line => line.split(',').map(value => value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value));
    assert.equal(exported.length, 3, 'export applies the selected run filter');
    assert(exported.every(row => row[runColumn] === firstRun && row[motorColumn] === profile.motorId), 'export cannot leak another run or motor');
    await page.screenshot({ path: path.join(artifacts, 'history-run-filter.png'), animations: 'disabled' });
    await page.locator('#history-open-analysis').click();
    await waitForRange(profile.motorId, 3);

    await runSelect.selectOption('');
    await waitForRange(profile.motorId, 2);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#range-from').value, document.querySelector('#range-to').value]), originalRange, 'returning to all runs restores the range that preceded run selection');
    assert.equal(await page.locator('#history-body tr').count(), 6);
    assert(await page.locator('#open-run-folder').isDisabled());

    await runSelect.selectOption('__legacy__');
    await waitForRange(profile.motorId, 1);
    assert(await page.locator('#open-run-folder').isDisabled(), 'legacy archive has no per-run directory');
    assert.equal(await page.locator('#history-body tr').count(), 1);
    assert.equal((await page.locator('#history-plots .plot-axis-value strong').first().textContent()).trim(), '99.0');
    assert.equal(await runSelect.locator('option').count(), 4);

    await runSelect.selectOption(firstRun);
    await waitForRange(profile.motorId, 3);
    await page.locator('#analysis-history-motor').selectOption('MTR-02');
    await waitForRange('MTR-02', 2);
    assert.equal(await runSelect.inputValue(), '', 'changing motor clears the previous motor run filter');
    const otherOptions = await runSelect.locator('option').evaluateAll(elements => elements.map(element => element.value));
    assert.deepEqual(new Set(otherOptions), new Set(['', otherRun]), 'run catalog belongs to the selected motor');
    assert.equal(await page.locator('#history-body tr').count(), 2);
    assert(await page.locator('#open-run-folder').isDisabled());

    // A completed recording exposes a concise run identity in its status strip.
    await app.evaluate(({ BrowserWindow }, state) => { BrowserWindow.getAllWindows()[0].webContents.send('recording:state', state); }, {
      settings: { startMode: 'on-connect', startAt: '', durationMinutes: 0 }, connected: false, active: false, waiting: false, count: 2,
      runId: secondRun, runStartedAt: newer[0].runStartedAt, recordingId: secondRecording, recordingStartedAt: newer[0].recordingStartedAt,
      startedAt: newer[0].recordingStartedAt, endsAt: '', lastSavedAt: newer.at(-1).timestamp, lastError: '', stopReason: 'disconnected'
    });
    await page.locator('#recording-run').filter({ hasText: secondRun.slice(0, 8) }).waitFor();
    assert(/\d{2}:\d{2}/.test(await page.locator('#recording-run').textContent()), 'recording strip identifies the run by time as well as ID');
    for (const [width, height] of [[960, 680], [768, 1024]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
      await page.waitForFunction(([expectedWidth, expectedHeight]) => innerWidth === expectedWidth && innerHeight === expectedHeight, [width, height]);
      await page.locator('[data-tab="fleet"]').click();
      await page.locator('[data-tab="monitor"]').click();
      await page.locator('#monitor-content').waitFor({ state: 'visible' });
      await page.evaluate(() => { delete window.sessionUILayoutProbe; });
      await page.waitForFunction(() => {
        const nodes = [document.querySelector('main'), document.querySelector('#recording-run'), document.querySelector('#detail-plots .measurement-plot:not([hidden]) svg')];
        if (nodes.some(element => !element || element.clientWidth <= 0 || element.clientHeight <= 0)) return false;
        const key = JSON.stringify(nodes.map(element => { const rect = element.getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 10)); }));
        const probe = window.sessionUILayoutProbe;
        if (!probe || probe.key !== key) { window.sessionUILayoutProbe = { key, frames: 0 }; return false; }
        return ++probe.frames >= 3;
      });
      assert(await page.locator('#recording-run').isVisible(), `${width}: run label remains visible`);
      const layout = await page.evaluate(() => {
        const main = document.querySelector('main'), label = document.querySelector('#recording-run').getBoundingClientRect();
        return { pageOverflow: document.documentElement.scrollWidth - innerWidth, mainHorizontal: main.scrollWidth - main.clientWidth, mainVertical: main.scrollHeight - main.clientHeight, scrollTop: main.scrollTop, runInsideViewport: label.left >= 0 && label.top >= 0 && label.right <= innerWidth + 1 && label.bottom <= innerHeight + 1 };
      });
      assert(layout.pageOverflow <= 1 && layout.mainHorizontal <= 1 && layout.mainVertical <= 1 && layout.scrollTop === 0 && layout.runInsideViewport, `${width}×${height}: run status and monitor fit a single viewport: ${JSON.stringify(layout)}`);
      if (width === 960) await page.screenshot({ path: path.join(artifacts, 'monitor-run-status.png'), animations: 'disabled' });
    }
    assert.deepEqual(errors, [], 'run selection, export and recording-state updates produce no renderer errors');
    console.log('PASS: saved newest run, shared analysis/table filters, recording columns, per-run folder and filtered CSV export');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, 'session-ui-failure.png'), animations: 'disabled' }).catch(() => {});
    throw error;
  } finally {
    if (app) await app.close();
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tempRoot));
    assert(path.basename(temporary).startsWith('vectra-session-ui-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
