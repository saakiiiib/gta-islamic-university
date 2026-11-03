// Read-only smoke check of the deployed game using an isolated Chrome profile.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const url = process.argv[2] ?? 'https://saakiiiib.github.io/gta-islamic-university/';
const output = resolve(process.env.CAMPUS_QA_OUTPUT ?? 'validation/gate-landing/live');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { url, checkedAt: new Date().toISOString(), profiles: [], passed: false };
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1365, height: 768 } });
    const testMouse = !mobile && process.env.CAMPUS_MOUSE_QA === '1';
    if (testMouse) await context.addInitScript(() => {
      // Match the in-app browser where pointer capture is not exposed.
      Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: undefined });
    });
    const page = await context.newPage(), errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push({ url: response.url(), status: response.status() }); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    assert.equal(await page.getByRole('button', { name: 'Male', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Female', exact: true }).click();
    await page.waitForFunction(() => ['ready', 'error'].includes(document.body.dataset.gameState), null, { timeout: 120000 });
    assert.equal(await page.locator('body').getAttribute('data-game-state'), 'ready', await page.locator('#error-message').textContent());
    assert.equal(await page.locator('#game').getAttribute('data-character'), 'niqab');
    assert.equal(await page.locator('#game').getAttribute('data-prepared'), 'true');
    const startup = await page.evaluate(() => ({ readyMs: Number(document.querySelector('#game').dataset.readyMs),
      menuPaintMs: Number(document.body.dataset.menuPaintMs), menuReadyMs: Number(document.body.dataset.menuReadyMs),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      imageFailures: [...document.querySelectorAll('#landing img')].filter(i => !i.complete || !i.naturalWidth).length,
    }));
    assert.equal(startup.horizontalOverflow, false); assert.equal(startup.imageFailures, 0);
    await page.screenshot({ path: resolve(output, `${mobile ? 'mobile' : 'desktop'}-landing.png`) });
    await page.locator('#enterButton').click();
    await page.waitForFunction(() => document.body.dataset.gameState === 'playing' && !document.body.classList.contains('entering-campus'));
    await page.waitForFunction(() => document.querySelector('#game').dataset.pedestrians === '30');
    if (testMouse) {
      const yaw = Number(await page.locator('#game').getAttribute('data-camera-heading'));
      await page.mouse.move(650, 340); await page.mouse.move(850, 360, { steps: 10 });
      await page.waitForFunction(before => Math.abs(Number(document.querySelector('#game').dataset.cameraHeading) - before) > .2, yaw);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('#game').dataset.grounded === 'false');
      await page.waitForFunction(() => document.querySelector('#game').dataset.grounded === 'true');
    }
    const state = await page.locator('#game').evaluate(canvas => ({ ...canvas.dataset }));
    assert.equal(state.character, 'niqab'); assert.equal(state.vans, '8');
    assert.equal(state.inputMode, mobile ? 'touch' : 'desktop');
    if (mobile) assert.equal(await page.locator('#touch-controls').isVisible(), true);
    await page.screenshot({ path: resolve(output, `${mobile ? 'mobile' : 'desktop'}-gameplay.png`) });
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    report.profiles.push({ mobile, startup, state, errors, failed, mouseLookWithoutCapture: testMouse, groundedJump: testMouse });
    await context.close();
  }
  report.passed = true;
} finally {
  await browser.close(); await writeFile(resolve(output, 'hosted-browser.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
