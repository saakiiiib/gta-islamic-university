# Milestone 01 validation

Verified on 2026-10-23 using Node.js 24.17.0, npm 11.13.0, Three.js 0.186.1 and Vite 8.3.5.

## Automated checks

`npm test`: **42 tests passed, zero failed**.

- OSM string IDs, node references and tags; exact expected source and selected-feature counts.
- Metre projection, east/north orientation, 100 m context and preservation of the northern campus boundary.
- Concave footprints, building relation deduplication, auditorium inclusion and the two documented courtyard repairs.
- Long road/canal clipping, joined road buffers, building-height estimates and the bridge without a highway tag.
- Camera-relative movement, normalized diagonals, sprint speed, grounded jumping, gravity and fixed-step consistency.
- Wall sliding, corner containment, rooftop landing, open courtyards, shoreline blocking, water holes, bridge ramps, boundaries and reset.
- Camera obstruction, student proportions and animation, input enabling, one-shot actions, pause clearing, pointer-lock fallback and arrow-key orbit.
- North-up minimap scale and location lookup.
- Actual map integration: Main Gate spawn and movement, crossing the mapped lake bridge from shore to shore, adjacent lake blocking and ground-level access to the repaired courtyard.

`npm run build`: **passed**. Vite reports its normal size advisory for the approximately 716 kB minified application/Three.js bundle (approximately 193 kB gzip). This is an advisory, not a build error. No external runtime CDN or paid service is needed.

## Browser checks

The local development build was rendered in the app's browser. Verified loading/start, character visibility, walking, sprinting, jumping, pause, location/coordinate HUD, and the north-up minimap. A walking check moved from the Main Gate position to approximately (278.48, 0, -67.11) m. A separate sprint reached approximately (273.58, 0, -72.50) m. The jump reported Y=0.48 m and grounded=false. Escape opened the pause screen.

The observed view reported approximately 60 FPS, 157 draw calls and 21,313 visible triangles; this is a single local observation, not a cross-device performance guarantee. No console warnings or errors appeared during that check. Pointer lock was unavailable in the app browser; the game displayed its alternative look controls.

Browser controls were subsequently disabled in Work settings. Final interactive production-preview, resume/reset, right-drag/arrow orbit and resize checks could not be completed after that change. The corresponding input/physics/camera functions are covered by automated tests. No physical phone or other hardware/browser matrix was tested.

## Production files and source integrity

The local production server returned HTTP 200 for the HTML, JavaScript, CSS, favicon and `data/map.osm`. The map response contains 770,269 bytes. The original, bundled source and production map copies share SHA-256:

```text
8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9
```

`MAP-REPORT.json` records bounds, origin, spawn, feature counts, height sources, warnings and repairs. The source ZIP includes source files, lockfile, unchanged map, notices, tests and `dist/`, and excludes `node_modules`. No public deployment was performed.

Temporary local QA servers were stopped after validation. Follow README.md to start the game locally.
