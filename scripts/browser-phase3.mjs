import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Optional developer QA; Playwright is not a game/runtime dependency.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const [url = 'http://127.0.0.1:5173/', stage = 'after'] = process.argv.slice(2);
const output = resolve('validation/phase3'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=CalculateNativeWinOcclusion'] });
const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
const page = await context.newPage(), errors = [], failedRequests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
// Expose module-local state only in the intercepted QA browser. No shipped cheat API.
await page.route('**/src/main.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `\n
globalThis.__campusQA = {
  get initialized() { return !!camera && !!simulation && !!hud; },
  pose(p) { input.clear(); simulation.player.teleport({ ...p, y: 0 }, p.yaw); simulation.player.update(1/60); chase.reset(p); },
  snapshot() {
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const raycaster = new THREE.Raycaster();
    const visible = (a,height) => {
      const point = new THREE.Vector3(a.position.x,a.position.y+height,a.position.z);
      if (!frustum.containsPoint(point)||point.distanceTo(camera.position)>160) return false;
      const delta=point.clone().sub(camera.position), distance=delta.length(); raycaster.set(camera.position,delta.normalize()); raycaster.far=distance-.35;
      return !raycaster.intersectObject(world.collisionGroup,true).length && !(world.scenery?.collisionGroup && raycaster.intersectObject(world.scenery.collisionGroup,true).length);
    };
    return { state, fps, position:player.position.toArray(), camera:camera.position.toArray(), yaw:chase.yaw,
      calls:renderer.info.render.calls, triangles:renderer.info.render.triangles,
      npcVisible:simulation.crowd.agents.filter(a=>visible(a,1.5)).length,
      npcNearby:simulation.crowd.agents.filter(a=>a.position.distanceTo(player.position)<=80).length,
      vanVisible:simulation.vans.filter(v=>visible(v,1.4)).length,
      moving:simulation.vans.filter(v=>Math.abs(v.speed)>.15).length,
      agents:simulation.crowd.agents.map(a=>({id:a.id,x:a.position.x,z:a.position.z,hub:a.activityHub,health:a.health,hiddenSince:a.hiddenSince,behavior:a.behavior,speed:a.speed,voice:a.voicePlaying})),
      driving:simulation.session.driving, playerVisible:player.group.visible, drivers:simulation.occupants.drivers.length,
      vans:simulation.vans.map(v=>({id:v.id,position:{...v.position},speed:v.speed,role:v.role,durability:v.durability,autonomous:v.autonomous})),
      activity:simulation.crowd.stats, assets:world.assetState, props:world.scenery?.obstacles.length,
      touch:device.touch, dpr:renderer.getPixelRatio() };
  }
};\n` });
});
const results = [];
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('#start-button').disabled || document.body.dataset.gameState === 'error', { timeout: 120000 });
  await page.waitForFunction(() => globalThis.__campusQA?.initialized, { timeout: 120000 });
  const loadingError = await page.locator('#error-message').textContent();
  if (loadingError) throw new Error(loadingError);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => document.body.dataset.gameState === 'playing');
  for (const [name, pose] of [
    ['main-gate', null],
    ['central-library', { x: -25.28782943698966, z: -176.02037250679874, yaw: .05 }],
    ['applied-science', { x: 37.895737317760904, z: -100.1933783111557, yaw: Math.PI / 2 }],
  ]) {
    if (pose) await page.evaluate(p => __campusQA.pose(p), pose);
    const samples = [];
    const waitSeconds = stage === 'baseline' ? 3 : name === 'applied-science' ? 90 : 20;
    for (let s = 0; s < waitSeconds; s++) {
      await page.waitForTimeout(1000); samples.push(await page.evaluate(() => __campusQA.snapshot()));
      if (stage !== 'baseline' && name === 'applied-science' && s >= 19 && samples.at(-1).npcVisible >= 10) break;
    }
    await page.screenshot({ path: resolve(output, `${stage}-${name}.png`) });
    results.push({ name, pose, elapsedSeconds: samples.length, samples });
    console.log(JSON.stringify({ stage, name, elapsedSeconds:samples.length, ...samples.at(-1), vans: undefined, agents:undefined }));
  }
  await writeFile(resolve(output, `${stage}-browser.json`), JSON.stringify({ url, viewport: { width:1365,height:768 }, renderer:'headless Chrome (not a physical-phone benchmark)', results, errors, failedRequests }, null, 2));
  if (errors.length || failedRequests.length || stage !== 'baseline' && results.some(r=>r.samples.at(-1).npcVisible<10)) process.exitCode = 1;
} finally { await browser.close(); }
