'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');
(async () => {
  const project = path.resolve(__dirname, '..'), base = path.join(project, '.test-tmp'), artifacts = path.join(project, '.artifacts');
  fs.mkdirSync(base, { recursive: true }); fs.mkdirSync(artifacts, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(base, 'layout-stability-'));
  let app, page; const errors = [];
  try {
    app = await electron.launch({ ...(process.env.ELECTRON_EXECUTABLE ? { executablePath: process.env.ELECTRON_EXECUTABLE, args: [] } : { args: ['.'], cwd: project }), env: { ...process.env, VECTRA_TEST_DATA: temporary, TEMP: base, TMP: base } });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.waitForLoadState('domcontentloaded'); await page.locator('#app-version').filter({ hasText: `v${require('../package.json').version}` }).waitFor();
    await page.locator('#session-actions summary').click(); await page.locator('#demo-mode').click();
    const tabs = await page.locator('[data-tab]').evaluateAll(buttons => buttons.map(button => button.dataset.tab));
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    for (const [width, height] of [[768, 1024], [960, 680], [1366, 768], [1920, 1080]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
      await page.waitForFunction(size => innerWidth === size[0] && innerHeight === size[1], [width, height]);
      for (const tab of tabs) {
        await page.locator(`[data-tab="${tab}"]`).click(); await settle();
        assert.equal(await page.locator('.tabs [role="tab"][aria-selected="true"]').count(), 1);
        assert.equal(await page.locator('.tabs [role="tab"][tabindex="0"]').count(), 1);
        assert(await page.locator(`#${tab}-view`).isVisible(), `${width}: ${tab} page opens`);
        if (tab === 'power') {
          assert(await page.locator('.power-preview').isVisible(), 'electrical preview is labelled');
          assert((await page.locator('.power-measurements').textContent()).includes('—'), 'missing electrical readings are not fabricated');
          assert.equal(await page.locator('#power-selected-point').textContent(), 'ยังไม่มีมิเตอร์ที่เลือก');
          assert((await page.locator('.power-point-confirmed').textContent()).includes('ยังไม่ได้เลือก Power Meter'));
          assert.equal(await page.locator('[data-power-point="generator"]').count(), 0, 'the one meter is not presented as generator output');
          if (width === 1366) {
            const vertical = await page.locator('main').evaluate(element => element.scrollHeight - element.clientHeight);
            assert(vertical <= 2, `power preview fits a 1366x768 viewport (overflow ${vertical}px)`);
            await page.screenshot({path:path.join(artifacts, 'power-preview.png'),animations:'disabled'});
          }
        }
        const layout = await page.locator('main').evaluate(main => ({ horizontal: main.scrollWidth - main.clientWidth, width: main.getBoundingClientRect().width, pageHorizontal: document.documentElement.scrollWidth - innerWidth }));
        assert(layout.horizontal <= 1 && layout.pageHorizontal <= 1, `${width}: ${tab} page does not overflow horizontally`);
        if (width < 1180) {
          assert(await page.locator('#motor-sidebar').isHidden(), `${width}: ${tab} gives the content the full workspace by default`);
          assert(layout.width >= width - 2, `${width}: ${tab} is not squeezed by a permanent sidebar`);
          await page.locator('#toggle-sidebar').click(); await page.locator('#motor-sidebar').waitFor({ state: 'visible' });
          assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-expanded'), 'true');
          assert.equal(await page.locator('#motor-sidebar').getAttribute('aria-modal'), 'true');
          assert(await page.locator('main').evaluate(element => element.inert), 'background is unavailable while the drawer is modal');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'motor-search', 'drawer opens at the search field');
          const lastButton = page.locator('#motor-sidebar .motor-item').last(); await lastButton.focus(); await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'close-sidebar', 'Tab wraps inside the drawer');
          await page.keyboard.press('Shift+Tab');
          assert(await lastButton.evaluate(element => element === document.activeElement), 'Shift+Tab wraps back to the last motor');
          await page.keyboard.press('Escape');
          assert(await page.locator('#motor-sidebar').isHidden());
          assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-sidebar', 'Escape returns focus to the opening control');
          assert(!(await page.locator('main').evaluate(element => element.inert)));
          await page.locator('#toggle-sidebar').click(); const backdrop = await page.locator('#sidebar-backdrop').boundingBox();
          await page.mouse.click(backdrop.x + backdrop.width - 12, backdrop.y + Math.min(backdrop.height / 2, 80));
          assert(await page.locator('#motor-sidebar').isHidden(), 'clicking outside closes the drawer');
          assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-expanded'), 'false');
        }
      }
      await page.locator('[data-tab="fleet"]').focus(); await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-tab="monitor"]').getAttribute('aria-selected'), 'true', 'keyboard navigation continues to work on every layout');
      if (width === 768) {
        await page.locator('[data-tab="analysis"]').click(); await page.locator('#toggle-sidebar').click();
        await page.screenshot({ path: path.join(artifacts, 'shared-motor-drawer.png'), animations: 'disabled' });
        await page.locator('#motor-sidebar .motor-item').first().click();
        assert(await page.locator('#motor-sidebar').isHidden(), 'choosing a motor closes the drawer');
        assert.equal(await page.locator('[data-tab="monitor"]').getAttribute('aria-selected'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-monitor');
      }
    }
    // A user-collapsed desktop registry remains collapsed after a narrow-screen visit.
    await page.locator('#toggle-sidebar').click(); assert(await page.locator('#motor-sidebar').isHidden());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(960, 680));
    await page.waitForFunction(() => innerWidth === 960); await settle();
    await page.locator('#toggle-sidebar').click(); assert(await page.locator('#motor-sidebar').isVisible());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await page.waitForFunction(() => innerWidth === 1366); await settle();
    assert(await page.locator('#motor-sidebar').isHidden(), 'desktop collapse preference survives breakpoint changes');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-sidebar', 'resize cannot strand focus inside the hidden registry');
    assert.deepEqual(errors, []);
    console.log('PASS: every page at 768/960/1366/1920, full-width narrow workspace, modal drawer focus/keyboard/outside close, motor selection and desktop collapse preference');
  } catch (error) { if (page) await page.screenshot({ path: path.join(artifacts, 'layout-stability-failure.png'), animations: 'disabled' }).catch(() => {}); throw error; }
  finally { if (app) await app.close(); assert.equal(path.dirname(temporary), base); fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
