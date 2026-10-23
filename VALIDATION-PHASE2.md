# Phase 2 validation

Verified on 2026-10-23 with Node.js 24.17.0, npm 11.13.0, Three.js 0.186.1 and Vite 8.3.5. Upgrade base: `24e0c8e4bd1d1b59baece745ef358825ed2eb313`. Historical visual comparisons remain in `VALIDATION-PHASE1.5.md` and `VISUAL-REPORT.json`.

## Automated checks

`npm test`: **92 tests passed, zero failed**. This includes all 62 earlier tests and 30 Phase 2 checks.

- Player movement retains camera-relative axes, normalized diagonals, walking/sprinting speeds, gravity, grounded jumps, wall sliding, corner containment, rooftop landing, open courtyards, shoreline blocking, bridge ramps and reset. New tests check bounded acceleration/deceleration, turning, all five animation states, landing compression and pose reset.
- The original electric cargo model has exactly one front and two rear wheels, an open rear platform and exposed cycle frame. Its approximately 1.50 m width, 3.44 m length and 1.55 m height fit the conservative collision footprint. It uses five merged meshes and 4,272 triangles.
- Vehicle tests cover progressive acceleration, 28.8 km/h maximum forward speed, 9 km/h reverse, coasting, held braking, braking before reverse, limited steering rate, correct reverse steering, wheel/front-fork animation, bounded tilt and 30/60 Hz integration agreement.
- Full-footprint displacement substeps stop forward/reverse travel at thin walls and protect rotating corners. Tests cover water, map bounds, courtyard holes, a synthetic bridge and the actual bent lake bridge, way `1317423268`. The real-map test drives slowly along its centre line, reaches the opposite shore without a collision and follows the 0.45 m deck elevation.
- Entering requires proximity, grounded feet, a stopped van and a clear route to its seat. Exiting checks a stopped van, clear land, a clear dismount path and pedestrian separation. A blocked exit leaves the player mounted. Tests reject interaction through thin walls and water strips. The parked van provides a separate on-foot collider without modifying static campus geometry.
- Camera tests check smooth walking/driving profile transitions and building obstruction. E is one-shot; Space braking remains held. Pause/focus clears interaction and controls.
- Navigation splits real mapped road/path junctions, excludes major highways, preserves known bridge elevation, rejects unsafe edges and adds no straight shortcuts through obstacles. All **1,072 accepted edges across 1,057 nodes** lie on mapped pavement and pass land/building/water checks. The graph has two components; students stay within their connected component.
- Twelve deterministic, initially separated students safely wander for a simulated minute in integration tests. Checks cover dead-end reversal, idle/walk behavior, van proximity yielding and three instanced visual batches with finite animated matrices. Turning vehicle corners cannot pass through pedestrians.
- Whole-simulation tests cover real-campus enter/drive/reverse/brake/exit, complete pause/inspection suspension, no resume catch-up, and reset from driving. Reset reuses the same single van and clears its parking position if a pedestrian has wandered there.
- All earlier OSM, road union/curb/decal, façade winding, source-only label, inspection, input, minimap and static collision regressions remain passing.

## Build and HTTP checks

`npm run build`: **passed**. `npm run build:pages`: **passed**. Final production assets are `index-oWEJ6gaH.js` (765,742 bytes, approximately 211 kB gzip) and `index-CZYvJa0i.css` (12,932 bytes). Vite reports its usual >500 kB bundle advisory because Three.js is bundled; there are no build errors. No runtime dependency was added.

Development HTTP checks returned **200** for the HTML, main module, all new simulation/vehicle/navigation/pedestrian modules and map. Production preview returned **200** for the HTML, exact hashed JavaScript/CSS, favicon and map. Their bytes match the production build, including the original map checksum. Generated `docs/` uses relative asset paths, includes `.nojekyll` and notices, and replaces obsolete hashed assets.

The release process separately verifies the GitHub Pages workflow and hosted HTML/assets/map. The delivered deployment report records the actual commit and result. HTTP delivery checks do not establish interactive playability.

## Map and collision integrity

The geographic source, projection, bounds, feature counts, footprints, holes, height estimates and `heightSource` are unchanged. Original source counts remain 3,260 nodes, 482 ways and 14 relations; selected features remain 189 buildings, 42 roads, 16 green areas, four water areas and one bridge. The new van and students are procedural game actors, not surveyed OSM features.

Raw map SHA-256 (770,269 bytes):

```text
8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9
```

Canonical geographic model SHA-256:

```text
f1ecf729f9bd2d41e663d9779420ee5f75df41bfd6bfbbac9ba3bc6071a57d61
```

Canonical static collision SHA-256, including winding (**3,600 triangles**):

```text
b95c22529398f30fd82c60571453cfcc198080818f92b707fce8a31470aea1be
```

The fixture in `tests/phase1-baseline.json` and current `PHASE2-REPORT.json` record these invariants. The parked van's temporary 24-triangle proxy is intentionally separate from the static world.

## Performance and implementation limits

Static campus rendering remains at 211 mesh batches and 113,842 triangles. The van adds five mesh batches; the twelve pedestrians collectively add three instanced batches and 5,040 triangles. NPCs reuse original student geometry and materials; there are no per-limb draw calls. Actor updates use a shared bounded 60 Hz simulation; camera, HUD, labels and rendering remain separate.

A reproducible 600-frame CPU sample in `scripts/report-phase2.mjs` took 103.57 ms total (0.173 ms mean per frame) on this machine. It includes idle player physics, twelve walking students, the parked van and actor animation/matrix updates. It excludes WebGL rendering, camera, labels and HUD and **is not an FPS measurement**. Scene batch counts also exclude actual shadow-pass draw calls.

The van uses upright semi-arcade kinematics rather than a full rigid-body engine: it cannot roll over, collide with dynamic crates or simulate tire slip. Water and buildings block its complete footprint; unblocked grass is drivable. Trees/curbs remain decorative. Pedestrian AI uses simple route wandering and proximity yielding, with no traffic rules, conversation or player-body collision. Narrow bridge traversal needs careful low-speed alignment. These are deliberate limits of this milestone.

## Browser verification limits

Browser control reports **“Local browser use is disabled in Work settings.”** No workaround was used. Current-release interactive visual play checks, console inspection, screenshots, real mouse/pointer-lock behavior, perceived animation/lighting quality and actual GPU FPS/draw-call measurements remain unverified. Automated geometry and simulation tests plus HTTP asset checks do not replace these checks.

Interactive review should cover Main Gate entry, driving and safe exits, NPC visibility/yielding, tight turns, the lake bridge, camera transitions, pause/inspection and color/readability at ordinary desktop resolution. No cars, motorcycles, combat, missions or police systems are included.
