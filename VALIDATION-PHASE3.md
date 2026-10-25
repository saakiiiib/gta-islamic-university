# Phase 3 validation — Living Campus

The release preserves the supplied OSM extract, all original building footprints, height estimates, source projection and the original map collision mesh. Furniture is a separate solid scenery layer. No vehicle type, low-level vehicle integrator, combat or mission system was added.

## Automated checks

`npm test`: **188 passed, zero failed**. The baseline had 158 tests. Existing map, movement, bridge, courtyard, collision, occupants, damage, recordings, inspection and touch tests remain. Only expectations intentionally replaced by this milestone were updated: maximum campus-wide spacing, all vans starting/staying parked after reset, and stopped-service boarding setup. Tests use two concurrent workers to avoid excessive memory pressure.

New coverage includes hub allocation, identities/health/cooldowns, social interruption, hidden arrivals, visible-destination rejection, reset, compact crowd rendering, connected service circuits, sustained traffic, yielding/resumption, pickup pull-ins, solid scenery collision, UV retention, asset checksums and size budgets. A full-world Gate → Library → Applied Science transfer regression checks actual camera visibility, shared 30-person identity, route clearance and minimum peer spacing. Validated crowd-only hairpin shortcuts stay inside the original accepted walking corridors; neither source navigation data nor rendered map geometry is rewritten.

Original integrity values remain:

- Raw map: 770,269 bytes, SHA-256 `8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9`.
- Canonical geographic model: `f1ecf729f9bd2d41e663d9779420ee5f75df41bfd6bfbbac9ba3bc6071a57d61`.
- Original collision mesh: 3,600 triangles, positions and winding SHA-256 `b95c22529398f30fd82c60571453cfcc198080818f92b707fce8a31470aea1be`.
- 189 buildings, 42 roads/paths, 16 green areas, four water features, one bridge.

## Browser checks and evidence

`scripts/browser-phase3.mjs` captures matching normal third-person views before/after at Main Gate, Central Library and Applied Science. Evidence is in `validation/phase3/`. Browser-local QA state is injected only into the temporary automated browser; no teleport/testing API is shipped in the game. Main Gate is observed for the first 20 seconds. The Library follows a location change; Applied Science allows nearby identities time to walk around buildings instead of appearing on-screen.

`scripts/browser-controls-phase3.mjs` passed desktop keyboard movement/jump/pause, visible occupants, acceleration, moving exit and ground landing. It also passed native multitouch emulation with two simultaneous fingers moving and orbiting, jump, sprint, pause clearing, riding/driving/exiting, 512-pixel assets, DPR ≤1.25 and portrait overflow checks. All four supplied MP3s decoded and the Web Audio context ran. This confirms playback wiring, not subjective listening quality.

The built-in browser connection was unavailable; these checks use temporary headless Chrome and Chrome touch/iPhone viewport emulation. No physical Android/iPhone or native iOS Safari device was available. Browser frame rates describe this desktop test environment and do not establish midrange-phone performance.

## Assets and performance

Five CC0 material sets and the actual 630-triangle bench are bundled locally. The additional selected variant is 2,732,885 bytes desktop or 598,179 bytes mobile, below the 12 MB / 6 MB budgets. `public/visual/manifest.json` records all derivative/source checksums. Approximate decoded visual texture budgets are 72 MB / 18 MB. There are 78 deterministic furniture placements, instanced by type and spatial bucket; small props do not cast dynamic shadows.

The complete static scene has 263 batches including furniture versus 211 before (+24.6%); actual gameplay frustum/distance culling uses fewer. The same mobile resolution, shadow and antialiasing limits remain. Physics, health, impacts and avoidance keep the existing fixed timestep; distant animation and small furniture use LOD/culling. There are no new runtime dependencies or remote asset/API calls.

## Builds and publication

`npm run build` succeeds. Vite reports a nonfatal JavaScript chunk-size advisory; the combined Three.js/game bundle is approximately 930 kB minified, approximately 260 kB gzipped. A final `npm run build:pages` prepares the existing `main → /docs` source. Publishing success must be recorded only after the Pages workflow and checksum comparison of hosted HTML, scripts/styles, map, recordings and all visual assets succeed.

Reproduce long-run checks with `node scripts/soak-phase3.mjs`. The script writes per-second data for five simulated minutes each at Main Gate, Library and Applied Science, with actual NPCs, vans, scenery and camera visibility. See the accompanying soak report for outcomes and any remaining limitations. Production verification uses `node scripts/verify-pages.mjs <url> <commit>`.

All three five-minute scenarios passed: three moving service vans and five parked pickups at the end, zero pedestrian/vehicle/static contacts, no health or durability loss, no walking-network/geometry violations, and minimum pedestrian separation above 0.52 m. All thirty identities walked during each scenario. The three services travelled approximately 2.14 km combined and completed seven laps per scenario. Main Gate showed moving traffic within the first 20 seconds. At the other stationary test views, ten students became visible after 12 seconds (Library) and 14 seconds (Applied Science); immediate short transfers between adjacent hubs can take longer because nearby people walk instead of teleporting.

## Final rendered comparison

Same 1365 × 768 viewport and chase-camera poses, with no concurrent simulation test runners. Counts are head/torso occlusion estimates, manually reviewed alongside gameplay screenshots. Main Gate has 18 nearby students; its visible estimate also includes students farther along the approach.

| View | Before visible NPC / moving vans | After visible NPC / moving vans | Nearby NPCs | Observation | Median FPS | Draw calls before → after |
| --- | --- | --- | --- | --- | --- | --- |
| main-gate | 3 / 0 | 26 / 3 | 18 | 20s | 60.0 | 159 → 187 |
| central-library | 0 / 0 | 13 / 3 | 22 | 20s | 60.0 | 113 → 128 |
| applied-science | 1 / 0 | 10 / 3 | 16 | 80s | 59.8 | 134 → 145 |

The rapid Library → Applied Science transfer needed 80 seconds to reach ten visible students in the selected narrow view. This is an explicit limit of retaining the same nearby people and making them walk around buildings; the separate fresh-view five-minute scenario reached ten in 14 seconds. Normal hub population varies as students walk, converse and wait. These results do not guarantee ten people from every camera angle.

## Published-game verification

Feature commit `337bffe6106d46b6b93503b2b0ca81409832f71a` was pushed successfully. [GitHub Pages workflow 40192965808](https://github.com/saakiiiib/gta-islamic-university/actions/runs/40192965808) completed successfully, retaining `main → /docs` and the original URL.

All 52 hosted-file checks passed, including HTML, exact hashed programs/styles, original map, four recordings, all 39 visual files and data/audio notices. Git normalises newline characters in two documentation/JSON files; the verifier records that separately. Map, model buffers, programs, images and recordings use strict byte comparisons. The original map remains 770,269 bytes with the SHA-256 above.

The published URL was also loaded in temporary desktop and Android-style touch Chrome contexts. Both started normally with thirty pedestrians/eight vans, 18 nearby students, three moving vans, no console/page errors and no failed requests. Desktop walking worked; touch controls appeared with a 1.25 DPR cap. See `hosted-browser.json`, `hosted-assets.json` and the hosted screenshots in the evidence directory. These checks still do not replace testing on physical phones.
