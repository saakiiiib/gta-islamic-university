# GTA Islamic University — Phase 1.5

A playable third-person browser prototype of Islamic University, Kushtia, Bangladesh. The campus layout is generated from the supplied `map.osm`, using Three.js, JavaScript ES modules and Vite. All game data is bundled locally; gameplay makes no requests to Google Maps, map-tile services, paid APIs, or a backend.

## Run locally

Use Node.js **22.12+ or 24+** with npm. Open a terminal in this project folder:

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite (normally `http://127.0.0.1:5173/`), then select **STEP INTO CAMPUS**. Use a desktop browser with WebGL 2 and hardware acceleration. The first map load builds collision geometry and may take a few seconds.

The production build is already included in `dist/`. To rebuild and test it:

```sh
npm test
npm run build
npm run preview
```

Preview normally runs at `http://127.0.0.1:4173/`. JavaScript modules and the map must be served over HTTP; opening `index.html` or `dist/index.html` by double-clicking will not work. `npm ci` can replace `npm install` for an exact lockfile-based installation.

## Controls

| Control | Action |
| --- | --- |
| W / A / S / D | Move relative to the camera |
| Shift + movement | Sprint |
| Space | Jump while grounded |
| Mouse | Orbit camera when pointer lock is available |
| Right mouse + drag | Orbit without pointer lock |
| Arrow keys | Alternative camera orbit |
| Escape | Pause / resume |
| R | Reset to Main Gate |
| L | Toggle nearby place labels (on by default) |
| I | Enter / leave the paused campus inspection camera |
| G | Toggle cyan OSM roads / amber building footprints |
| F3 | Toggle position, frame rate and map diagnostics |

Switching tabs or losing focus pauses movement. Returning requires Resume or Escape. Pointer lock is requested only when you start or resume; if unavailable, use right-drag or the arrow keys. The game starts at mapped node `9027931167`, about 21 metres inside Main Gate, looking northwest.

The visible **Place labels**, **Inspect campus** and **Map alignment** buttons provide the same actions as L, I and G. Labels use actual OSM names or named entrance refs. At most six nearby labels appear within 300 m, with distance fading, building occlusion checks and overlap rejection.

**Inspection:** the student and physics freeze in place, held controls clear, and pointer lock releases. A separate elevated camera initially fits the complete campus. Left mouse drag or arrow keys orbit, right mouse drag or WASD pan, and the wheel zooms. Up to 18 place labels may appear. Fog is disabled for inspection. **I or Escape** returns to the previous student camera and position. Losing focus pauses inspection; Resume keeps its viewpoint. No simulation time accumulates while paused or inspecting.

## What is included

- Campus bounding box plus 100 metres on each side: approximately **1,086 × 1,392 m**.
- **189 building footprints**, **42 road/path features**, **16 mapped green/pitch areas**, a lake, two ponds and a canal; the mapped tree and tree row.
- Actual concave building outlines and courtyard holes; the auditorium relation and lake bridge are included.
- Original animated 1.75 m student; walking at 3.8 m/s, sprinting at 7.5 m/s, grounded jumping and gravity.
- Capsule-versus-triangle collision, wall sliding, roofs, courtyard access, shoreline blocking, bridge ramps and bounded map movement.
- Six-metre chase camera with obstruction checks, sunlight, nearby shadows, fog, a north-up minimap, location HUD, loading screen and pause screen.
- Dark asphalt joined across ways; warm walking surfaces, interrupted visual curbs, pale edge bands and restrained trunk/tertiary dashes.
- Six building-use material families, shaded window recess effects, foundation and roof bands, corner accents and illustrative entries.
- Source-name labels, an elevated inspection camera and an optional map-alignment overlay including courtyard outlines.
- Deterministic planting inside mapped green polygons: 240 added trees and 48 low shrubs in this extract, without collision volumes.

The project has no vehicles, NPCs, combat, missions, interiors, multiplayer or mobile touch controls in this milestone. It is an original prototype inspired by the era of third-person open-world games; it contains no GTA game assets, music, logos or code. It is not affiliated with Rockstar Games or the university.

## Map accuracy and estimates

`public/data/map.osm` is an unchanged copy of the supplied export. No fictional road or building layout is added. The file includes distant complete road nodes and incomplete administrative relations; the importer clips relevant roads and surfaces to the selected context and ignores administrative boundaries. Complete buildings intersecting the boundary remain intact.

The local origin is **23.72220495° N, 89.15084115° E**. One Three.js unit is one metre. X points east, Y up, Z south. Coordinates use a local equirectangular projection with radius 6,378,137 m and longitude scaled by cosine of the origin latitude. Rendering, collisions and minimap use the same model.

Building heights use `height`, then `building:levels × 3.2 m`, then an estimated use-based height: academic 9.6 m, dormitory/apartment 12.8 m, house 6.4 m, shed 3.2 m, other 9.6 m. The supplied file has no measured heights and only two level tags (one inside the selected context). Phase 1.5 retains every Phase 1 height and `heightSource`. Material classification is independent of height estimation: OSM use tags take priority, verified names fill gaps, and worship takes precedence over “Hall.” Most buildings lack a mapped use and retain the unclassified family.

