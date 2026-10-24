const MOBILE_AGENT = /Android|iPhone|iPad|iPod/i;

/** A narrow desktop window is still a desktop. iPads may identify as macOS. */
export function isMobileTouchDevice(host = globalThis) {
  const nav = host.navigator ?? {};
  const points = Number(nav.maxTouchPoints ?? 0);
  const query = value => { try { return !!host.matchMedia?.(value).matches; } catch { return false; } };
  const coarse = query('(pointer: coarse)');
  const fine = query('(any-pointer: fine)');
  const mobileAgent = nav.userAgentData?.mobile === true || MOBILE_AGENT.test(nav.userAgent ?? '');
  const ipad = nav.platform === 'MacIntel' && points > 1;
  return (points > 0 || coarse) && (mobileAgent || ipad || coarse && !fine);
}

export function deviceProfile(host = globalThis) {
  // Explicit QA override previews the touch layout on a desktop without changing its default.
  const preview = new URLSearchParams(host.location?.search ?? '').get('touch') === '1';
  const touch = preview || isMobileTouchDevice(host);
  return Object.freeze({ touch, preview, maxDPR: touch ? 1.25 : 1.5,
    maxPixels: touch ? 800_000 : Infinity, antialias: !touch,
    shadowSize: touch ? 1024 : 2048, shadowExtent: touch ? 44 : 58,
    shadowInterval: touch ? 1 / 30 : 0 });
}

export function renderPixelRatio(profile, width, height, deviceDPR = 1) {
  const ratio = Number.isFinite(deviceDPR) && deviceDPR > 0 ? deviceDPR : 1;
  const area = Math.max(1, width) * Math.max(1, height);
  return Math.min(ratio, profile.maxDPR, Math.sqrt(profile.maxPixels / area));
}
