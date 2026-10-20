'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { _electron: electron } = require('playwright');

(async () => {
  const packaged = process.env.ELECTRON_EXECUTABLE;
  const electronApp = await electron.launch(packaged
    ? { executablePath: packaged, args: [] }
    : { args: ['.'], cwd: path.join(__dirname, '..') });
  try {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#sensor-setup[open]').waitFor({ state: 'visible' });
    assert.equal(await page.title(), 'VECTRA — Motor intelligence');
    assert.equal(await page.evaluate(() => Boolean(window.vectraDesktop)), true);
    assert.equal(await page.locator('.setup-progress li').count(), 3);
    assert.equal(await page.locator('#enter-dashboard').isDisabled(), true);
    await page.screenshot({ path: '.artifacts/desktop-sensor-setup.png' });
    await page.locator('#demo-mode').click();
    await page.locator('#sensor-setup').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.motor-pin').count(), 12);
    assert.equal(await page.locator('#sensor-settings').isVisible(), true);
    await page.locator('#sensor-settings').click();
    await page.locator('#sensor-setup[open]').waitFor({ state: 'visible' });
    console.log('PASS: Electron preload; mandatory sensor setup; demo fallback; dashboard and reopen settings');
  } finally {
    await electronApp.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
