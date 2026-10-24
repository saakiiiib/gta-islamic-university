# Mobile browser touch controls — validation

Verified on 2026-10-24. Upgrade base: `4a86c7c880795adf7a18bfa632e5a4ff3ee8f656`. This extends the existing static Three.js/Vite game at the same GitHub Pages URL. Prior results are retained in `VALIDATION-MOVING-EXITS.md` and the earlier validation/report files.

## Automated checks

`npm test`: **158 passed, zero failed**. All 143 preceding map, geometry, movement, fleet, NPC, voice, driver-continuation, collision and moving-exit checks remain. Fifteen added tests cover:

- Independent joystick/look/button pointers, proportional dead-zone movement, duplicate-pointer rejection, capture loss/cancellation and one-shot actions.
- Sprint toggling; held accelerator, brake/reverse and inspection zoom; mode changes; pause/focus/visibility clearing.
- Keyboard and touch priority by axis, preserving ordinary WASD, mouse, arrows, Shift, Space and E behavior.
- Android, iPhone, desktop-mode iPad and coarse-touch detection; desktop/touch-laptop defaults; the explicit `?touch=1` QA preview.
- Mobile render resolution/shadow caps while leaving desktop quality unchanged.
- Proportional player speed, camera-relative motion, diagonal speed limits, sprint, jumping/landing and wall sliding.
- Proportional van steering, acceleration, braking into reverse, actual moving dismount momentum, visible occupants, suspension and reset on the original campus.

After final UI text/spacing changes, all fifteen focused touch/device/gameplay tests were also rerun successfully. World physics, collisions, NPC count, driver visibility, recorded voices and map geometry use the existing modules.

## Browser checks

The in-app browser initially timed out; it reconnected successfully after the regression run. Production-preview checks used the explicit touch-layout preview in a desktop browser with phone-sized viewports:

- Landscape layouts around 844 × 390 and 667 × 375; portrait around 390 × 844. Touch controls remained within the viewport and had at least approximately 44-pixel action targets. Portrait provided a nonblocking landscape suggestion.
- The virtual joystick actually moved the student toward the gate van. A right-side swipe rotated the camera (heading changed from approximately 0.738 to 0.541 radians).
- Sprint toggled and Jump put the student in the air. Touch Pause hid the overlay, cleared sprint and resumed cleanly. Inspection exposed pan/orbit and zoom controls with frozen physics.
- Enter boarded the nearby van and switched MOVE/Jump/Sprint to STEER/Go/Brake-Reverse/Exit. Holding the on-screen accelerator moved the van. Exit successfully switched back to on-foot mode while the measured van speed was 1.57 m/s.
- Driver and passenger remained visible while riding. The small-screen speed/durability panel was moved clear of the wider driving buttons, and the interaction prompt was moved above the character.
- No runtime errors or warnings were captured during these checks. A settled landscape screenshot is delivered alongside the ZIP.
- On the ordinary desktop URL, mobile detection stayed off, the touch overlay remained hidden and holding W moved the student with the existing keyboard controls.

Simultaneous multi-finger behavior was exercised by automated Pointer Event tests; browser interaction used mouse drags in the explicit QA preview. Physical Android and iPhone hardware, Safari-specific edge gestures/audio behavior, device notches, thermal throttling and sustained midrange-phone FPS were not available for direct verification. Viewport tests do not establish those hardware results.

## Rendering and interface

Mobile: maximum DPR 1.25 and 800,000 render pixels, no MSAA, 1,024-pixel BasicShadowMap over a 44-metre half-extent, shadow updates at up to 30 Hz. Desktop retains DPR 1.5, MSAA and 2,048-pixel PCF shadows over the existing 58-metre half-extent. Rendering is independent of fixed 60 Hz physics. All eight vans, eight drivers, thirty pedestrians and recorded voice reactions remain.

Controls use Pointer Events with separate capture owners for movement, camera and buttons. Disabling, app switching, resize/orientation changes and mode transitions clear input. The right swipe surface sits below action buttons and the toolbar. Safe-area insets, dynamic viewport height, compact HUD/minimap, transparent controls and internally scrollable start/pause panels support phone browsers. Pinch/page gestures are disabled over gameplay. Portrait is playable without forcing orientation or fullscreen.

There is no APK, native wrapper, PWA manifest, service worker, installation prompt, runtime service or new dependency. Dialogue subtitles remain removed per the owner's earlier preference. The `?touch=1` parameter is only an optional desktop QA preview; phones use the normal URL.

## Builds and map integrity

`npm run build` and `npm run build:pages` pass. The existing Three.js >500 kB bundle advisory remains, with no compilation error. Final assets: `index-B2wGQC3F.js` (815,535 bytes), `index-duulBnIn.css` (28,262 bytes). Generated `docs/` retains relative paths, `.nojekyll` and the existing `main → /docs` publishing configuration.

Source map, geographic model, footprints, heights, road/bridge surfaces and static collision winding remain unchanged:

| Invariant | Value |
| --- | --- |
| Map bytes | 770,269 |
| Buildings / roads / greens / water / bridge | 189 / 42 / 16 / 4 / 1 |
| Static collision triangles | 3,600 |
| Raw OSM SHA-256 | `8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9` |
| Geographic model SHA-256 | `f1ecf729f9bd2d41e663d9779420ee5f75df41bfd6bfbbac9ba3bc6071a57d61` |
| Static collision SHA-256 | `b95c22529398f30fd82c60571453cfcc198080818f92b707fce8a31470aea1be` |

Production preview and hosted delivery are checked over HTTP against the exact generated HTML, JavaScript, CSS, favicon, unchanged map, voice manifest and all four MP3 recordings. The release response and separate deployment JSON record the actual release commit, Pages workflow and hosted hash result. A successful push alone is not publication verification. The updated ZIP includes source, lockfile, tests, notices, map/voices, `dist/` and `docs/`, excluding `node_modules`.
