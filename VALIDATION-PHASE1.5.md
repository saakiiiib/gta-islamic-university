# Phase 1.5 validation

Verified on 2026-10-23 with Node.js 24.17.0, npm 11.13.0, Three.js 0.186.1 and Vite 8.3.5.

## Automated checks

`npm test`: **62 tests passed, zero failed**, including all 42 Phase 1 tests and 20 added checks.

- Unchanged map bytes, source/selected counts, projection, bounds, footprints, courtyard holes, heights and `heightSource`.
- Canonical collision positions and triangle winding match the pre-change baseline: **3,600 triangles**. Decorative façades, road edges and planting add no colliders.
- Movement, normalized diagonal speed, sprint, jump/landing, gravity, fixed stepping, wall/corner containment, rooftop landing, courtyard access, shoreline blocking, real bridge traversal, reset and camera obstruction remain passing.
- Road unions retain junction connectivity; walking and vehicle pavement no longer overlap. Curbs open at junctions, walking links and bridge approaches, exclude buildings/water, and avoid walking pavement. Paint belongs only to trunk/tertiary roads, skips vehicle junctions and sits above pavement.
- Bridge pavement cuts match its square deck ends, preventing artificial gaps from round buffer caps.
- Façade normals face outward for both outer-ring winding directions and both courtyard-ring directions.
- Material classification respects source tags, with worship before “Hall.” Heights are independent and unchanged.
- Labels use actual source names/entrance refs, deduplicate nearby identical names while retaining source IDs, and anchor inside buildings rather than courtyard holes. Synthetic “Lake footbridge” is excluded.
- Surveyed entrance coordinates/tags survive normalization; renderer prefers building entries and otherwise chooses a road-facing outer wall.
- Decorative planting is deterministic, observes exclusion zones and stays within its caps.
- Inspection clears input, releases pointer lock without pausing, preserves student capsule/velocity and the separate chase view, fits campus after resize, and supports bounded pan/orbit/zoom. Focus loss clears controls; suspend/resume retains the inspection camera. Held-key repeats cannot restart student movement after exit.
- Label range, six/eighteen caps, occlusion filtering, overlap rejection and HUD avoidance are tested.

`npm run build`: **passed**. `npm run build:pages`: **passed**. The output includes 734,738 bytes of JavaScript (about 199 kB gzip) and 12,065 bytes of CSS. Generated Pages output uses relative asset paths and includes the unchanged map, notices and `.nojekyll`. Vite's >500 kB bundle advisory is expected for the bundled Three.js application; it is not a build failure.

## Source and collision integrity

Baseline source commit: `a4efab4befcce33191b9fce9cc14c5c898309354`. The baseline was captured before editing the renderer and is stored in `tests/phase1-baseline.json`.

Raw map SHA-256 (770,269 bytes):

```text
8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9
```

Canonical geographic model SHA-256:

```text
f1ecf729f9bd2d41e663d9779420ee5f75df41bfd6bfbbac9ba3bc6071a57d61
```

Canonical collision SHA-256 (cyclic vertex order and batch order normalized; winding retained):

```text
b95c22529398f30fd82c60571453cfcc198080818f92b707fce8a31470aea1be
```

`MAP-REPORT.json` retains bounds/counts/height sources/repairs. `VISUAL-REPORT.json` records 55 source-name anchors, five entrance nodes, 240 added trees, 48 shrubs and 188 illustrative entry treatments. No surveyed entrance in this extract lies on a building wall.

## Performance checks and limits

Vertex-coloured building batches reduce the scene from 343 mesh objects to 211. Curbs, façade detail and planting increase total geometry from 61,530 to 113,842 triangles. Window density was reduced and vegetation combined into one instanced mesh to bound overhead. No per-window objects or external textures were added.

CPU frustum checks used the same camera positions and 16:9 projection for both renderers:

| View | Phase 1 visible batches | Phase 1.5 visible batches | Change |
| --- | ---: | ---: | ---: |
| Main Gate | 114 | 78 | −31.6% |
| Paradise Road | 14 | 14 | 0% |
| Lake bridge | 11 | 13 | +18.2% |
| Arts courtyard | 63 | 51 | −19.0% |

Counts exclude the student and shadow passes. They are **not** measured WebGL draw calls or FPS and do not prove the 60 FPS / ≤30% draw-call target. The older Phase 1 browser observation was about 60 FPS and 157 draw calls at Main Gate, but its viewport was not recorded, so it is not a controlled GPU comparison.

## Browser verification limits

Browser control reports **“Local browser use is disabled in Work settings.”** No browser workaround was used. Current-release graphical play checks, console checks and screenshots could not be obtained. Main Gate junctions, Paradise Road, Lake road/bridge, academic buildings, halls, playing fields and the repaired Arts courtyard still need interactive visual review. Automated checks cover source geometry and the existing real-map movement regressions.

Actual FPS/draw calls, perceived daylight/label readability, real mouse drag/wheel behavior, visual z-fighting and hosted gameplay remain unverified. Unit tests and static checks cannot establish those visual results.

## Build and hosting verification

Development HTTP checks returned **200** for the HTML, main module, new inspection/label/road modules and unchanged map. Production preview returned **200** for HTML, JavaScript, CSS, favicon and map; their bytes match the generated build. `dist/` and `docs/` contain the same map checksum. Generated `docs/` was reviewed before commit, including removal of obsolete hashed assets.

The release process also checks the GitHub Pages workflow and hosted HTML/assets/map over HTTPS. These confirm delivery and file integrity, not interactive gameplay. The actual commit and workflow result are reported with the delivered update. See `HOSTING.md` for publishing commands.
