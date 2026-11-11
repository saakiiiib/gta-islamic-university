const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const modulo = (value, period) => ((value % period) + period) % period;
const clamp = value => Math.max(-1, Math.min(1, value));
const CAMPUS_LATITUDE = 23.72220495, CAMPUS_LONGITUDE = 89.15084115;
export const DEFAULT_LIGHTING_DATE = '2026-03-20T06:05:00.000Z';
export const SOLAR_SOURCE_URL = 'https://gml.noaa.gov/grad/solcalc/calcdetails.html';

function absoluteDate(input) {
  if (typeof input === 'string') {
    // Require a timezone: parsing a device-local date would change the same scene
    // between computers. Validate the calendar before Date can normalize it.
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(input);
    if (!match) throw new RangeError('Solar date must identify an absolute ISO timestamp with timezone');
    const [, year, month, day, hour, minute, second = '0', , zone] = match;
    const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    if (+month < 1 || +month > 12 || +day < 1 || +day > days || +hour > 23 || +minute > 59 || +second > 59 ||
      (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) {
      throw new RangeError('Solar date contains invalid calendar or clock values');
    }
  } else if (!(input instanceof Date) && typeof input !== 'number') {
    throw new TypeError('Solar date must be a Date, epoch milliseconds or timezone-qualified ISO timestamp');
  }
  const date = new Date(input instanceof Date ? input.getTime() : input);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1800 || date.getUTCFullYear() > 2100) {
    throw new RangeError('Solar date must be finite and within the supported 1800–2100 approximation range');
  }
  return date;
}

/**
 * NOAA/Meeus solar approximation, evaluated entirely from the requested UTC
 * instant. Angles are degrees; azimuth is clockwise from geographic north.
 * Direction points TOWARD the sun in the map's east/up/south (+X/+Y/+Z) basis.
 * Altitude is geometric solar-center elevation, without refraction/parallax.
 * NOAA source equations: https://gml.noaa.gov/grad/solcalc/main.js
 */
export function campusSunPosition({ date, latitude = CAMPUS_LATITUDE, longitude = CAMPUS_LONGITUDE } = {}) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError('Solar latitude must be finite and within -90..90 degrees');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError('Solar longitude must be finite and within -180..180 degrees east');
  const instant = absoluteDate(date);
  const julianDay = instant.getTime() / 86400000 + 2440587.5;
  const t = (julianDay - 2451545) / 36525;
  const meanLongitude = modulo(280.46646 + t * (36000.76983 + .0003032 * t), 360) * RAD;
  const anomaly = (357.52911 + t * (35999.05029 - .0001537 * t)) * RAD;
  const eccentricity = .016708634 - t * (.000042037 + .0000001267 * t);
  const center = Math.sin(anomaly) * (1.914602 - t * (.004817 + .000014 * t)) +
    Math.sin(2 * anomaly) * (.019993 - .000101 * t) + .000289 * Math.sin(3 * anomaly);
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = meanLongitude + (center - .00569 - .00478 * Math.sin(omega)) * RAD;
  const obliquitySeconds = 21.448 - t * (46.815 + t * (.00059 - .001813 * t));
  const obliquity = (23 + (26 + obliquitySeconds / 60) / 60 + .00256 * Math.cos(omega)) * RAD;
  const declination = Math.asin(clamp(Math.sin(obliquity) * Math.sin(apparentLongitude)));
  const y = Math.tan(obliquity / 2) ** 2;
  const equationOfTimeMinutes = 4 * DEG * (y * Math.sin(2 * meanLongitude) - 2 * eccentricity * Math.sin(anomaly) +
    4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * meanLongitude) -
    .5 * y * y * Math.sin(4 * meanLongitude) - 1.25 * eccentricity ** 2 * Math.sin(2 * anomaly));
  const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes() +
    instant.getUTCSeconds() / 60 + instant.getUTCMilliseconds() / 60000;
  const solarMinutes = modulo(utcMinutes + equationOfTimeMinutes + 4 * longitude, 1440);
  const hourAngle = (solarMinutes / 4 - 180) * RAD, lat = latitude * RAD;
  // Direct vector rotation avoids division by cos(latitude) at the poles and
  // avoids using a guessed hemisphere sign for the noon azimuth.
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const up = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const south = Math.sin(lat) * Math.cos(declination) * Math.cos(hourAngle) - Math.cos(lat) * Math.sin(declination);
  const length = Math.hypot(east, up, south);
  const direction = { x: east / length, y: up / length, z: south / length };
  const azimuthDefined = Math.hypot(east, south) > 1e-12;
  const altitude = Math.asin(clamp(direction.y)) * DEG;
  const azimuth = azimuthDefined ? modulo(Math.atan2(east, -south) * DEG, 360) : 0;
  return { direction, altitude, azimuth, angleUnits: 'degrees', azimuthDefined,
    aboveHorizon: altitude > 0, date: instant.toISOString(), latitude, longitude,
    declinationDegrees: declination * DEG, hourAngleDegrees: hourAngle * DEG, equationOfTimeMinutes,
    method: 'NOAA/Meeus approximation; geometric solar center without atmospheric refraction',
    sourceUrl: SOLAR_SOURCE_URL, refractionApplied: false };
}

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Named daytime art directions, not observations, forecasts or climatology.
export const LIGHTING_PRESETS = freeze({
  clear: { skyColor: 0xb3d5e6, sun: { color: 0xfff1dc, intensity: 2.15 },
    hemisphere: { skyColor: 0xe4edf2, groundColor: 0x829272, intensity: 1.6 },
    fog: { color: 0xb3d5e6, near: 300, far: 1000 } },
  hazy: { skyColor: 0xc5d2d5, sun: { color: 0xffead1, intensity: 1.8 },
    hemisphere: { skyColor: 0xe6e8e1, groundColor: 0x8c9278, intensity: 1.7 },
    fog: { color: 0xc5d2d5, near: 260, far: 850 } },
  overcast: { skyColor: 0xc7cdcc, sun: { color: 0xf2f0e9, intensity: .55 },
    hemisphere: { skyColor: 0xe2e4e0, groundColor: 0x8b927f, intensity: 1.9 },
    fog: { color: 0xc7cdcc, near: 220, far: 700 } },
});

/** Deterministic render configuration; returned colors/intensities/fog are art choices. */
export function campusLighting({ date = DEFAULT_LIGHTING_DATE, latitude = CAMPUS_LATITUDE,
  longitude = CAMPUS_LONGITUDE, preset = 'hazy' } = {}) {
  if (!Object.hasOwn(LIGHTING_PRESETS, preset)) throw new RangeError('Unknown lighting preset; choose clear, hazy or overcast');
  const palette = structuredClone(LIGHTING_PRESETS[preset]);
  const solar = campusSunPosition({ date, latitude, longitude });
  // Daytime ambient palettes do not implement a night/weather simulation. A sun
  // below the geometric horizon must nevertheless stop contributing direct light.
  palette.sun.intensity = solar.aboveHorizon ? palette.sun.intensity : 0;
  const sunOffset = Object.fromEntries(Object.entries(solar.direction).map(([axis, value]) => [axis, value * 150]));
  return { ...palette, solar, sunOffset, preset, appearanceStatus: 'artistic',
    appearanceReason: 'Fixed representative date and named daytime palette; not actual weather or measured campus climatology.' };
}
