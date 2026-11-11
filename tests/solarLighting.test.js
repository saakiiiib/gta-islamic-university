import test from 'node:test';
import assert from 'node:assert/strict';
import { campusSunPosition, campusLighting, LIGHTING_PRESETS, DEFAULT_LIGHTING_DATE, SOLAR_SOURCE_URL } from '../src/world/solarLighting.js';

const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} should be within ${tolerance} of ${expected}`);

test('Kushtia near-noon seasonal heights follow latitude and declination, with the sun to the south', () => {
  // At 23.722 degrees north, noon altitude is about 90 - latitude + declination.
  // June's maximum declination remains south of this campus latitude.
  for (const [date, expected] of [['2026-03-20T06:05:00Z', 66.1], ['2026-06-21T06:05:00Z', 89.7], ['2026-12-21T06:05:00Z', 42.8]]) {
    const result = campusSunPosition({ date }); near(result.altitude, expected, .4);
    assert.ok(result.direction.z > 0, 'near-noon sun lies south of campus, never north');
    assert.ok(result.direction.y > 0); assert.equal(result.aboveHorizon, true);
    assert.ok(result.azimuth > 90 && result.azimuth < 270);
    assert.equal(result.sourceUrl, SOLAR_SOURCE_URL); assert.match(result.method, /NOAA\/Meeus/);
    assert.equal(result.refractionApplied, false);
  }
});

test('morning is east, afternoon west, and astronomical night has a below-horizon solar direction', () => {
  const morning = campusSunPosition({ date: '2026-03-20T02:00:00Z' });
  const afternoon = campusSunPosition({ date: '2026-03-20T10:00:00Z' });
  assert.ok(morning.direction.x > 0); assert.ok(afternoon.direction.x < 0);
  assert.ok(morning.altitude > 0 && afternoon.altitude > 0);
  assert.ok(morning.azimuth > 0 && morning.azimuth < 180);
  assert.ok(afternoon.azimuth > 180 && afternoon.azimuth < 360);
  const midnight = campusSunPosition({ date: '2026-03-20T18:00:00Z' });
  assert.ok(midnight.altitude < -60); assert.ok(midnight.direction.y < 0); assert.equal(midnight.aboveHorizon, false);
  assert.equal(campusLighting({ date: midnight.date }).sun.intensity, 0);
});

test('UTC timestamps, explicit offsets, Date objects and epoch milliseconds identify the same immutable instant', () => {
  const date = new Date(DEFAULT_LIGHTING_DATE), before = date.getTime();
  const first = campusSunPosition({ date });
  assert.equal(date.getTime(), before);
  assert.deepEqual(campusSunPosition({ date: '2026-03-20T12:05:00+06:00' }), first);
  assert.deepEqual(campusSunPosition({ date: date.getTime() }), first);
  assert.deepEqual(campusSunPosition({ date: DEFAULT_LIGHTING_DATE }), first);
  const acrossMidnight = campusSunPosition({ date: '2026-03-21T01:00:00+06:00' });
  assert.deepEqual(acrossMidnight, campusSunPosition({ date: '2026-03-20T19:00:00Z' }));
});

test('unit vectors and azimuth use east/up/south axes, including polar and date-line inputs', () => {
  for (const latitude of [-90, -23.722, 0, 23.72220495, 90]) for (const longitude of [-180, -89, 0, 89.15084115, 180]) {
    const result = campusSunPosition({ date: DEFAULT_LIGHTING_DATE, latitude, longitude });
    const { x, y, z } = result.direction, a = result.azimuth * Math.PI / 180;
    near(Math.hypot(x, y, z), 1, 1e-12); near(y, Math.sin(result.altitude * Math.PI / 180), 1e-12);
    assert.ok([result.altitude, result.azimuth, x, y, z].every(Number.isFinite));
    assert.ok(result.altitude >= -90 && result.altitude <= 90); assert.ok(result.azimuth >= 0 && result.azimuth < 360);
    if (result.azimuthDefined) { near(x, Math.sin(a) * Math.hypot(x, z), 1e-12); near(z, -Math.cos(a) * Math.hypot(x, z), 1e-12); }
  }
  // The same instant is near noon at 89E and near midnight at the opposite longitude.
  const east = campusSunPosition({ date: DEFAULT_LIGHTING_DATE });
  const opposite = campusSunPosition({ date: DEFAULT_LIGHTING_DATE, longitude: 89.15084115 - 180 });
  assert.ok(east.altitude > 60 && opposite.altitude < -60);
});

test('fixed daytime art presets are deterministic, isolated and explicitly independent of weather', () => {
  const fixed = campusLighting(); assert.equal(fixed.solar.date, DEFAULT_LIGHTING_DATE); assert.equal(fixed.preset, 'hazy');
  assert.equal(fixed.appearanceStatus, 'artistic'); assert.match(fixed.appearanceReason, /not actual weather/);
  assert.deepEqual(fixed, campusLighting()); assert.ok(fixed.sun.intensity > 0);
  assert.equal(Object.isFrozen(LIGHTING_PRESETS.hazy.fog), true);
  for (const preset of ['clear', 'hazy', 'overcast']) {
    const config = campusLighting({ preset });
    assert.ok(config.fog.near > 0 && config.fog.far > config.fog.near);
    assert.ok(config.sun.intensity > 0 && config.hemisphere.intensity > 0);
    near(Math.hypot(...Object.values(config.sunOffset)), 150, 1e-10);
  }
  fixed.fog.near = 1; fixed.sun.intensity = 99; fixed.solar.direction.x = 99;
  assert.notEqual(campusLighting().fog.near, 1); assert.notEqual(LIGHTING_PRESETS.hazy.sun.intensity, 99);
  assert.notEqual(campusLighting().solar.direction.x, 99);
  assert.throws(() => campusLighting({ preset: 'rain-forecast' }), /preset/);
});

test('invalid coordinates and ambiguous, impossible or unsupported dates are rejected', () => {
  for (const latitude of [NaN, Infinity, -91, 91, '23.7', null]) assert.throws(() => campusSunPosition({ date: DEFAULT_LIGHTING_DATE, latitude }), /latitude/);
  for (const longitude of [NaN, Infinity, -181, 181, '89.1', null]) assert.throws(() => campusSunPosition({ date: DEFAULT_LIGHTING_DATE, longitude }), /longitude/);
  for (const date of [undefined, null, NaN, Infinity, new Date(NaN), '2026-03-20', '2026-03-20T06:05:00',
    '2026-02-30T06:05:00Z', '2026-13-01T06:05:00Z', '2026-03-20T24:00:00Z', '2026-03-20T06:05:60Z',
    '2026-03-20T06:05:00+25:00', '1799-12-31T00:00:00Z', '2101-01-01T00:00:00Z']) {
    assert.throws(() => campusSunPosition({ date }), /date/i);
  }
});
