// Optional browser QA: compare the prior committed build without checking it out.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const exec = promisify(execFile), revision = '5f2c051241f7ada24a29dfb2fb42fed601d92fbb';
const gitFile = async path => (await exec('git', ['show', `${revision}:docs/${path}`], { encoding: 'buffer', maxBuffer: 5_000_000 })).stdout;
const files = new Map([['index.html', await gitFile('index.html')]]);
const assetList = (await exec('git', ['ls-tree', '-r', '--name-only', revision, 'docs/assets'])).stdout.trim().split('\n');
for (const path of assetList) files.set(path.slice('docs/'.length), await gitFile(path.slice('docs/'.length)));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.gltf': 'model/gltf+json', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
    if (path.includes('..')) throw new Error('Invalid path');
    const body = files.get(path) ?? await readFile(resolve('public', path));
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'max-age=600' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(4178, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true }), results = [];
try {
  for (let run = 1; run <= 3; run++) for (const build of run % 2 ? ['before', 'after'] : ['after', 'before']) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
    for (const visit of ['cold', 'warm']) {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__readyAt = null; window.__longTasks = [];
        new MutationObserver(() => {
          if (window.__readyAt === null && document.querySelector('#enterButton')?.disabled === false) window.__readyAt = performance.now();
        }).observe(document, { subtree: true, attributes: true, childList: true });
        new PerformanceObserver(list => { for (const item of list.getEntries()) window.__longTasks.push(item.duration); }).observe({ entryTypes: ['longtask'] });
      });
      await page.goto(build === 'before' ? 'http://127.0.0.1:4178/' : process.argv[2] ?? 'http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.querySelector('#enterButton')?.disabled, null, { timeout: 120000 });
      const result = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({
        buttonReadyMs: Math.round(window.__readyAt), stableFrameMs: Math.round(performance.now()), longestTaskMs: Math.round(Math.max(0, ...window.__longTasks)),
        transferredBytes: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0),
      })))));
      assert.ok(result.buttonReadyMs > 0); results.push({ run, build, visit, ...result }); console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
    await context.close();
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = Object.fromEntries(['before', 'after'].map(build => [build, Object.fromEntries(['cold', 'warm'].map(visit => {
    const group = results.filter(r => r.build === build && r.visit === visit);
    return [visit, { readyMedianMs: median(group.map(r => r.buttonReadyMs)), stableFrameMedianMs: median(group.map(r => r.stableFrameMs)), longestTaskMedianMs: median(group.map(r => r.longestTaskMs)) }];
  }))]));
  await mkdir('validation/startup', { recursive: true });
  await writeFile('validation/startup/benchmark.json', JSON.stringify({ baseline: revision, environment: 'Temporary headless Chrome, desktop 1365×768, local HTTP servers; alternating build order, three fresh-context pairs per build. This is not a physical-phone or Internet-speed benchmark.', results, summary }, null, 2));
  console.log(JSON.stringify(summary));
} finally { await browser.close(); server.close(); }