Façade windows, recess effects, foundations, floor bands, corner accents, colours and roof edging are illustrative. No precise architectural reconstruction is claimed. Five surveyed entrance nodes are retained, including named campus gates; none lies on a building wall in this extract. 188 buildings receive a restrained, nonfunctional entry treatment on a road-facing outer wall. These are illustrative entries, not surveyed doors, and do not open interiors. The renderer uses surveyed building-door nodes if a future source supplies them.

Estimated road widths are service/unclassified 6 m, path 2.2 m, tertiary 8 m and trunk 7 m; tagged widths would take precedence. The canal width is estimated at 3 m. The lake footbridge is estimated at 2.2 m wide and 0.45 m above ground, with four-metre ramps. `layer=1` alone does not create an elevated road.

No elevation data is supplied. Terrain is flat; grass colour outside mapped green areas is a ground approximation. Mapped gardens, park, pitches, forests and orchards retain their polygon boundaries. The mapped tree point and tree row remain. Additional decorative planting is deterministic and restricted to eligible mapped green interiors, with road, bridge, building, courtyard, water and pitch exclusion zones. Caps are 240 additional trees and 160 shrubs. Planting is illustrative and has no colliders.

Road centre lines and estimated pavement widths are unchanged. Visible vehicle surfaces are unioned across ways; overlapping walking pavement is subtracted. Edge bands and 13 cm visual curbs lie outside the pavement and stop at junctions, walking connections and bridge approaches. They exclude mapped buildings and water. Markings occur only on trunk/tertiary roads and stop at vehicle intersections. Bridge deck triangles, ramps and elevations are unchanged; pavement meets their square endpoints. Explicit elevations and polygon offset separate visual surfaces. No road edges or vegetation change movement collisions.

One malformed source relation contains only two courtyard inner rings. The importer attaches ways `1317423250` and `1317423251` from relation `18079383` to their unique enclosing Arts Building relation `18079382`, records both repairs in diagnostics, and leaves the raw map unchanged. Seven valid building multipolygons preserve their courtyards and deduplicate outer ways. The auditorium (`7650711`) uses an otherwise untagged outer, and the bridge (`1317423268`) has no highway tag; both are handled explicitly.

## Code organization

- `src/map/`: XML parsing, projection, relation assembly, clipping, buffers and normalized feature data.
- `src/world/`: surfaces, footprint extrusion, road unions/curbs, use palettes, façades, vegetation, spatial batches and bridge decks.
- `src/player/`: student, capsule collisions, movement, input, chase camera and separate inspection camera/session.
- `src/ui/`: Canvas minimap, source-name label layout, location lookup and HUD.
- `src/main.js`: loading, scene setup, state transitions and fixed 60 Hz loop.
- `src/config.js`: origin, context extent and movement constants.
- `tests/`: source-map tests, geometry tests, movement tests and real-map integration checks.

Static geometry is grouped into approximately 150-metre spatial batches. The renderer caps pixel ratio at 1.5, uses local shadows and fog, and renders the minimap from a cached map image. F3 reports actual frame statistics. The simulation caps catch-up and substeps fast movement to avoid crossing walls between updates.

Building colours are baked into vertex attributes, so roof/wall families share a material and collision mesh. Window details are merged, and trunks/crowns/shrubs share one instanced mesh. Labels reuse 18 DOM elements and select/layout at 10 Hz. Gameplay uses neutral blue-grey fog at 350–1,600 m, a 2,200 m far plane, exposure 0.95, hemisphere intensity 1.4 and warm sun intensity 2.0. Inspection uses a 3,500 m far plane. See `VISUAL-REPORT.json` and `VALIDATION.md` for CPU counts and performance verification limits.

If you replace the map with another export, it must include the configured university boundary and spawn node. Rebuild after editing assets under `public/`. Missing, empty or malformed data is reported on the loading screen.

## Build and hosting

The output is a static Vite site. `base: './'` supports a nested hosting path such as `https://saakiiiib.github.io/gta-islamic-university/`.

For GitHub Pages, run `npm run build:pages`, commit the generated `docs/` together with the source, and push `main`. In repository **Settings → Pages**, select **Deploy from a branch**, **main**, and **/docs**. The generated output includes the map, assets, favicon, notices, and `.nojekyll`; no server or API key is required. Run `npm run build:pages` again after future source or map changes before committing.

Alternatively, upload **the contents of `dist/`**, including `data/`, `assets/`, and the favicon, to another static host.

See [DATA-CREDITS.md](./DATA-CREDITS.md) for OpenStreetMap attribution and [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for dependency licenses. The prototype visibly credits **© OpenStreetMap contributors** with its ODbL link.

## Validation

`npm test` passes all 42 original tests plus 20 Phase 1.5 tests. `tests/phase1-baseline.json` was captured before the visual changes at commit `a4efab4`; regression tests compare the unchanged raw-map checksum, canonical feature model and all 3,600 collision triangles, including winding. Tests also cover road joins, curb openings, bridge approaches, façade normals, classification, source labels, entrances, planting exclusions, inspection transitions, focus loss, delayed pointer lock and label layout.

Browser automation is disabled in the current Work settings. Current-release visual play checks and actual 60 FPS / WebGL draw-call measurements could not be performed. Matched CPU frustum comparisons are recorded separately and are not GPU benchmarks. The ZIP includes source, lockfile, map, tests, notices, `dist/` and generated `docs/`, excluding `node_modules`.
