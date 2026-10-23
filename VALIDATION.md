# Campus in Motion validation

Verified on 2026-10-24 with Node.js 24.17.0, npm 11.13.0, Three.js 0.186.1 and Vite 8.3.5. Upgrade base: `ddf0896cc308cb1f1888badfdaf0638bfd13828f`. This upgrades the existing project in place. Historical results remain in `VALIDATION-PHASE2.md`, `VALIDATION-PHASE1.5.md` and their JSON reports.

## Automated results

`npm test`: **125 passed, zero failed**. There are 33 added checks beyond the previous 92-test release. Previous expectations for one van, twelve students and a hidden mounted player were updated to eight vans, thirty pedestrians and visible passengers. Exact pedestrian centre-line assertions now allow a bounded safe pavement sidestep for passing; land, road and separation checks remain.

- Eight distinct original cargo tricycles start on valid, nonoverlapping road footprints spread across campus. Every instance can be approached and entered. All eight drivers remain visible through three instanced batches; the original student stays visible on the selected rear deck, including after vehicle pitch/roll/yaw. Tests check hip placement, feet on the deck and hands reaching the driver's handlebars.
- W/S forward/brake/reverse, A/D steering, held Space braking, wheel animation, low maximum speeds, stopped safe exit, camera transitions, wall obstruction, pointer-lock fallback and input clearing retain their regression coverage. Exit routes reject water, walls, other vans and pedestrians. The student returns upright to on-foot movement.
- Actual van-to-pedestrian contact reduces both health and durability according to speed. Tests check low versus high impact, contact-enter damage, no repeated damage while throttle is held against a person, and damage rearming only after separation/cooldown. The shared simulation forwards contact events to the presentation layer.
- Low impacts stumble; harder impacts fall and recover nonlethally. Tests cover health zero/recovery, constrained knockback, route rejoining, reaction precedence and finite instanced fall/get-up animation. Nearby moving vans trigger stepping back, turning toward the van and throttled near-miss events. Parked vans do not shout-trigger pedestrians.
- Damage visibly changes paint tint and chassis proportions; repair restores the original appearance. Zero durability stops acceleration while retaining a safe exit. Other parked vans stop the moving footprint and take damage; walls also damage the van. Collision sounds and impact recoil are bounded; there is no gore.
- Thirty students keep moving around the eight actual parked vans for one simulated minute, staying on mapped pavement, separated from each other and clear of van footprints. A separate opposing-walker regression checks passing on narrow pavement; blocked routes reverse rather than permanently deadlocking. Sidesteps are speed-limited and animated as walking.
- Bengali audio tests mock device voices, delayed `voiceschanged`, Bengali-script utterances, distance limits, global/per-NPC cooldowns, no speech queue, mute, pause, exceptions and asynchronous speech failure. All eleven fallback entries are valid nonempty local PCM WAV files. Subtitles remain available muted or without audio and expire on gameplay time.
- Pause/inspection freezes every actor, health/reaction timer and impact state without catch-up. Reset preserves the same eight instances, repairs/reparks them and safely clears pedestrians from parking positions. It does not add another fleet.
- All source map, geometry, heights, courtyards, road/bridge, label, minimap, walking/running/jumping/gravity, collision and inspection regressions continue passing. The actual bent lake bridge remains traversable with careful alignment.

## Build and delivery checks

`npm run build` passes. Vite bundles the existing dependencies and new ES modules without adding a runtime library. The ordinary >500 kB Three.js bundle advisory remains; it is not a build failure. `npm run build:pages` regenerates `docs/` with relative URLs and `.nojekyll` for the existing `main → /docs` configuration.

The release verification checks development modules, production HTML, exact hashed JavaScript/CSS, map and the voice manifest plus every WAV over HTTP. Public deployment is recorded separately with its commit and GitHub Pages workflow outcome; an HTTP 200 alone is not treated as evidence of the new build. The source, lockfile, map, notices, reports, `dist/` and `docs/` are packaged without `node_modules`.

Development modules and production preview returned **HTTP 200**. Production HTML, JavaScript (`index-BMG6qfor.js`, 793,537 bytes), CSS (`index-Dr_wyePp.css`, 15,701 bytes), favicon, map, voice manifest and all eleven WAVs matched the generated files byte-for-byte. The main/HUD bindings reference 51 unique, existing HTML IDs. The generated Pages assets contain the same relative paths and voice files.

## Map integrity

Source bytes, geographic model, counts, projection, bounds, footprints, courtyard holes, height estimates and static collision winding match the original baseline. Nothing in `src/map/` or the source OSM database was changed. New actors are game props. Grass/garden/water palette changes do not change geographic geometry.

| Invariant | Value |
| --- | --- |
| Raw source size | 770,269 bytes |
| Selected buildings / roads / green areas / water / bridge | 189 / 42 / 16 / 4 / 1 |
| Static campus collision triangles | 3,600 |
| Raw OSM SHA-256 | `8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9` |
| Geographic model SHA-256 | `f1ecf729f9bd2d41e663d9779420ee5f75df41bfd6bfbbac9ba3bc6071a57d61` |
| Static collision SHA-256 | `b95c22529398f30fd82c60571453cfcc198080818f92b707fce8a31470aea1be` |

The eight dynamic parked-van proxies are separate from the canonical static collision world. `tests/phase1-baseline.json` verifies original geography; `CAMPUS-MOTION-REPORT.json` records current actor/render/audio counts and checksums.

## Performance

Static campus geometry remains **211 mesh batches / 113,842 triangles**. The existing student uses 23 meshes / 502 triangles. Eight original vans collectively use 40 meshes / 34,176 triangles; thirty pedestrians use three instanced batches / 12,600 triangles; eight drivers use three more instanced batches / 3,360 triangles. There are no per-limb draw calls for the crowd or drivers. Labels, static batching, pixel ratio cap and nearby shadows remain.

A reproducible sample (`node scripts/report-campus-motion.mjs`) ran 600 updates representing ten seconds in **491.55 ms total / 0.819 ms mean per update** on this machine. It includes the idle player's physics, thirty wandering pedestrians, eight parked vans, occupants and actor animation/matrix updates. It excludes WebGL rendering, camera, labels, audio and HUD. This is a CPU simulation sample, **not an FPS or GPU draw-call measurement**.

## Audio and gameplay limits

The eleven Bengali fallback files are synthetic eSpeak NG speech with a robotic sound; they are not human recordings. The executable and voice database are not bundled. `public/audio/README.txt` records provenance and how to replace a line with a permitted human recording. Browser SpeechSynthesis may use an OS/browser voice service; local clips need no such service. Autoplay permissions and available voices vary. If audio cannot play, subtitles continue.

Vans use stable upright kinematics and visual suspension rather than full rigid-body/tire simulation. Pedestrian knockback and falling are constrained animated reactions, not ragdolls. Recovery is nonlethal; health regenerates. Only the selected van moves, with its permanent driver and visible student passenger. The remaining vans wait where parked. No new vehicle types, autonomous traffic, missions, combat or map redesign are included.

## Browser verification limit

The browser tool reports **“Local browser use is disabled in Work settings.”** No workaround was used. Interactive visual review, real audio pronunciation/quality, pointer-lock behavior, screenshots, actual GPU frame rate and WebGL draw calls remain unverified. Automated animation, audio-API mocks, valid WAV/HTTP checks and CPU timings cannot establish those results.
