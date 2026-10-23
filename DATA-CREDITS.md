# Map data credits and data license

**© OpenStreetMap contributors**

- Attribution and copyright: https://www.openstreetmap.org/copyright
- Data license: Open Data Commons Open Database License 1.0 (ODbL): https://opendatacommons.org/licenses/odbl/1-0/
- Original source: the user-supplied `map.osm` export for Islamic University, Kushtia, Bangladesh.
- Bundled source file: `public/data/map.osm`, copied unchanged from the supplied file.

The OSM database is available under ODbL 1.0. The generated map model derives from that data; these data rights and attribution are retained. Application code, character geometry and illustrative materials are separate from the OSM data license. No Google Maps imagery or paid map API is used. The game does not request map tiles at runtime.

Source snapshot: 3,260 nodes, 482 ways, 14 relations. The selected context contains 189 building footprints, 42 road/path ways, 16 green features, four water features, one footbridge, one tree point and one tree row. Heights, widths, façades, road edging, entry treatments, decorative planting and flat terrain are documented approximations in README.md. Labels use source names and named entrance refs; they do not introduce new landmark names. Five mapped entrance nodes are preserved as metadata.

Geometry repair: the two orphan inner rings of source relation `18079383` are associated with their unique enclosing existing building relation `18079382` during import. This does not add a new geographic footprint and does not alter the raw export. Incomplete administrative boundaries are excluded from gameplay.

The production build includes `data/map.osm` and this notice as `data/NOTICE.txt`.

The electric cargo tricycle and pedestrian characters are original procedural Three.js geometry. The van's shape/paint is inspired by the user's supplied visual reference; no reference bitmap, watermark or third-party game model is included. These game actors and their spawn/route choices are illustrative additions, not surveyed OSM objects. Campus geographic data and attribution remain unchanged.

The four MP3 reaction recordings under `public/audio/npc/` were supplied by the project owner and are copied unchanged. Near-miss and collision categories are separate; transcripts are not displayed. No synthetic voice files, synthesizer, paid service or remote audio service is used. See `public/audio/README.txt`. Roadside walking corridors are navigation estimates derived from the existing road centre lines, not newly surveyed paths or map geometry. Drivers, passengers, health and damage are fictional gameplay behavior.
