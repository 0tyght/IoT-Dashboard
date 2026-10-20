'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');

(async () => {
  const projectRoot = path.join(__dirname, '..');
  const artifactDirectory = path.join(projectRoot, '.artifacts');
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const packaged = process.env.ELECTRON_EXECUTABLE;
  const electronApp = await electron.launch(packaged
    ? { executablePath: packaged, args: [] }
    : { args: ['.'], cwd: projectRoot });
  try {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#setup-page').waitFor({ state: 'visible' });
    assert.equal(await page.title(), 'VECTRA Sensor Monitor');
    assert.equal(await page.evaluate(() => Boolean(window.vectraDesktop)), true);
    assert.equal(await page.locator('#connect-sensor').isDisabled(), true);
    assert.equal(await page.locator('.settings-card').isVisible(), true);
    await page.screenshot({ path: path.join(artifactDirectory, 'windows-setup.png') });

    await page.locator('#demo-mode').click();
    await page.locator('#dashboard-page').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#session-mode').textContent(), 'ข้อมูลจำลอง');
    assert.equal(await page.locator('#reading-value').textContent() !== '—', true);
    await page.screenshot({ path: path.join(artifactDirectory, 'windows-dashboard.png') });

    await page.locator('#back-settings').click();
    await page.locator('#setup-page').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-page="dashboard"]').isDisabled(), true);
    console.log('PASS: Windows setup lock, simulation dashboard, chart and return to settings');
  } finally {
    await electronApp.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
