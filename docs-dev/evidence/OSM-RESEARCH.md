# Repository and OpenStreetMap research — 7 November 2026

## What does the repository represent?

### Takeaway
The existing checkout is clean at base commit `0433e85130ad0b52aec00e77338f4e5fc81da15b`; the research branch is `codex/campus-research`. The game reads a bundled OSM XML extract, then creates geometry offline and at runtime. There is no live Overpass ingestion in the application. Research adds only `docs-dev/` and `references/`; no application, workflow or deployed files changed.

### Cited findings
- Target source and live Pages endpoint: [repository](https://github.com/saakiiiib/gta-islamic-university), [game](https://saakiiiib.github.io/gta-islamic-university/). `HOSTING.md:1` says deployment is main branch `/docs`.
- Extract bounds are south/west/north/east `23.71545,89.14043,23.72694,89.16244`; bundled SHA-256 is `8c1c2810c8eb01496b1d5bc19919c124ea5fec5bf2977da9a1a45cf2570d79d9`. Campus way is [237819447](https://www.openstreetmap.org/way/237819447). `public/data/map.osm:3`, `src/config.js:1`.
- Game origin is `23.72220495,89.15084115`; it is a projection origin, not a claim of surveyed campus centroid. Main Gate labeled entrance [node 9027931168](https://www.openstreetmap.org/node/9027931168) is `23.7227843,89.153833`; game arrival spawn is neighboring node `9027931167`, so do not silently substitute them. `src/config.js:1`, inventory named nodes.
- Central Mosque [way 1317423259](https://www.openstreetmap.org/way/1317423259) has a footprint coordinate average `23.722731753846155,89.1493577923077`, consistent with the supplied `23.7228825,89.1492854` mosque pin (~18 m difference). Coordinate averages are representative anchors, not exact entry positions. [OSM source](https://www.openstreetmap.org/way/1317423259).
- Derived campus view contains **57 building features** (32 named, 25 unnamed), 40 roads, 16 green areas, 3 water features, 1 bridge, 1 mapped tree, 1 mapped tree row, 5 entrances and 53 deduplicated places. This is an inventory of represented features, not proof all physical buildings are mapped. See `osm-inventory.json`, `gameDerived`.
- Entire raw extract has 3,260 nodes, 482 ways and 14 relations. Representative centers inside the bbox include 402 building objects, which includes surrounding settlement and must not be compared directly with the 57 campus-trimmed buildings. [Extract endpoint](https://api.openstreetmap.org/api/0.6/map?bbox=89.14043,23.71545,89.16244,23.72694).

### Inferences
- The initial campus-center candidate `23.7212,89.1504` is in the right campus vicinity but should not replace the existing projection origin. Official university location confirmation from the parent researcher must accompany this inference.
- A visibly sparse or generic scene need not mean OSM lacks footprints: data, trimming, classification, generation and appearance are separate stages.

### Gaps
- No existing `AGENT_HANDOFF.md` was found in repo root or checked project ancestors. Parent agent should create a new dated handoff entry at completion.
- GitHub CLI reports its default saakiiiib token invalid. Repository fetch works; PR creation may fail until account access is restored. No credentials were changed.

## What did current map services return, and what differs?

### Takeaway
The Overpass query succeeded, but its declared database timestamp is **2026-06-01T08:52:28Z**, much older than retrieval day. A separate successful official OSM map API response has the same parsed IDs, geometry and tags as the bundled extract. These evidence snapshots must be labeled by both retrieval date and service database age; do not call the stale Overpass response authoritative November-current data.

### Cited findings
- Exact reproducible query is `overpass-query.overpassql`: `[out:json][timeout:90];nwr(23.71545,89.14043,23.72694,89.16244);out meta center geom;`. Successful endpoint: [Overpass private.coffee interpreter](https://overpass.private.coffee/api/interpreter). Raw saved response is `overpass-private-coffee-2026-11-07.json`; retrieval completed before `2026-11-07 07:21:02 UTC`.
- Raw Overpass response includes 2,525 node objects, 482 ways and 13 relations. Relations embed member geometry; recurse output was not requested. `out geom` supplies geometry/bounds rather than center fields, so analyzer computes coordinate averages for filtering. Missing recursive relation metadata is not a deletion finding. [Overpass query endpoint](https://overpass.private.coffee/api/interpreter).
- Separate official API request returned HTTP 200: [map endpoint](https://api.openstreetmap.org/api/0.6/map?bbox=89.14043,23.71545,89.16244,23.72694). Saved as `osm-api-2026-11-07.osm`. Parsed 3,260 nodes, 482 ways, 14 relations; **zero changed/added IDs and zero absent IDs** against bundled data when comparing coordinates, tags, way node refs, relation members. XML byte hashes differ due serialization/metadata and are not claimed byte-identical. `osm-inventory.json.officialApiCrosscheck` contains hashes and comparison scope.
- Stale Overpass differs in five features: [Mir Mosharraf academic way 1317423240](https://www.openstreetmap.org/way/1317423240) lacks bundled English/Bangla names; [hall pond 1317423252](https://www.openstreetmap.org/way/1317423252) lacks bundled name/salt; [road 1317423277](https://www.openstreetmap.org/way/1317423277) has a shorter node list, `service` instead of `unclassified`, and lacks bundled name/layer/oneway; [Diana garden 1317423287](https://www.openstreetmap.org/way/1317423287) and [1317423288](https://www.openstreetmap.org/way/1317423288) lack several bundled identity/access tags. Exact differences are in `comparison.changes`.
- Failed attempts: DE interpreter POST and GET returned `406 Not Acceptable\n406 Not Acceptable\nnginx`; Kumi GET timed out after 120 seconds (`The request was canceled due to the configured HttpClient.Timeout of 120 seconds elapsing.`). Zero-byte files from these attempts were deleted; successful snapshots retained.
- All OSM evidence is [© OpenStreetMap contributors, ODbL 1.0](https://www.openstreetmap.org/copyright); preserve attribution and database-license obligations if distributing derived data. Existing `DATA-CREDITS.md` remains unchanged.

### Inferences
- The official API cross-check supports keeping the current raw game extract intact for this research-only change. Stale Overpass differences are not reasons to regress names or road extent.
- These two services disagree; a future update should check service timestamps and feature histories before changing the source.

### Gaps
- A successful HTTP fetch is not independent evidence of real-world November survey completeness. Endpoint freshness and per-feature edit/survey dates remain distinct.
- No geometric reconciliation by changed feature IDs or independent aerial surveying was performed. A lack of a tag or name does not establish absence of the underlying real object.

## Which data and generation gaps matter for realism?

### Takeaway
The largest immediate gaps are heights, landmark silhouettes and source-backed identity. Most footprints exist, but **56 of 57 building heights are heuristic** and all appearance is generic except the custom gate. Building roof/material/color fields are absent from the audited data and the renderer also does not consume such overrides.

### Cited findings
- `src/map/osm.js:49` uses explicit `height`, else `building:levels × 3.2`, then English/name-based guesses: dormitories/halls 12.8 m, houses 6.4 m, sheds 3.2 m, academic/unclassified 9.6 m. Only [Applied Science relation 18079379](https://www.openstreetmap.org/relation/18079379) has `building:levels=4` in the 57-feature view. Coverage: no `height`, `min_height`, `roof:shape`, `roof:height`, `roof:colour`, `roof:material`, `building:colour`, or `building:material`. `osm-inventory.json.gameDerived.buildingTagCoverage`.
- Campus height sources: academic guess 13, levels 1, unclassified guess 29, shed guess 1, dormitory guess 11, house guess 2. [Bundled repository parser](https://github.com/saakiiiib/gta-islamic-university/blob/0433e85130ad0b52aec00e77338f4e5fc81da15b/src/map/osm.js).
- Central Mosque height is currently 9.6 m `estimate:unclassified`; the separate appearance classifier correctly chooses worship using `amenity=place_of_worship`. Jia Hall Mosque receives the 12.8 m hall heuristic. This split means correct palette classification does not imply correct height. `src/map/osm.js:54`, `src/world/appearance.js:4`.
- [Old Admin relation 18079380](https://www.openstreetmap.org/relation/18079380) and [New Administrative way 929202651](https://www.openstreetmap.org/way/929202651) are distinct existing footprints; the latter is tagged `building=construction`. Both generate at 9.6 m. Do not mark the new ten-storey building as unmapped before identity/spatial matching with the current official notice.
- `src/world/geometry.js:26` vertically extrudes rings with flat caps. `src/world/buildWorld.js:169` assigns hash-selected class palettes and regular procedural facades from `src/world/facades.js:55`. No per-landmark mosque domes, auditorium silhouette or Shaheed Minar is generated here. `src/world/mainGate.js:236` is already a detailed procedural gate; it has comments claiming official photos but no linked evidence inside that file. [Source tree](https://github.com/saakiiiib/gta-islamic-university/tree/0433e85130ad0b52aec00e77338f4e5fc81da15b/src/world).
- `src/map/osm.js:207` consumes road class/width and defaults service/unclassified to 6 m, footway/path/pedestrian/cycleway to 2.2 m, tertiary 8 m, trunk 7 m. All 57 building objects have no width; no audited bbox object has a width tag. One bbox object has `surface`. Road pavement is therefore mostly inferred, with visual road rules in `src/world/roads.js:27`.
- `src/map/osm.js:13` recognizes gardens/parks/pitches, forest/orchard/grass/meadow, wood/grassland. `natural=water` and water tags create water polygons; waterways use default 3 m width. Trees and tree rows are consumed, but sparse mapped trees are supplemented with illustrative planting by `src/world/vegetation.js:26`.
- No `barrier` tags occur in the audited bundled bbox. The map parser does not build OSM barrier geometry; `src/world/scenery.js:85` places short illustrative fences on portions of the campus boundary. Gate flanks and highway barrier are separately procedural in `mainGate.js`. A legal university boundary is not automatically a surveyed continuous wall alignment.
- Names use `name:en`, then `name`, with `ref` for entrances; a `name:bn`-only feature would not surface through `src/map/places.js:3`. Current campus buildings have 32 `name` tags, no `name:en`, and one `name:bn`. Current renamed hall names already occur in bundled data; retain legacy aliases separately for historic-photo matching.
- No named Shaheed Minar appears in the audited source. This is a **name/identity gap**, not proof no unlabeled polygon or memorial geometry exists. Match official/Commons view to survey position before adding footprint geometry.
- Water is already represented: 3 trimmed features; named hall pond [1317423252](https://www.openstreetmap.org/way/1317423252). `Lake road` [1317423267](https://www.openstreetmap.org/way/1317423267) is a path, not the lake polygon name. Do not equate Mofiz Lake with a particular unnamed water polygon without evidence.
- Pitches already include [Cricket Field 532464907](https://www.openstreetmap.org/way/532464907) and [Football Playground 1317423245](https://www.openstreetmap.org/way/1317423245), plus a third pitch in the bbox. Shape/sport is available; exact goal/stand/light geometry is not established by that alone.

### Inferences
- Prioritize CI (`npm ci`, tests, build) as future task 1, then source-backed landmark override schema keyed by OSM type+ID, height provenance, silhouettes, then finer materials/planting. Avoid a wholesale source-data replacement.
- Proposed files: `src/map/osm.js` for identity/height provenance, `src/world/appearance.js` and `src/world/buildWorld.js` for per-landmark appearance, new dedicated landmark modules for mosque/minar/auditorium, `src/world/scenery.js` for measured walls, `src/map/places.js` for bilingual aliases; corresponding existing `tests/map.test.js`, `appearance.test.js`, `mainGate.test.js`, `campusBoundary.test.js`, `world.test.js`, `preparation.test.js` provide extension points.
- Preserve source XML and all navigation/collision tests; any future landmark model must remain aligned to mapped footprint and correct entry clearances. Check performance and mobile view after geometry additions.

### Gaps
- Exact building heights, current facade colors, roof systems, wall/fence continuity, detailed tree species/locations and all physical-campus completeness need dated photo/survey evidence. Do not convert architectural impressions into measured dimensions.
- Baseline validation: `npm test` completed successfully with fail=0; exact test count in current-task `work/campus-baseline-tests.txt`. Direct Vite build to isolated current-task `work/campus-baseline-build` passed, warning about chunks >500 kB. Standard `npm run build` and `npm ci` were intentionally not run because they modify existing generated/dependency files; source and deployment unchanged. These checks do not prove browser gameplay or current production quality.

The repeatable analyzer is `analyze-osm.mjs`; run `node docs-dev/evidence/analyze-osm.mjs` from the repo. It only writes research inventory. All 57 derived building IDs, representative anchors, source tags and estimated heights are in `osm-inventory.json.gameDerived.buildings`, ready for the report writer's exhaustive represented-building appendix.
