# GTA Islamic University — first playable milestone

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
| F3 | Toggle position, frame rate and map diagnostics |

Switching tabs or losing focus pauses movement. Returning requires Resume or Escape. Pointer lock is requested only when you start or resume; if unavailable, use right-drag or the arrow keys. The game starts at mapped node `9027931167`, about 21 metres inside Main Gate, looking northwest.

## What is included

- Campus bounding box plus 100 metres on each side: approximately **1,086 × 1,392 m**.
- **189 building footprints**, **42 road/path features**, **16 mapped green/pitch areas**, a lake, two ponds and a canal; the mapped tree and tree row.
- Actual concave building outlines and courtyard holes; the auditorium relation and lake bridge are included.
- Original animated 1.75 m student; walking at 3.8 m/s, sprinting at 7.5 m/s, grounded jumping and gravity.
- Capsule-versus-triangle collision, wall sliding, roofs, courtyard access, shoreline blocking, bridge ramps and bounded map movement.
- Six-metre chase camera with obstruction checks, sunlight, nearby shadows, fog, a north-up minimap, location HUD, loading screen and pause screen.

The project has no vehicles, NPCs, combat, missions, interiors, multiplayer or mobile touch controls in this milestone. It is an original prototype inspired by the era of third-person open-world games; it contains no GTA game assets, music, logos or code. It is not affiliated with Rockstar Games or the university.

## Map accuracy and estimates

`public/data/map.osm` is an unchanged copy of the supplied export. No fictional road or building layout is added. The file includes distant complete road nodes and incomplete administrative relations; the importer clips relevant roads and surfaces to the selected context and ignores administrative boundaries. Complete buildings intersecting the boundary remain intact.

The local origin is **23.72220495° N, 89.15084115° E**. One Three.js unit is one metre. X points east, Y up, Z south. Coordinates use a local equirectangular projection with radius 6,378,137 m and longitude scaled by cosine of the origin latitude. Rendering, collisions and minimap use the same model.

Building heights use `height`, then `building:levels × 3.2 m`, then an estimated use-based height: academic 9.6 m, dormitory/apartment 12.8 m, house 6.4 m, shed 3.2 m, other 9.6 m. The supplied file has no measured heights and only two level tags. Façade windows, floor bands and colours are illustrative.

Estimated road widths are service/unclassified 6 m, path 2.2 m, tertiary 8 m and trunk 7 m; tagged widths would take precedence. The canal width is estimated at 3 m. The lake footbridge is estimated at 2.2 m wide and 0.45 m above ground, with four-metre ramps. `layer=1` alone does not create an elevated road.

No elevation data is supplied. Terrain is flat; grass colour outside mapped green areas is a ground approximation. Mapped gardens, park, pitches, forests and orchards retain their polygon boundaries. Trees are placed only at the mapped point and along the mapped tree row; the file does not survey every campus tree. Unmapped campus details are absent.

One malformed source relation contains only two courtyard inner rings. The importer attaches ways `1317423250` and `1317423251` from relation `18079383` to their unique enclosing Arts Building relation `18079382`, records both repairs in diagnostics, and leaves the raw map unchanged. Seven valid building multipolygons preserve their courtyards and deduplicate outer ways. The auditorium (`7650711`) uses an otherwise untagged outer, and the bridge (`1317423268`) has no highway tag; both are handled explicitly.

## Code organization

- `src/map/`: XML parsing, projection, relation assembly, clipping, buffers and normalized feature data.
- `src/world/`: surfaces, footprint extrusion, façades, spatial mesh batches and bridge decks.
- `src/player/`: original student, capsule collisions, movement, input and chase camera.
- `src/ui/`: Canvas minimap, location lookup and HUD.
- `src/main.js`: loading, scene setup, state transitions and fixed 60 Hz loop.
- `src/config.js`: origin, context extent and movement constants.
- `tests/`: source-map tests, geometry tests, movement tests and real-map integration checks.

Static geometry is grouped into approximately 150-metre spatial batches. The renderer caps pixel ratio at 1.5, uses local shadows and fog, and renders the minimap from a cached map image. F3 reports actual frame statistics. The simulation caps catch-up and substeps fast movement to avoid crossing walls between updates.

If you replace the map with another export, it must include the configured university boundary and spawn node. Rebuild after editing assets under `public/`. Missing, empty or malformed data is reported on the loading screen.

## Build and hosting

The output is a static Vite site. `base: './'` supports a nested hosting path such as `https://saakiiiib.github.io/gta-islamic-university/`.

For GitHub Pages, run `npm run build:pages`, commit the generated `docs/` together with the source, and push `main`. In repository **Settings → Pages**, select **Deploy from a branch**, **main**, and **/docs**. The generated output includes the map, assets, favicon, notices, and `.nojekyll`; no server or API key is required. Run `npm run build:pages` again after future source or map changes before committing.

Alternatively, upload **the contents of `dist/`**, including `data/`, `assets/`, and the favicon, to another static host.

See [DATA-CREDITS.md](./DATA-CREDITS.md) for OpenStreetMap attribution and [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for dependency licenses. The prototype visibly credits **© OpenStreetMap contributors** with its ODbL link.
