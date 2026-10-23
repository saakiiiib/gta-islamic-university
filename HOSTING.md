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
git add src tests scripts public index.html README.md VALIDATION.md CAMPUS-MOTION-REPORT.json docs
git commit -m "Add eight occupied vans, pedestrian damage and Bangla reactions"
git push origin main
```

Review generated `docs/` files before committing. GitHub Pages should remain set to **Deploy from a branch → main → /docs**. Relative Vite assets support the repository's nested project URL.

Confirm the **pages build and deployment** workflow for the pushed commit succeeds. Then check hosted HTML, the exact hashed JavaScript/CSS URLs referenced by it, the favicon, and `data/map.osm`. The map must contain 770,269 bytes and match:

```text
8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9
```

Eight vans appear as yellow minimap markers; disabled vans turn red. Approach any usable van and press **E** to ride visibly behind its driver. **W/S** drive/brake/reverse, **A/D** steer, **Space** brakes, **E** exits when stopped. **R** returns to the gate and repairs the same fleet. **M** mutes Bangla reactions; subtitles stay on. The volume slider, **L** labels, **I** inspection, **G** alignment and **F3** statistics remain. Inspection pauses every actor and cancels speech; I/Escape returns to the previous walking/riding view.

The build must include `audio/reactions.json`, all eleven WAV files and `audio/README.txt`. Fetch the manifest and each listed clip after deploying and compare against the local production build. Browser Bengali SpeechSynthesis support varies; the bundled synthetic clips are the fallback. HTTP checks prove clip delivery, not pronunciation or browser autoplay behavior.

See `VALIDATION.md` for checks and browser/performance verification limits. The release response records the actual commit and verified workflow result; a successful push alone does not confirm publication.
