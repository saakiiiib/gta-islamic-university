import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const url = process.argv[2] ?? 'http://127.0.0.1:5191/';
const output = resolve(process.env.CAMPUS_QA_OUTPUT ?? 'validation/mouse-physics');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { checkedAt: new Date().toISOString(), profiles: [], passed: false };
try {
  for (const mode of ['native', 'missing', 'rejected']) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (mode !== 'native') await page.addInitScript(mode => {
      Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true,
        value: mode === 'missing' ? undefined : () => Promise.reject(new Error('QA pointer-lock rejection')) });
    }, mode);
    await page.route('**/src/main.js*', async route => {
      const response = await route.fetch();
      const hook = [
        'globalThis.__mouseQA = {',
        "get ready() { return state === 'ready'; },",
        'snapshot() { return { state, yaw: chase.yaw, position: player.position.toArray(), speed: player.speed,',
        'vertical: player.velocity.y, grounded: player.grounded, locked: document.pointerLockElement === canvas,',
        'enabled: input.enabled, keys: [...input.keys], motion: player.state.motionState, health: player.health }; }',
        '};',
      ].join('\n');
      await route.fulfill({ response, body: await response.text() + '\n' + hook });
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => globalThis.__mouseQA?.ready, null, { timeout: 120000 });
    await page.locator('#enterButton').click();
    await page.waitForFunction(() => document.body.dataset.gameState === 'playing' && !document.body.classList.contains('entering-campus'));
    const before = await page.evaluate(() => __mouseQA.snapshot());
    if (mode === 'native') assert.equal(before.locked, true, 'native pointer capture engages');
    else assert.equal(before.locked, false);
    await page.mouse.move(650, 340);
    const mouseStart = await page.evaluate(() => __mouseQA.snapshot());
    await page.mouse.move(850, 360, { steps: 10 });
    await page.waitForFunction(yaw => Math.abs(__mouseQA.snapshot().yaw - yaw) > .2, mouseStart.yaw);
    const looked = await page.evaluate(() => __mouseQA.snapshot());
    await page.screenshot({ path: resolve(output, mode + '-mouse-look.png') });
    if (mode !== 'native') {
      await page.mouse.move(1120, 110);
      const hudStart = await page.evaluate(() => __mouseQA.snapshot());
      await page.mouse.move(1190, 110, { steps: 5 });
      const hudEnd = await page.evaluate(() => __mouseQA.snapshot());
      assert.ok(Math.abs(hudEnd.yaw - hudStart.yaw) < .001, 'toolbar interaction does not rotate the camera');
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.dataset.gameState === 'paused');
    const paused = await page.evaluate(() => __mouseQA.snapshot());
    await page.mouse.move(600, 340); await page.mouse.move(800, 380);
    assert.equal((await page.evaluate(() => __mouseQA.snapshot())).yaw, paused.yaw);
    await page.locator('#resume-button').click();
    await page.waitForFunction(() => document.body.dataset.gameState === 'playing');
    await page.keyboard.press('r');
    await page.waitForFunction(() => {
      const p = __mouseQA.snapshot();
      return p.grounded && Math.hypot(p.position[0] - 317.5, p.position[2] + 73.5) < .1;
    });
    const start = await page.evaluate(() => __mouseQA.snapshot());
    await page.keyboard.down('w');
    await page.waitForFunction(position => {
      const next = __mouseQA.snapshot().position;
      return Math.hypot(next[0] - position[0], next[2] - position[2]) > 1;
    }, start.position, { timeout: 8000 });
    await page.keyboard.up('w');
    await page.waitForFunction(() => __mouseQA.snapshot().speed < .05);
    const walking = await page.evaluate(() => __mouseQA.snapshot());
    for (let jump = 0; jump < 3; jump++) {
      await page.waitForFunction(() => __mouseQA.snapshot().grounded);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => __mouseQA.snapshot().vertical > 1 && !__mouseQA.snapshot().grounded, null, { timeout: 4000 });
      await page.waitForFunction(() => __mouseQA.snapshot().grounded && Math.abs(__mouseQA.snapshot().vertical) < .1, null, { timeout: 8000 });
    }
    const landed = await page.evaluate(() => __mouseQA.snapshot());
    assert.ok(Math.abs(landed.position[1]) < .02, 'repeated jumping returns to the real floor');
    const chaseYaw = landed.yaw;
    await page.keyboard.press('i'); await page.waitForFunction(() => document.body.dataset.gameState === 'inspection');
    await page.keyboard.press('i'); await page.waitForFunction(() => document.body.dataset.gameState === 'playing');
    assert.equal((await page.evaluate(() => __mouseQA.snapshot())).yaw, chaseYaw);
    await page.screenshot({ path: resolve(output, mode + '-gameplay.png') });
    assert.deepEqual(errors, []);
    report.profiles.push({ mode, before, looked, walking, landed, errors });
    console.log(JSON.stringify(report.profiles.at(-1)));
    await context.close();
  }
  report.passed = true;
} finally {
  await browser.close(); await writeFile(resolve(output, 'mouse-browser.json'), JSON.stringify(report, null, 2));
}
