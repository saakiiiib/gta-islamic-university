# Agent handoff

## 2026-11-07 — Codex — Campus reference research

Completed research for Islamic University, Kushtia on branch `codex/campus-research`, based on `0433e85130ad0b52aec00e77338f4e5fc81da15b`. Two Sol agents with high reasoning assisted with repository/OSM research and report synthesis; Codex verified sources, downloaded images, reviewed the locator, and checked scope.

Changed files (all new in this task):
- `docs-dev/campus-realism.md`: OSM pipeline, location confirmation, detailed landmark register, all 57 represented building features, explicit OSM gaps, and 20 future implementation tasks. Task 1 is PR CI with npm ci, tests and npm run build; no workflow implemented here.
- `docs-dev/evidence/OSM-RESEARCH.md`, `osm-inventory.json`, `analyze-osm.mjs`, `generate-building-appendix.mjs`, `overpass-query.overpassql`, `overpass-private-coffee-2026-11-07.json`, `osm-api-2026-11-07.osm`, `campus-locator.svg`, `VALIDATION.md`.
- `references/campus/`: 33 openly licensed JPEG references, `image-manifest.json` and `SOURCES.md`. Individual image filenames, authors, URLs and licenses are in the manifest/source register. Non-free references are URLs only.
- This coordination file.

Application source, tests, package/dependency declarations, source OSM, generated preparation, workflows and deployed assets are unchanged. Baseline: 243 tests passed; direct isolated Vite build passed with existing >500 kB bundle warning. All 33 image files decoded and matched manifest hashes. Fresh npm ci and the standard prebuild/build path were not rerun.

Important findings: the official OSM API response matches the bundled map's parsed IDs/geometry/tags. The successful Overpass service response declares a 1 June 2026 database timestamp, despite November retrieval; its five differences are not newer corrections. Most building heights are heuristic. Official library storeys conflict with visible window bands, mosque minarets are described as planned, and historical photos predate expansions and renaming. New 2026 named hall/academic tower identities still require a spatial match.

Left: implement the 20 separately scoped follow-ups only when requested. First obtain current georeferenced evidence for unknown towers, monument anchors, facade elevations and boundary segments; preserve the report's unknowns and provenance. GitHub CLI sign-in was invalid during research; publishing/PR creation may require restored GitHub access. No credentials or other agent configuration were changed.

### Publication result — 2026-11-07, Codex
Research commit is local on `codex/campus-research`. Push failed because Git's GitHub credential helper could not supply authentication; direct PR creation returned HTTP 401 (requires authentication). No remote branch or PR was created in this attempt. Leave the local research commit intact and publish after GitHub access is restored. A user-facing report/reference export is provided in the originating chat's outputs folder.
