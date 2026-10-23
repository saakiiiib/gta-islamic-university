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
git add src tests scripts index.html README.md VALIDATION.md PHASE2-REPORT.json docs
git commit -m "Add electric cargo van, campus pedestrians and motion polish"
git push origin main
```

Review generated `docs/` files before committing. GitHub Pages should remain set to **Deploy from a branch → main → /docs**. Relative Vite assets support the repository's nested project URL.

Confirm the **pages build and deployment** workflow for the pushed commit succeeds. Then check hosted HTML, the exact hashed JavaScript/CSS URLs referenced by it, the favicon, and `data/map.osm`. The map must contain 770,269 bytes and match:

```text
8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9
```

Phase 2: approach the yellow minimap van marker and press **E** to enter. **W/S** drive/brake/reverse, **A/D** steer, **Space** brakes, **E** exits when stopped. **L** labels, **I** inspection, **G** map alignment, **F3** statistics remain. Inspection pauses all entities; drag/arrows orbit, right drag/WASD pan, scroll zoom, I/Escape returns to the previous walking/driving mode.

See `VALIDATION.md` for checks and browser/performance verification limits. The release response records the actual commit and verified workflow result; a successful push alone does not confirm publication.
