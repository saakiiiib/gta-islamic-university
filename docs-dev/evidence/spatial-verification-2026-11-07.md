# Campus verification addendum — 7 November 2026, Codex

Research-only notes for tasks 4, 6, 7, 9, 10, 14, 16 and 17. Read the repository's AGENT_HANDOFF.md, docs-dev/campus-realism.md, OSM inventory and existing image manifest. No repository files or branches changed. Absolute monument anchors, new tower identity-to-footprint matches, surveyed heights, road widths and boundary segment coordinates remain unverified; do not mark those acceptance conditions as completed.

## Useful new evidence

### Science/business floor counts: stronger support, still separate plan/completion/height

Primary source: IU 2020–21 Annual Performance Agreement, printed pp. 9–10 (PDF pages 9–10; zero-based indices 8–9):
https://iu.ac.bd/public/images/notice/51598e5e3d44198ddf6e68ca24859da4.pdf

Downloaded and visually inspected these full pages locally, after web PDF screenshots were unsuccessful. The target table specifies:

| Building | Explicit development target | What can be recorded |
|---|---|---|
| Former Wazed Miah / current Ibn Sina science building | Five-storey foundation; upward extension of 3rd, 4th, 5th floors | Five-storey target, primary-source plan |
| Business Administration | Six-storey foundation; extension of 5th and 6th floors | Six-storey target, primary-source plan |
| Mir Mosharraf academic | Four-storey foundation; 4th-floor extension | Four-storey target, not verified completion |
| Rabindra–Nazrul | Five-storey foundation; extension of 3rd, 4th, 5th floors | Five-storey target, not verified completion |

The plan is from 2020, not a November 2026 survey. Its actual/target columns must not become completion claims. The 19 December 2022 on-site report says upward extensions of Business and Wazed Miah were completed a few months earlier: https://www.jagonews24.com/campus/news/818981 . A 3 September 2023 lift report specifically describes Business's fifth/sixth-floor extension: https://shikshabarta.com/157002/ . An earlier 19 October 2020 on-site accident report calls Business a six-storey construction project: https://www.banglatribune.com/amp/country/khulna/648402/ . Prefer the full discovered canonical article if adding it to sources; the short numeric route may redirect.

Practical correction: Business six and Ibn Sina five have substantially better support than the original report's undifferentiated unknown. Use provenance such as `reported storeys, plan plus later completion report`; do not call the derived 3.2 m/storey height measured, do not overwrite OSM's separate four-level Applied Science relation, and do not assume all wings/rooftop cores have equal elevation. Mir Mosharraf four and Rabindra–Nazrul five remain planned targets pending later completion evidence.

Also checked the official scanned Annual Report 2022, pp. 35–36: https://www.iu.ac.bd/public/images/notice/Annual_Report_2022.pdf . P35 describes nine ten-storey projects and seven upward extensions as ongoing; no exact tower locations. P36 library description supplies no storey count that resolves the conflict. The development-photo page 139 may be useful historical construction imagery, but it is not georeferenced.

### Shaheed Minar, brick memorial and fountain are an adjacent group

New combined aerial/night photograph, CC BY-SA 4.0, Mahmudul Hasan Arif:
https://commons.wikimedia.org/wiki/File:Shahid_minar_and_Monument.jpg

This directly shows three distinct structures: white-frame Shaheed Minar on the left, brick memorial on the right, and Sotota fountain between them closer to the camera. These are image-relative directions, NOT north/east. The image has no geocoded location; Commons description says 15 April 2021 while EXIF generation says 8 March 2021. Treat as historical 2021 imagery with date conflict. Scratch download: `work/shaheed-night-2021.jpg` in the current chat folder.

Independent on-site report explicitly places Sotota between the Shaheed Minar and memorial and says it was out of operation in October 2022: https://dhakamail.com/education/44928 . January 2024 follow-up likewise reports disrepair: https://www.risingbd.com/campus/news/538854 . Thus a permanently operating/pristine present-day fountain is not supported.

