# Kushtia lighting and validation

Task 20 uses the campus origin (23.72220495 N, 89.15084115 E) and the [NOAA/Meeus calculation method](https://gml.noaa.gov/grad/solcalc/calcdetails.html) for a deterministic geometric solar direction. The direction uses map axes +X east, +Y up, +Z south and stays relative to the existing tracked light target. No network, device-local clock or actual weather is used. The NOAA calculator is no longer actively maintained; this is a recreational approximation, not an astronomical measurement.

The Sky control selects March20, June21 or December21 in2026 at12:05 Asia/Dhaka (06:05UTC), and a clear, hazy or overcast art palette. Geometric sun altitudes at these fixed instants are approximately66.094,89.713 and42.833 degrees. Near-noon sun is south of the campus, almost overhead in June. Colors, intensities and fog are explicitly artistic daytime settings; overcast is a lighting cue, not a simulated cloud/weather forecast. The [historical cloudy campus image](https://commons.wikimedia.org/wiki/File:Cloudy_sky_at_islamic_university_kushtia_.jpg) remains a reference rather than a permanent sky claim.

Preparation now fingerprints nested landmark modules and src/config.js as well as data/map/world/navigation/activity/vehicle code. Tests establish that nested geometry, evidence and generator edits invalidate the fingerprint. Runtime still verifies exact map identity and packet payload integrity and falls back to source generators on failure. The source OSM hash remains8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9.

Final review also fixes two concrete issues: a bridge with a service-road tag retains its existing2.2m fallback unless explicit width evidence wins; world/scenery disposal releases instanced GPU buffers once, including canopy, furniture and aquatic plants. These changes preserve current source dimensions and geometry. Dedicated tests cover the alternative bridge tag and repeated teardown.

## Repeatable visual review remains pending

[Fixed review poses](evidence/realism-review-views.json) specify gate, mosque, library, Saddam Hall and Shahid Anas Hall cameras, target, FOV, scene date and viewports1440x900/393x852. Apply each fixed eye/target with its FOV and the selected viewport aspect; the gate pose is the existing menu camera's16:9 fit. These are defined comparison poses, not completed captures or surveyed photo-camera positions.

Browser automation was unavailable during the November7 work. A November9 native Chrome attempt reached a computer-control approval timeout before the game could be opened. No claim of interactive desktop/mobile gameplay, rendering correctness, font legibility, FPS or screenshot comparisons follows from CPU tests/builds. Those acceptance items remain pending with an available browser. Review gate/player and van clearance, bridge traversal, mosque silhouette, courtyard openings, hall labels/search, mobile toolbar overlap and all season/sky combinations. Capture renderer draw/triangle/texture counters after assets load, steady-state frame times and device/viewport settings for both desktop and mobile.

## Recorded budgets and checks

The [CPU inventory](evidence/realism-budget.json), reproducible with `node scripts/audit-campus-budget.mjs`, contains the current57-building/40-road/3-waterbody world before asset loading. It is not a GPU benchmark: draw candidates exclude frustum culling, shadow passes, loaded textures and dynamic characters/traffic.

| Metric | Before task20 (task19 snapshot) | After task20 |
|---|---:|---:|
| Visible render-object/draw candidates |382|382|
| Instanced meshes / instances |36 /696|36 /696|
| Triangle candidates including instances |232372|232372|
| Distinct array-buffer bytes, including colliders/debug |28890736|28890736|
| New reference images, models/textures loaded at runtime by task20 |0|0|

The earlier Phase1 browser report (157draws/21313triangles/60FPS, viewport unrecorded) uses a different scene/state and cannot serve as a controlled before/after benchmark. A full pre-realism baseline comparison remains pending. The same-map legacy/current vegetation comparison is240+48 versus300+65; aquatic art is241 instances/two opaque draws, mosque and auditorium one additional merged mesh each. No further image/font dependencies were added for lighting/search. Existing runtime asset-budget tests remain in the suite.

Fresh `npm ci` passed with 0 vulnerabilities; standard preparation and `npm run build` passed on November9 and again on November11 after the final configuration-fingerprint review. The full final local suite passed **322 tests, 0 failures, 0 skipped** in 163.94 seconds. This corrects the earlier progress message's 311 count. Production output is approximately1138.00kB main JS (306.06kB gzip),1707.66kB prepared JSON (555.55kB gzip), and a2.29kB extra UI stylesheet. The pre-existing warning above500kB remains. Tests establish source/collision/route logic and disposal behavior; interactive/performance acceptance is still pending.
