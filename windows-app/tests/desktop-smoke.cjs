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
    await page.locator('#app-version').filter({ hasText: `v${require('../package.json').version}` }).waitFor();
    assert(await page.locator('#connect-all').isDisabled());
    assert((await page.locator('#connect-all').textContent()).includes('เริ่มอ่านและบันทึก'));
    assert(await page.locator('#disconnect').isHidden());
    assert(await page.locator('#recording-strip').isHidden(), 'idle mode has no redundant recording toolbar');
    await page.screenshot({ path: path.join(artifacts, 'empty-state.png'), animations: 'disabled' });
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
    assert.equal(await page.locator('.fleet-card').count(), 2);
    await page.getByRole('button', { name: 'แก้ไข MTR-01', exact: true }).click();
    await page.locator('[name="name"]').fill('Cooling water pump 01');
    await page.locator('[name="area"]').fill('Utility / Pump room');
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('sensor:test');
      ipcMain.handle('sensor:test', () => ({ ok: true, frequencyStatus: 'unconfirmed', channels: { temperature: 30, velocityX: 1, velocityY: 2, velocityZ: 3, displacementX: 10, displacementY: 20, displacementZ: 30, accelerationX: 1, accelerationY: 2, accelerationZ: 3, frequencyX: null, frequencyY: null, frequencyZ: null }, rawRegisters: { frequency: [16968, 0, 17008, 0, 17036, 0] } }));
    });
    await page.locator('#test-sensor').click();
    await page.locator('#test-result.success').waitFor();
    const connectionResult = await page.locator('#test-result p').textContent();
    assert(connectionResult.includes('Displacement X 10.0') && connectionResult.includes('Acceleration X 1.0'));
    assert(connectionResult.includes('Frequency X รอยืนยัน') && connectionResult.includes('16968, 0, 17008, 0, 17036, 0'));
    assert(await page.locator('#test-result').evaluate(element => { const rect = element.getBoundingClientRect(), container = document.querySelector('.dialog-content').getBoundingClientRect(); return rect.top >= container.top && rect.bottom <= container.bottom + 1; }), 'connection result scrolls into the dialog viewport');
    await page.screenshot({ path: path.join(artifacts, 'frequency-connection-test.png'), animations: 'disabled' });
    await page.locator('[name="frequencyByteOrder"]').selectOption('ABCD');
    await page.locator('.nameplate-editor summary').click();
    await page.locator('[name="nameplate"]').fill('Motor: 4 kW / 1450 rpm\nSensor position: DE');
    await page.locator('#save-motor').click();
    await page.locator('#connection-dialog').waitFor({ state: 'hidden' });
    assert((await page.locator('[data-fleet-id="MTR-01"] h2').textContent()).includes('pump 01'));
    assert(JSON.parse(fs.readFileSync(path.join(temporary, 'motors.json'), 'utf8'))[0].nameplate.includes('DE'));

    await page.locator('#session-actions summary').click(); await page.locator('#demo-mode').click();
    await page.locator('#fleet-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.fleet-card').count(), 2);
    await page.waitForFunction(() => document.querySelectorAll('.fleet-card:first-child svg polyline').length === 9);
    assert.equal(await page.locator('.fleet-card:first-child .measurement-plot:visible').count(), 3, 'three vibration families are graphed; temperature stays numeric');
    assert.equal(await page.locator('.fleet-trend select').count(), 0, 'no chart-family selector hides measurements');
    assert.equal(await page.locator('.fleet-value strong').count(), 6, 'frequency stays above; vibration values move beside their own plots');
    assert.equal(await page.locator('.fleet-card:first-child .plot-axis-value').count(), 9);
    assert.equal(await page.locator('.fleet-axis-status').count(), 0, 'one communication state per motor, not per axis');
    await page.locator('#motor-search').fill('no-such-motor');
    await page.locator('#fleet-no-matches').waitFor({ state: 'visible' });
    await page.locator('#fleet-reset-filters').click();
    assert.equal(await page.locator('.fleet-card:visible').count(), 2);
    await page.locator('#toggle-sidebar').click();
    assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-expanded'), 'false');
    assert(await page.locator('#motor-sidebar').isHidden());
    await page.locator('#toggle-sidebar').click();
    await page.locator('.fleet-card svg').first().hover();
    await page.locator('.fleet-tooltip').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('.fleet-card:first-child .plot-crosshair[visibility="visible"]').count(), 3, 'hover synchronizes time across all families');
    await page.locator('#fleet-window').selectOption('custom');
    await page.locator('#graph-count').fill('500'); await page.locator('#graph-count').press('Tab');
    await page.evaluate(() => {
      const profile = profiles[0];
      cache.clear();
      for (let index = 0; index < 300; index++) {
        const frame = demoFrame(profile, 0, index * .1); frame.timestamp = new Date(Date.now() - (300 - index) * 1000).toISOString(); addReading(frame);
      }
    });
    assert(parseInt((await page.locator('.graph-coverage').first().textContent()).replaceAll(',', ''), 10) > 120, 'graph holds more than 120 readings');
    assert((await page.locator('.fleet-last').first().textContent()).includes('+07:00'));
    await page.locator('.fleet-card:first-child [data-kind="displacement"] svg').hover();
    assert((await page.locator('.fleet-card:first-child [data-kind="displacement"] .fleet-tooltip').textContent()).includes('µm'));
    await page.locator('#fleet-window').selectOption('300s');
    await page.locator('#new-motor').click();
    await page.locator('#confirm-dialog').waitFor({ state: 'visible' });
    await page.locator('#cancel-confirm').click();
    assert((await page.locator('#mode-indicator').textContent()).includes('SIMULATION'));
    await page.locator('#toast').waitFor({ state: 'hidden' });
    for (const [width, height] of [[960, 680], [1366, 768], [1920, 1080]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
      await page.waitForTimeout(120);
      assert(await page.evaluate(() => document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth + 1), `${width} fleet horizontal overflow`);
      assert(await page.locator('.fleet-actions button').first().evaluate(element => element.getBoundingClientRect().height >= 32), 'motor actions have usable targets');
      const chartBounds = await page.locator('.fleet-chart-box svg').first().evaluate(svg => ({ rendered: svg.clientWidth, logical: svg.viewBox.baseVal.width }));
      assert(Math.abs(chartBounds.rendered - chartBounds.logical) < 2, 'chart text remains at its actual pixel size after resize');
      await page.screenshot({ path: path.join(artifacts, `fleet-${width}.png`), animations: 'disabled' });
    }
    await page.locator('[data-tab="fleet"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-tab="monitor"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    await page.locator('#monitor-content').waitFor({ state: 'visible' });
    const velocityAxisX = page.locator('#detail-plots [data-kind="velocity"] .plot-axis-value').first();
    const visibleTraceCount = await page.locator('#detail-plots .measurement-plot:not([hidden]) svg polyline').count();
    assert.equal(visibleTraceCount, 9, 'all three axes remain present in all three plots');
    await velocityAxisX.focus();
    await page.waitForFunction(() => document.getElementById('detail-plots').dataset.focusedAxis === 'X');
    assert.equal(await page.locator('#detail-plots .measurement-plot:not([hidden]) svg polyline').count(), visibleTraceCount, 'axis emphasis does not remove traces');
    assert((await velocityAxisX.getAttribute('aria-label')).includes('Velocity X'), 'the emphasized value retains its measurement name');
    await page.locator('#pause-stream').focus();
    await page.waitForFunction(() => !document.getElementById('detail-plots').dataset.focusedAxis);
    assert.equal(await page.locator('#channel-body tr').count(), 4);
    assert(await page.locator('#new-motor').isEnabled());
    assert.equal(await page.locator('#register-body tr').count(), 13);
    const frequencyStates = await page.evaluate(() => {
      const reading = stateFor(currentProfile().motorId).frames.at(-1);
      const missing = { ...reading, source: 'RS485 / Modbus RTU', frequencyStatus: 'unconfirmed', channels: { ...reading.channels, frequencyX: null, frequencyY: null, frequencyZ: null } };
      renderChannels(missing);
      const result = {
        labels: [...document.querySelectorAll('#channel-body tr:last-child td.frequency-unavailable')].map(cell => cell.textContent),
        summary: frequencySummary(missing),
        zero: frequencyDisplay({ ...missing, frequencyStatus: 'ok', channels: { frequencyX: 0 } }, 'X'),
        error: frequencyDisplay({ ...missing, frequencyStatus: 'read-error' }, 'X')
      };
      renderChannels(reading); return result;
    });
    assert.deepEqual(frequencyStates.labels, ['รอยืนยัน', 'รอยืนยัน', 'รอยืนยัน']);
    assert(frequencyStates.summary.includes('ตั้งค่ามอเตอร์'));
    assert.equal(frequencyStates.zero, '0.00');
    assert.equal(frequencyStates.error, 'อ่านไม่ได้');
    assert.equal(await page.locator('#monitor-view #model-panel').count(), 0, 'the monitoring workspace does not contain the 3D model');
    assert.equal(await page.locator('#asset-model').getAttribute('src'), null, '3D assets are not loaded before the model page is opened');
    await page.locator('[data-tab="model"]').click();
    await page.locator('#model-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#model-view #model-panel').count(), 1, 'the reference model has its own page');
    await page.waitForFunction(() => ['ready', 'fallback'].includes(document.getElementById('model-panel').dataset.modelState));
    if (await page.locator('#model-panel').getAttribute('data-model-state') === 'ready') {
      const model = page.frameLocator('#asset-model');
      await model.locator('[data-view="top"]').click();
      assert((await model.locator('[data-view="top"]').getAttribute('class')).includes('active'));
      await model.locator('#reset').click();
      assert(await model.locator('#view').evaluate(canvas => canvas.width > 0 && canvas.height > 0));
      await model.locator('#view').evaluate(() => parent.postMessage({ type: 'vectra-model-error' }, '*'));
      await page.locator('#retry-model').waitFor({ state: 'visible' });
      assert(await page.locator('#model-poster').isVisible());
      await page.locator('#retry-model').click();
      await page.waitForFunction(() => document.getElementById('model-panel').dataset.modelState === 'ready');
    } else assert((await page.locator('#model-status').textContent()).includes('ภาพนิ่ง'));
    await page.screenshot({ path: path.join(artifacts, 'model-separate-page.png'), animations: 'disabled' });
    await page.locator('[data-tab="monitor"]').click();
    await page.locator('#monitor-content').waitFor({ state: 'visible' });
    assert(await page.locator('#model-panel').isHidden(), 'returning to monitoring leaves the model on its separate page');
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
    await page.screenshot({ path: path.join(artifacts, 'motor-model-context.png'), animations: 'disabled' });
    const conversionMenu = page.locator('#detail-plots [data-kind="velocity"] .plot-inspector');
    await conversionMenu.locator('summary').hover();
    assert(await conversionMenu.evaluate(element => element.open), 'hover exposes raw conversion details');
    assert((await conversionMenu.locator('.plot-inspector-body').textContent()).includes('UInt16'));
    await conversionMenu.locator('summary').click();
    assert.equal(await conversionMenu.getAttribute('data-pinned'), 'true');
    const pinnedDetails = await conversionMenu.locator('.plot-inspector-body').textContent();
    await page.locator('#trend-chart').hover();
    assert.equal(await conversionMenu.locator('.plot-inspector-body').textContent(), pinnedDetails, 'pinned raw data retains its displayed timestamp while plots update');
    await conversionMenu.locator('.plot-inspector-body').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'graph-raw-formula.png'), animations: 'disabled' });
    await conversionMenu.locator('summary').focus(); await page.keyboard.press('Escape');
    assert(!(await conversionMenu.evaluate(element => element.open)));
    await conversionMenu.locator('summary').press('Enter');
    assert(await conversionMenu.evaluate(element => element.open), 'keyboard opens conversion menu');
    await conversionMenu.locator('summary').press('Escape');
    await page.locator('#machine-data > summary').click();
    await page.waitForFunction(() => document.querySelector('#machine-data .channels-panel').matches(':popover-open'));
    await page.locator('#trend-chart').focus(); await page.keyboard.press('Escape');
    assert(!(await page.locator('#machine-data').evaluate(element => element.open)), 'Escape from the chart closes the machine-data popover');
    await page.locator('#toggle-context').click();
    assert(await page.locator('.motor-context').isHidden());
    assert.equal(await page.locator('#toggle-context').getAttribute('aria-expanded'), 'false');
    await page.locator('#toggle-context').click();
    await page.locator('.motor-context').waitFor({ state: 'visible' });
    await page.locator('#graph-shortcuts [data-window="60s"]').click();
    assert.equal(await page.locator('#fleet-window').inputValue(), '60s');
    assert(await page.evaluate(() => chartFrames.length > 0 && Date.parse(chartFrames.at(-1).timestamp) - Date.parse(chartFrames[0].timestamp) <= 60000), 'quick range changes the actual chart window');
    await page.locator('#graph-shortcuts [data-window="300s"]').click();
    await page.locator('#expand-charts').click();
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('trend-panel'));
    assert.equal(await page.locator('#detail-plots .measurement-plot:visible').count(), 3);
    const plotLayout = await page.locator('#detail-plots .measurement-plot').evaluateAll(plots => plots.map(plot => { const rect = plot.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }));
    assert(plotLayout[1].y > plotLayout[0].y && plotLayout[2].y > plotLayout[1].y);
    assert(plotLayout.every(plot => Math.abs(plot.width - plotLayout[0].width) < 2 && Math.abs(plot.x - plotLayout[0].x) < 2), 'three equal full-width rows');
    assert(plotLayout.every(plot => Math.abs(plot.height - plotLayout[0].height) < 2), 'fullscreen plots keep equal readable heights');
    await page.screenshot({ path: path.join(artifacts, 'three-full-width-plots.png'), animations: 'disabled' });
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.fullscreenElement);
    await page.locator('#trend-chart').hover();
    await page.locator('#chart-tooltip').waitFor({ state: 'visible' });
    await page.locator('#pause-stream').click();
    assert((await page.locator('#chart-live').textContent()).includes('PAUSED'));
    await page.locator('#pause-stream').click();
    assert.equal(await page.locator('#detail-plots .measurement-plot:visible').count(), 3);
    assert.equal(await page.locator('#trend-acceleration-chart polyline').count(), 3);
    assert.equal(await page.locator('#trend-displacement-chart polyline').count(), 3);
    assert.equal(await page.locator('#trend-temperature-chart').count(), 0);
    await page.locator('#trend-acceleration-chart').focus(); await page.keyboard.press('Home');
    assert.equal(await page.locator('#detail-plots .plot-crosshair[visibility="visible"]').count(), 3);
    const cursorReadings = await page.locator('#detail-plots .plot-readout').allTextContents();
    assert(cursorReadings[1].includes('µm') && cursorReadings[2].includes('m/s²'));
    // Read injected fixture results in the same renderer task. A live demo tick or
    // ResizeObserver may redraw the real chart between separate IPC round trips.
    const fixturePlot = await page.evaluate(() => {
      const last = chartFrames.at(-1), before = new Date(Date.parse(last.timestamp) - 60000).toISOString();
      detailPlot.draw([{ ...last, timestamp: before, pollIntervalMs: 1000 }, { ...last, pollIntervalMs: 1000 }], currentProfile());
      const gapTraceCount = document.querySelectorAll('#trend-chart polyline').length;
      detailPlot.draw([{ ...last, channels: { ...last.channels, displacementX: 5000, accelerationX: -12, temperature: -5 } }], currentProfile());
      return {
        gapTraceCount,
        displacement: document.querySelector('#detail-plots [data-kind="displacement"] .plot-readout').textContent,
        acceleration: document.querySelector('#detail-plots [data-kind="acceleration"] .plot-readout').textContent,
        pointsInside: [...document.querySelectorAll('#detail-plots svg')].every(svg => [...svg.querySelectorAll('circle')].every(point => Number(point.getAttribute('cy')) > 0 && Number(point.getAttribute('cy')) < svg.viewBox.baseVal.height))
      };
    });
    assert.equal(fixturePlot.gapTraceCount, 6, 'three traces break across missing polls');
    assert(fixturePlot.displacement.includes('5000.0'));
    assert(fixturePlot.acceleration.includes('-12.0'));
    assert(fixturePlot.pointsInside);
    await page.evaluate(() => drawChart());
    // Include usable renderer heights after the Windows title bar and taskbar
    // consume part of a 1366×768 / 1280×720 physical display.
    for (const [width, height] of [[960, 680], [1366, 700], [1366, 768], [1280, 650], [1920, 1080], [1024, 768], [768, 1024]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
      await page.waitForFunction(([expectedWidth, expectedHeight]) => innerWidth === expectedWidth && innerHeight === expectedHeight, [width, height]);
      // Re-enter at each width so responsive defaults are tested as a user opens a motor.
      await page.locator('[data-tab="fleet"]').click();
      await page.locator('[data-tab="monitor"]').click();
      await page.locator('#monitor-content').waitFor({ state: 'visible' });
      await page.evaluate(() => { delete window.__vectraMonitorLayoutProbe; });
      await page.waitForFunction(() => {
        const nodes = [document.querySelector('main'), document.getElementById('monitor-content'), ...document.querySelectorAll('#detail-plots .measurement-plot:not([hidden]) svg')];
        if (nodes.some(element => !element || element.clientWidth <= 0 || element.clientHeight <= 0)) return false;
        const key = JSON.stringify(nodes.map(element => { const rect = element.getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 10)); }));
        const probe = window.__vectraMonitorLayoutProbe;
        if (!probe || probe.key !== key) { window.__vectraMonitorLayoutProbe = { key, frames: 0 }; return false; }
        return ++probe.frames >= 3;
      });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} page overflow`);
      assert(await page.locator('#disconnect').isVisible());
      assert.equal(await page.locator('#detail-plots .measurement-plot:not([hidden]) svg').count(), 3);
      assert.equal(await page.locator('#detail-plots .measurement-plot:not([hidden]) .plot-readout').count(), 3);
      assert.equal(await page.locator('#compact-frequency strong').count(), 3);
      assert(await page.locator('#compact-frequency strong').evaluateAll(values => values.every(value => Number.isFinite(Number(value.textContent)) && value.textContent.trim())), `${width} frequency values are rendered`);
      const viewportLayout = await page.evaluate(() => {
        const main = document.querySelector('main'), mainRect = main.getBoundingClientRect();
        const elements = [...document.querySelectorAll('#detail-plots .measurement-plot:not([hidden]) svg, #detail-plots .measurement-plot:not([hidden]) .plot-readout, #compact-frequency strong')];
        return {
          horizontal: main.scrollWidth - main.clientWidth,
          vertical: main.scrollHeight - main.clientHeight,
          scrollTop: main.scrollTop,
          outside: elements.map(element => {
            const rect = element.getBoundingClientRect();
            return { element: element.id || element.className, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, visible: rect.width > 0 && rect.height > 0 && rect.left >= mainRect.left - 1 && rect.right <= mainRect.right + 1 && rect.top >= mainRect.top - 1 && rect.bottom <= mainRect.bottom + 1 };
          }).filter(element => !element.visible)
        };
      });
      assert(viewportLayout.horizontal <= 1 && viewportLayout.vertical <= 1 && viewportLayout.scrollTop === 0 && !viewportLayout.outside.length, `${width}×${height} monitor must fit one viewport: ${JSON.stringify(viewportLayout)}`);
      if (width < 1180) {
        assert(await page.locator('#motor-sidebar').isHidden(), `${width} registry auto-collapses on entering monitor`);
        assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-expanded'), 'false');
        await page.locator('#toggle-sidebar').click();
        await page.locator('#motor-sidebar').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-expanded'), 'true');
        await page.locator('#toggle-sidebar').click();
        await page.locator('#motor-sidebar').waitFor({ state: 'hidden' });
      }
      await page.screenshot({ path: path.join(artifacts, `monitor-${width}x${height}.png`), animations: 'disabled' });
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    await page.locator('[data-tab="registers"]').click();
    await page.screenshot({ path: path.join(artifacts, 'register-monitor.png') });
    await page.locator('[data-tab="history"]').click();
    await page.locator('#history-summary').filter({ hasText: '1 รายการ' }).waitFor();
    assert((await page.locator('#history-body').textContent()).includes('-5.0'));
    await page.locator('#history-motor').selectOption('MTR-01'); await page.locator('#load-range').click();
    await page.locator('#range-summary').filter({ hasText: '1 ค่าจริง' }).waitFor();
    assert.equal(await page.locator('#history-chart circle').count(), 3);
    assert.equal(await page.locator('#history-plots .measurement-plot:visible').count(), 3);
    assert.equal(await page.locator('#history-plots [data-kind="temperature"]').count(), 0);
    await page.locator('#history-motor').selectOption('MTR-02');
    assert.equal(await page.locator('#history-chart circle').count(), 0, 'a different motor never inherits the prior historical curve');
    await page.locator('#history-motor').selectOption('MTR-01'); await page.locator('#load-range').click();
    await page.locator('#range-summary').filter({ hasText: '1 ค่าจริง' }).waitFor();
    const exportPath = path.join(temporary, 'readings-export.csv');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
    await page.locator('#export-csv').click();
    await page.waitForFunction(() => !document.getElementById('export-csv').disabled);
    assert(fs.readFileSync(exportPath, 'utf8').includes('"MTR-01"'));
    assert(fs.readFileSync(exportPath, 'utf8').includes('"-5"'));
    await page.locator('#disconnect').click();
    await page.locator('#new-motor').waitFor();
    await page.waitForFunction(() => !document.getElementById('new-motor').disabled);
    await page.locator('#record-settings').click();
    await page.locator('#record-start-mode').selectOption('monitor-only');
    assert(await page.locator('#record-duration-label').isHidden());
    await page.locator('#save-recording').click();
    await page.locator('#recording-dialog').waitFor({ state: 'hidden' });
    assert((await page.locator('#connect-all').textContent()).includes('เริ่มดูข้อมูล'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(temporary, 'recording.json'), 'utf8')).startMode, 'monitor-only');
    await page.locator('#record-settings').click();
    await page.locator('#record-start-mode').selectOption('scheduled');
    await page.locator('#save-recording').click();
    await page.locator('#recording-dialog').waitFor({ state: 'hidden' });
    await page.evaluate(() => { recordingState.settings.startAt = new Date(Date.now() - 60000).toISOString(); });
    await page.locator('#connect-all').click();
    await page.locator('#recording-dialog').waitFor({ state: 'visible' });
    assert((await page.locator('#record-form-error').textContent()).includes('เวลาบันทึกผ่านแล้ว'));
    assert((await page.locator('#mode-indicator').textContent()).includes('OFFLINE'));
    await page.locator('#record-start-mode').selectOption('on-connect');
    await page.locator('#recording-form [name="durationMinutes"]').fill('30');
    await page.screenshot({ path: path.join(artifacts, 'recording-settings.png'), animations: 'disabled' });
    await page.locator('#save-recording').click();
    await page.locator('#recording-dialog').waitFor({ state: 'hidden' });
    assert.equal(JSON.parse(fs.readFileSync(path.join(temporary, 'recording.json'), 'utf8')).durationMinutes, 30);
    assert.equal(await page.locator('.motor-item').count(), 2);
    await page.locator('[data-tab="motors"]').click();
    const backupPath = path.join(temporary, 'backup.json');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, backupPath);
    await page.locator('#export-profiles').click();
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('สำรองรายชื่อแล้ว'));
    assert.equal(JSON.parse(fs.readFileSync(backupPath, 'utf8')).motors.length, 2);
    await page.locator('[data-tab="fleet"]').click();
    await page.getByRole('button', { name: 'ลบ MTR-02', exact: true }).click();
    await page.locator('#accept-confirm').click();
    await page.waitForFunction(() => document.querySelectorAll('.motor-item').length === 1);
    const saved = JSON.parse(fs.readFileSync(path.join(temporary, 'motors.json'), 'utf8'));
    assert.equal(saved.length, 1); assert.equal(saved[0].motorId, 'MTR-01');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      dialog.showMessageBox = async () => ({ response: 1 });
    }, backupPath);
    await page.locator('[data-tab="motors"]').click();
    await page.locator('#import-profiles').click();
    await page.waitForFunction(() => document.querySelectorAll('.motor-item').length === 2);
    // Exercise the complete renderer live/error/recovery lifecycle using an isolated IPC fixture.
    // The actual serial scheduler and decoder are tested with FakeClient in fleet-store.cjs.
    await app.evaluate(({ ipcMain }) => {
      const recording = { settings: { startMode: 'on-connect', durationMinutes: 0, startAt: '' }, connected: true, active: false, waiting: false, count: 0 };
      ipcMain.removeHandler('recording:start'); ipcMain.removeHandler('recording:stop');
      ipcMain.handle('recording:start', () => ({ ok: true, recording: { ...recording, active: true, startedAt: new Date().toISOString() } }));
      ipcMain.handle('recording:stop', () => ({ ok: true, recording }));
      ipcMain.removeHandler('sensor:connect');
      ipcMain.handle('sensor:connect', (_event, configs) => ({ ok: true, configs, recording: { ...recording, active: true, startedAt: new Date().toISOString() }, readings: configs.map(config => ({
        motorId: config.motorId, value: 3.4, primaryAxis: 'Z', unit: 'mm/s', port: config.path, slaveId: config.slaveId,
        timestamp: new Date().toISOString(), elapsedMs: 24, recorded: true,
        channels: { temperature: 35, velocityX: 1.2, velocityY: 2.3, velocityZ: 3.4, displacementX: 4000, displacementY: 20, displacementZ: 30, accelerationX: -1, accelerationY: 1.2, accelerationZ: 1.3 },
        rawRegisters: { primary: [350, 12, 23, 34, 40000, 200, 300], acceleration: [65526, 12, 13] }
      })) }));
    });
    await page.locator('#connect-all').click();
    await page.locator('#mode-indicator').filter({ hasText: 'ACQUIRING' }).waitFor();
    assert.equal(await page.locator('#fleet-online').textContent(), '2');
    await page.locator('#recording-status').filter({ hasText: 'กำลังอ่านและบันทึก' }).waitFor();
    assert(await page.locator('#connect-all').isHidden()); assert(await page.locator('#disconnect').isVisible());
    assert((await page.locator('#disconnect').textContent()).includes('หยุดอ่านและบันทึก'));
    await page.locator('#session-actions summary').click(); await page.locator('#record-stop').click();
    await page.locator('#recording-status').filter({ hasText: 'กำลังอ่าน · ไม่บันทึก' }).waitFor();
    assert((await page.locator('#mode-indicator').textContent()).includes('ACQUIRING'), 'stopping recording leaves acquisition running');
    await page.locator('#session-actions summary').click(); await page.locator('#record-start').click();
    await page.locator('#recording-status').filter({ hasText: 'กำลังอ่านและบันทึก' }).waitFor();
    await page.locator('[data-tab="monitor"]').click();
    assert.equal(await page.locator('#reading-value').textContent(), '3.40');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('sensor:status', { state: 'read-error', motorId: 'MTR-01', message: 'Test timeout' }));
    await page.locator('#selection-state.fault').waitFor();
    await page.locator('[data-tab="fleet"]').click();
    await page.locator('#fleet-filter').selectOption('fault');
    assert.equal(await page.locator('.fleet-card:visible').count(), 1);
    assert((await page.locator('.fleet-problem:visible').textContent()).includes('Test timeout'));
    await page.screenshot({ path: path.join(artifacts, 'communication-fault.png') });
    await page.locator('#fleet-filter').selectOption('all');
    await page.locator('[data-tab="monitor"]').click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('sensor:reading', { motorId: 'MTR-01', value: 2.5, unit: 'mm/s', timestamp: new Date(Date.now() + 50).toISOString(), rawRegisters: [25], recorded: true }));
    await page.locator('#selection-state.online').waitFor();
    assert.equal(await page.locator('#reading-value').textContent(), '2.50');
    await page.locator('[data-tab="fleet"]').click();
    await page.getByRole('button', { name: 'แก้ไข MTR-01', exact: true }).click();
    await page.locator('#accept-confirm').click();
    await page.locator('#connection-dialog').waitFor({ state: 'visible' });
    await page.locator('[name="name"]').fill('Cooling water pump 01 updated');
    await page.locator('#save-motor').click();
    await page.locator('#connection-dialog').waitFor({ state: 'hidden' });
    assert((await page.locator('[data-fleet-id="MTR-01"] h2').textContent()).includes('updated'));
    // Metadata edits preserve readings; reassignment to another sensor must not reuse them.
    assert(!(await page.locator('[data-fleet-id="MTR-01"] .fleet-last').textContent()).includes('ยังไม่ได้รับข้อมูล'));
    await page.getByRole('button', { name: 'แก้ไข MTR-01', exact: true }).click();
    await page.locator('[name="slaveId"]').fill('3');
    await page.locator('#save-motor').click();
    await page.locator('#connection-dialog').waitFor({ state: 'hidden' });
    assert((await page.locator('[data-fleet-id="MTR-01"] .fleet-last').textContent()).includes('ยังไม่ได้รับข้อมูล'));
    await page.getByRole('button', { name: 'แก้ไข MTR-01', exact: true }).click();
    await page.locator('#sensor-model').selectOption('custom');
    await page.locator('[name="unit"]').fill('µm');
    await page.locator('#save-motor').click();
    await page.locator('#connection-dialog').waitFor({ state: 'hidden' });
    assert((await page.locator('[data-fleet-id="MTR-01"] .fleet-trend-heading').textContent()).includes('Custom value · µm'));
    await page.locator('[data-tab="monitor"]').click();
    assert((await page.locator('#detail-plots [data-kind="velocity"] h3').textContent()).includes('Custom value · µm'));
    assert((await page.locator('#trend-chart').getAttribute('aria-label')).includes('Custom value · µm'), 'accessible chart names follow the configured measurement and unit');
    assert.equal(await page.locator('#detail-plots .measurement-plot:not([hidden])').count(), 1, 'custom sensors do not invent nine channels');
    await page.evaluate(() => detailPlot.draw([{ timestamp: new Date().toISOString(), value: .001, unit: 'µm' }], currentProfile()));
    assert((await page.locator('#detail-plots .plot-readout').first().textContent()).includes('1.00e-3'), 'small custom readings must not be rounded to zero');
    assert(await page.locator('#trend-chart circle').evaluate(point => Number(point.getAttribute('cy')) < point.ownerSVGElement.viewBox.baseVal.height / 2), 'small custom values get an appropriate automatic scale');
    await page.evaluate(() => { rangeProfile = { sensorModel: 'custom', unit: 'µm' }; historyPlot.draw([{ timestamp: new Date().toISOString(), value: .001, unit: 'µm' }], rangeProfile); });
    assert(await page.locator('.history-range .chart-legend').isHidden(), 'custom history does not show nonexistent XYZ axes');
    await page.waitForFunction(() => !document.getElementById('new-motor').disabled);
    assert.equal(fs.readFileSync(path.join(temporary, 'data', `readings-${date}.ndjson`), 'utf8').trim().split('\n').length, 1, 'simulation must not write readings');
    assert.deepEqual(errors, []);
    console.log('PASS: profile CRUD, filters, keyboard tabs, responsive registry, axis emphasis, single-viewport plots at 7 desktop/tablet viewport sizes, fault recovery, sensor reassignment and history');
  } finally { await app.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
