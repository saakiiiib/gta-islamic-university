// Isolated Chrome QA; no signed-in profile or production state is used.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:4189/';
const output = resolve(process.env.CAMPUS_QA_OUTPUT ?? 'validation/gate-landing');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Prove menu selection and Help work before the expensive module arrives.
    await page.route('**/assets/main-*.js', async route => {
      await new Promise(resolve => setTimeout(resolve, 2200)); await route.continue();
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('[data-char="hujur"]').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Female', exact: true }).tap();
    assert.equal(await page.locator('[data-char="niqab"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#controlsButton').tap();
    assert.equal(await page.locator('#controlsDialog').isVisible(), true);
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    await page.waitForFunction(() => ['ready', 'error'].includes(document.body.dataset.gameState), null, { timeout: 90000 });
    assert.equal(await page.locator('body').getAttribute('data-game-state'), 'ready');
    const metrics = await page.evaluate(() => ({ paintMs: Number(document.body.dataset.menuPaintMs),
      menuReadyMs: Number(document.body.dataset.menuReadyMs), readyMs: Number(document.querySelector('#game').dataset.readyMs),
      character: document.querySelector('#game').dataset.character, prepared: document.querySelector('#game').dataset.prepared,
      viewport: [innerWidth, innerHeight], horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      menuOverflow: document.getElementById('landing').scrollWidth > innerWidth,
      imageFailures: [...document.querySelectorAll('#landing img')].filter(image => !image.complete || !image.naturalWidth).length,
    }));
    assert.equal(metrics.character, 'niqab'); assert.equal(metrics.prepared, 'true');
    assert.equal(metrics.horizontalOverflow, false); assert.equal(metrics.menuOverflow, false); assert.equal(metrics.imageFailures, 0);
    await page.screenshot({ path: resolve(output, `portrait-${viewport.width}.png`) });
    await page.locator('#enterButton').tap();
    await page.waitForFunction(() => document.body.dataset.gameState === 'playing');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('entering-campus')), false, 'reduced motion skips camera movement');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#touch-controls').isVisible(), true);
    assert.deepEqual(errors, []);
    results.push({ viewport, delayedGameModuleMs: 2200, ...metrics, errors });
    await context.close();
  }
  // Required-resource errors remain actionable and a fresh retry recovers.
  const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
  const page = await context.newPage();
  await page.route('**/data/map.osm*', route => route.fulfill({ status: 404, body: 'missing fixture' }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.gameState === 'error');
  assert.equal(await page.locator('#enterButton').isDisabled(), true);
  assert.equal(await page.locator('#retry-loading').isVisible(), true);
  await page.unroute('**/data/map.osm*'); await page.locator('#retry-loading').click();
  await page.waitForFunction(() => document.body.dataset.gameState === 'ready', null, { timeout: 90000 });
  results.push({ missingMapErrorAndRetry: true }); await context.close();
  await writeFile(resolve(output, 'menu-checks.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
