import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:4174/';
const output = resolve('validation/startup'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1365, height: 768 } });
    for (const visit of ['cold', 'warm']) {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.__startupTasks = []; window.__startupPhases = []; let previous = '';
        new MutationObserver(() => {
          const message = document.getElementById('loadingMessage')?.textContent;
          if (message && message !== previous) { previous = message; window.__startupPhases.push({ ms: Math.round(performance.now()), message }); }
        }).observe(document, { subtree: true, childList: true });
        new PerformanceObserver(list => {
          for (const task of list.getEntries()) if (task.duration > 100) window.__startupTasks.push(Math.round(task.duration));
        }).observe({ entryTypes: ['longtask'] });
      });
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
      if (visit === 'cold') {
        // Selection while map/model initialization is still pending.
        await page.locator('[data-char="niqab"]').click();
      }
      await page.waitForFunction(() => ['ready', 'error'].includes(document.body.dataset.gameState), null, { timeout: 120000 });
      const report = await page.evaluate(() => ({
        readyMs: Number(document.querySelector('#game').dataset.readyMs), state: document.body.dataset.gameState,
        character: document.querySelector('#game').dataset.character, prepared: document.querySelector('#game').dataset.prepared,
        error: document.getElementById('error-message').textContent, phases: window.__startupPhases, longTasksMs: window.__startupTasks,
        transferredBytes: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0),
        visibleChoices: [...document.querySelectorAll('.char-pill:not([hidden])')].map(button => button.innerText.trim()),
      }));
      assert.equal(report.state, 'ready', report.error); assert.equal(report.prepared, 'true');
      assert.equal(report.character, visit === 'cold' ? 'niqab' : 'hujur');
      assert.deepEqual(report.visibleChoices, ['Male', 'Female']);
      assert.equal(await page.locator('#enterButton').isEnabled(), true);
      await page.screenshot({ path: resolve(output, `${mobile ? 'mobile' : 'desktop'}-${visit}-landing.png`) });
      for (const type of ['hujur', 'niqab', 'hujur', report.character]) {
        await page.locator(`[data-char="${type}"]`).click();
        await page.waitForFunction(() => !document.querySelector('#enterButton').disabled);
        assert.equal(await page.locator('#game').getAttribute('data-character'), type);
      }
      await page.locator('#enterButton').click();
      await page.waitForFunction(() => document.body.dataset.gameState === 'playing');
      await page.waitForTimeout(600);
      const before = await page.locator('#game').getAttribute('data-position');
      if (!mobile) {
        await page.keyboard.down('w'); await page.waitForTimeout(650); await page.keyboard.up('w');
        assert.notEqual(await page.locator('#game').getAttribute('data-position'), before);
        await page.keyboard.press('Space'); await page.waitForTimeout(140);
        assert.equal(await page.locator('#game').getAttribute('data-grounded'), 'false');
      }
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(output, `${mobile ? 'mobile' : 'desktop'}-${visit}-gameplay.png`) });
      if (mobile) await page.locator('[data-touch-action="pause"]').tap();
      else await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.body.dataset.gameState === 'paused');
      await page.locator('#resume-button').click();
      await page.waitForFunction(() => document.body.dataset.gameState === 'playing');
      const actorData = await page.locator('#game').evaluate(canvas => ({ ...canvas.dataset }));
      assert.equal(actorData.pedestrians, '30'); assert.equal(actorData.vans, '8');
      if (mobile) {
        await page.locator('[data-touch-action="pause"]').tap();
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      }
      assert.deepEqual(errors, []);
      const result = { mobile, visit, ...report, actorData, errors };
      results.push(result); console.log(JSON.stringify(result)); await page.close();
    }
    await context.close();
  }
  await writeFile(resolve(output, 'browser.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