The existing Shaheed Minar photo's point **23.721893, 89.153953 is explicitly CAMERA location**, not an object center: https://commons.wikimedia.org/wiki/File:Shahid_Minar_IU.jpg . Do not drop the monument directly on it or infer orientation from it. The 22 January 2011 contemporary foundation report places the Minar south of the main gate: https://bangla.bdnews24.com/campus/article475628.bdnews . This establishes a search region, not a precise anchor. The three structures are not individually tagged in the audited OSM. Current map alignment could not be safely resolved from the oblique/night images.

Practical implementation: three separate reusable models and provenance records are justified. Placing their production geometry still needs an orthorectified/site reference or user-verified anchors; keep that step explicitly unresolved.

### Better brick memorial shape reference

CC0 aerial photograph, AKA Mahmudul, 2 April 2021:
https://commons.wikimedia.org/wiki/File:Shahid_Monument,_architectures_of_Islamic_University,_Bangladesh.jpg

Visually inspected local scratch `work/brick-aerial-2021.jpg`. It shows the thick curved outer barrel-vault-like shell, flat open portal layers inside, white curved relief walls on both sides, raised platform/approach, rear lawn and informal paths. This is better shape evidence than the existing front-only photograph; no geotag or dimensions. The broad shell must not be modeled as a zero-thickness arch face.

### Mukta Bangla location caveat and 2026 existence

Wikipedia gives a north-of-main-gate relationship and administration to west, but its printed longitude is **90.1526242**, outside this campus: https://en.wikipedia.org/wiki/Mukta_Bangla_(Islamic_University) . Do not silently change that to 89.1526242 and label it verified. Existing Commons photograph has no verified object coordinate: https://commons.wikimedia.org/wiki/File:Mukta_Bangla_Sculpture,_Islamic_University,_Bangladesh.jpg .

25 March 2026 campus feature supports continued recognition/existence and describes seven arches, fist/rifle, red/white/green palette and ceramic/stone/mosaic materials: https://www.jugantor.com/tp-campus-tarunno/1080513 . It gives no coordinates or dimensions. January 2026 search result reports repainting by students: https://dailyinqilab.com/index.php/bangladesh/news/842805 ; full article was blocked (403), so do not use it to assert exact current finish.

## Remaining evidence gaps

### Task 4: new ten-storey identities

Official naming and hall-opening announcements prove names and stated use, not footprint linkage. Abrar is explicitly new male hall No. 1, not necessarily either southeast `New Building` polygon: https://www.iu.ac.bd/index.php/news/details/OTEz ; https://spotlightnews24.com/campus/891358 .

28 April 2022 contemporary siting report places one new male hall in front of Lalon Shah Hall and one new female hall west of former Sheikh Hasina / July-36 Hall: https://www.ajkerpatrika.com/bangladesh/khulna/ajp3imnfh4cac . This is useful locality evidence but neither numbered hall identity nor exact footprint. Do not assign w1317423253/w1317423254 or create a new footprint from it. New administration w929202651 remains a candidate requiring a dated spatial match. Kobi Golam Mostafa remains a named ten-storey project with no verified footprint here.

### Task 9: library

Official current overview still explicitly says three-storey: https://iu.ac.bd/index.php/pages/view_1/Nzc= . Historical photo appears to contain four window bands; this is not resolved by the 2022 annual report. Keep both facts and the unresolved status. Do not infer four floors from bands or claim three is independently surveyed in November 2026.

### Tasks 16/17: roads and wall

No trustworthy road-specific width measurement or wall-segment coordinates found in this pass. The 24 September 2025 on-site security report documents low/broken/missing western enclosure and collapse near Shah Aziz Hall: https://en.bonikbarta.com/bangladesh/Jt4KuaecEDOYfFrm . These are qualitative locality reports; neither property polygon nor hall center defines damaged wall geometry. Retain road width defaults as estimates, offer per-way sourced overrides, and require surveyed/traced segments before adding physical wall collision. Do not wrap the entire campus polygon in a continuous wall.

## Handoff

7 November 2026 — Codex research subagent: added this note and temporary reference/PDF inspection files in the current chat's `work/` only. Repository remained unchanged. Root agent owns any repository source-register/manifest additions, AGENT_HANDOFF entry and model implementation. Most useful immediate additions are sourced five/six-floor academic records, the Minar/memorial/fountain shared grouping, and the thick-shell memorial reference. Exact map anchors and current per-wing elevations remain field-verification work.
