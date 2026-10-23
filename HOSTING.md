# Live GitHub Pages game

- Play: https://saakiiiib.github.io/gta-islamic-university/
- Repository: https://github.com/saakiiiib/gta-islamic-university
- Publishing source: `main` branch, `/docs`.

The game runs in a desktop browser with WebGL 2 and keyboard/mouse controls. Playing requires no local install, running terminal, backend, API key or paid hosting.

## Publish changes

```sh
npm install
npm test
npm run build
npm run build:pages
git add --all
git commit -m "Use recorded NPC voices, roadside walking and moving dismounts"
git push origin main
```

Review generated `docs/` files before committing. GitHub Pages should remain set to **Deploy from a branch → main → /docs**. Relative Vite assets support the repository's nested project URL.

Confirm the **pages build and deployment** workflow for the pushed commit succeeds. Then check hosted HTML, the exact hashed JavaScript/CSS URLs referenced by it, the favicon, and `data/map.osm`. The map must contain 770,269 bytes and match:

```text
8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9
```

Eight vans appear as yellow minimap markers; disabled vans turn red. Approach a stopped van and press **E** to ride behind its driver. **W/S** drive/brake/reverse, **A/D** steer, **Space** brakes, **E** jumps off at any speed. The passenger inherits momentum and takes landing damage at speed; the driver continues along mapped roads. **R** returns to the gate and repairs the fleet/player. **M** mutes recorded reactions; dialogue subtitles are removed. Labels, inspection, alignment, volume and F3 remain. Inspection pauses every actor and cancels recordings.

The build must include `audio/reactions.json`, `audio/README.txt` and the four supplied MP3s under `audio/npc/`. Fetch and compare every recording after deploying. Synthetic WAVs must be absent. No speech synthesis is used; missing or blocked audio stays silent. HTTP checks prove file delivery, not subjective voice quality or autoplay behavior.

See `VALIDATION.md` for checks and browser/performance verification limits. The release response records the actual commit and verified workflow result; a successful push alone does not confirm publication.
