import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceProfile, isMobileTouchDevice, renderPixelRatio } from '../src/platform/device.js';

function host({ ua = 'Desktop', points = 0, coarse = false, fine = true, platform = '', search = '' } = {}) {
  return { navigator: { userAgent: ua, maxTouchPoints: points, platform }, location: { search },
    matchMedia: query => ({ matches: query === '(pointer: coarse)' ? coarse : fine }) };
}

test('Android, iPhone and desktop-mode iPad get touch controls', () => {
  for (const device of [host({ ua: 'Android', points: 5, coarse: true }),
    host({ ua: 'iPhone', points: 5, coarse: true }),
    host({ ua: 'Macintosh', platform: 'MacIntel', points: 5 })]) assert.equal(isMobileTouchDevice(device), true);
});

test('small desktop windows and fine-pointer touch laptops retain desktop defaults', () => {
  assert.equal(deviceProfile(host()).touch, false);
  assert.equal(isMobileTouchDevice(host({ points: 10, fine: true })), false);
  assert.equal(isMobileTouchDevice(host({ points: 5, coarse: true, fine: false })), true);
});

test('explicit touch preview enables QA without changing desktop defaults', () => {
  assert.equal(deviceProfile(host({ search: '?touch=1' })).touch, true);
  assert.equal(deviceProfile(host({ search: '?touch=0' })).touch, false);
  assert.equal(deviceProfile(host({ ua: 'iPhone', points: 5, search: '?touch=0' })).touch, true);
});

test('mobile GPU profile limits resolution, shadow cost and antialiasing without changing actors', () => {
  const profile = deviceProfile(host({ ua: 'Android', points: 5 }));
  assert.equal(profile.antialias, false);
  assert.equal(profile.shadowSize, 1024);
  assert.equal(profile.shadowInterval, 1 / 30);
  assert.equal(renderPixelRatio(profile, 844, 390, 3), 1.25);
  const ratio = renderPixelRatio(profile, 1366, 1024, 3);
  assert.ok(1366 * 1024 * ratio * ratio <= 800_000.001);
  assert.equal(renderPixelRatio(profile, 390, 844, 1), 1);
  const desktop = deviceProfile(host());
  assert.equal(desktop.antialias, true);
  assert.equal(desktop.shadowSize, 2048);
  assert.equal(renderPixelRatio(desktop, 1920, 1080, 3), 1.5);
});
