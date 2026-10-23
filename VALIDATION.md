# Recorded voices, pedestrian routes and moving exits — validation

Verified on 2026-10-24 with Node.js 24.17.0, npm 11.13.0, Three.js 0.186.1 and Vite 8.3.5. Upgrade base: `dca1412ecf10439f64cbfe2b99618500d0a014a7`. This modifies the existing game in place. Previous release results are preserved in `VALIDATION-CAMPUS-MOTION.md`, `VALIDATION-PHASE2.md` and `VALIDATION-PHASE1.5.md`.

## Automated results

`npm test`: **143 passed, zero failed**. Existing movement, source-map, geometry, collision, bridge, courtyard, camera, inspection, fleet, occupancy, damage, avoidance, pause and reset coverage remains. Old stopped-exit, vehicle-road-centre walking and synthesized/subtitled dialogue expectations were replaced to match the requested behavior.

- Eight existing cargo tricycles retain visible permanent drivers and a visible student passenger behind the selected driver. Occupant transforms follow the vehicle. Entry still requires a nearby stopped van; exit does not.
- Moving exits start at the passenger's actual transformed seat position and inherit the van's horizontal momentum plus an outward/upward jump. Low- and high-speed tests cover gravity, landing, speed-scaled injury, stumble/fall/recovery, live van/static collisions and camera handoff. Falling/recovering prevents immediate walking or jumping. Reset restores health and clears exit state. There is no safe-point teleport on dismount.
- The departing van retains its visible driver and continues on connected mapped vehicle roads. Driver tests cover momentum, forward travel, steering, obstacles, pedestrian yielding, dead-end parking, re-entry and reset. Pause/inspection freezes driver continuation along with the other actors.
- Navigation prioritizes source footways, pedestrian paths and the bridge. Where sidewalks are absent, unrendered parallel roadside corridors are estimated outside vehicle pavement. Crossings are short links at mapped junctions or connected footpath ends. Tests check their placement, connectivity, static safety and walking-corridor containment, including thirty students passing the eight vans during a simulated minute.
- Walking, avoidance and impact displacement reject buildings, water and moving van penetration while allowing retreat from an existing overlap. Existing near-miss, damage, contact cooldown, stumbling, falling and recovery tests remain.
- Nine audio checks cover the four supplied MP3s, separate near-miss/collision selection, decoded caching, spatial NPC/listener updates, random variation, mute/pause, missing/failed clips, global/per-NPC cooldowns and absence of synthesis/subtitles. Collision recordings take priority over near misses and can replace one active warning without overlapping audio or repeatedly bypassing the collision cooldown.

## Human recordings

The four MP3s in `public/audio/npc/` are unchanged copies of the project owner's files. `near_01.mp3` and `near_02.mp3` are near-miss reactions; `hit_01.mp3` and `hit_02.mp3` are collision reactions. `CAMPUS-MOTION-REPORT.json` records byte counts and SHA-256 hashes. All eleven former synthetic WAVs and the speech-synthesis implementation are removed. Dialogue subtitles are removed as requested.

Web Audio uses an NPC-position HRTF panner, with a stereo fallback where supported. One shout plays at a time, with an eight-second per-NPC cooldown and 2.4-second global spacing. Collision priority is the bounded exception described above. Reactions outside approximately 35 metres are skipped. Missing/undecodable files or unavailable audio stay silent. Impact sound effects remain separate from voice recordings. Paths use `import.meta.env.BASE_URL`.

## Build and HTTP checks

`npm run build` and `npm run build:pages` pass. The Three.js bundle still produces Vite's ordinary >500 kB advisory, with no build error. No dependency was added. Generated `docs/` retains relative assets and `.nojekyll` for `main → /docs`.

The build contains `index-DC9KCpgh.js` (805,693 bytes) and `index-DKs0AoxZ.css` (15,269 bytes). The release verifier checks production HTML, every referenced JavaScript/CSS/favicon asset, the unchanged map, the voice manifest and all four recordings over HTTP against exact local hashes. A successful push alone is not treated as a successful deployment; the release response and separate deployment JSON record the actual commit, Pages workflow and hosted-file verification.

Production preview returned HTTP 200 for all of these files, with byte-for-byte hash matches. The generated Pages directory contains the same build and recordings, with no synthetic WAV files.

The downloadable ZIP includes source, tests, lockfile, bundled map/recordings, notices, reports, `dist/` and `docs/`; installed dependencies are excluded.

## Map integrity

No source-map, projection, building footprint/height, road surface, bridge or static collision geometry was changed. Estimated walking corridors are navigation data rather than new rendered or surveyed sidewalks. Source counts, geographic model and static collision winding match the original baseline.

| Invariant | Value |
| --- | --- |
| Raw source size | 770,269 bytes |
| Selected buildings / roads / green areas / water / bridge | 189 / 42 / 16 / 4 / 1 |
| Static campus collision triangles | 3,600 |
| Raw OSM SHA-256 | `8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9` |
| Geographic model SHA-256 | `f1ecf729f9bd2d41e663d9779420ee5f75df41bfd6bfbbac9ba3bc6071a57d61` |
| Static collision SHA-256 | `b95c22529398f30fd82c60571453cfcc198080818f92b707fce8a31470aea1be` |

The new walking graph contains 2,066 nodes and 2,195 edges across six components: 146 footpath, 1,851 roadside and 198 crossing edges. Route length is 987.41 m of footpath, 13,455.89 m of roadside and 1,085.90 m of crossings. More than 93% is outside crossing segments. Disconnected source areas are not connected through buildings or water.

## Browser and performance checks

The in-app browser successfully loaded the production preview, entered gameplay, displayed the grounded student and permanent van driver, decoded the recorded clips (the HUD shows **Recorded voices**), toggled mute, entered/exited inspection and returned to the previous student view. No browser warnings or runtime errors were captured during these checks. The normal viewport was restored after desktop-size checks. A gameplay screenshot is included alongside the delivery ZIP.

At Main Gate, the F3 display reported approximately 60–61 FPS, 159 draw calls and 121,015 rendered triangles at a 1,067 × 600 CSS-pixel viewport. This is a single-location smoke observation, not a controlled benchmark or a guarantee across devices and the whole campus.

Static campus geometry remains 211 mesh batches / 113,842 triangles. The student uses 23 meshes / 502 triangles, eight vans use 40 meshes / 34,176 triangles, thirty pedestrians use three instanced batches / 12,600 triangles, and eight drivers use three instanced batches / 3,360 triangles. Existing batching, nearby shadows and pixel-ratio cap remain.

`node scripts/report-campus-motion.mjs` sampled 600 updates representing ten seconds in 1,681.54 ms total / 2.803 ms mean per update. This includes idle-player physics, thirty wandering pedestrians, eight parked vans, occupants and actor animation. It excludes rendering, camera, labels, audio and HUD, so it is not an FPS measurement.

## Verification limits

Detailed moving exits, collisions and driver continuation were verified through scripted simulation tests; the browser smoke check is not a complete manual playthrough of every route or high-speed exit. The supplied files decoded successfully, but subjective audible clarity and pronunciation were not personally auditioned through the browser tool. Automated audio API checks and file hashes do not establish those qualities.

Vehicles use bounded kinematics, visual suspension and capsule/triangle collision rather than a full rigid-body engine. Falls use animated poses rather than ragdolls; injury/recovery remains nonlethal. Departed drivers brake or park when blocked or at route ends. There are no new vehicle types, missions or map redesigns.
