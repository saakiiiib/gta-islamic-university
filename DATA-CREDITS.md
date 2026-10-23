# Map data credits and data license

**© OpenStreetMap contributors**

- Attribution and copyright: https://www.openstreetmap.org/copyright
- Data license: Open Data Commons Open Database License 1.0 (ODbL): https://opendatacommons.org/licenses/odbl/1-0/
- Original source: the user-supplied `map.osm` export for Islamic University, Kushtia, Bangladesh.
- Bundled source file: `public/data/map.osm`, copied unchanged from the supplied file.

The OSM database is available under ODbL 1.0. The generated map model derives from that data; these data rights and attribution are retained. Application code, character geometry and illustrative materials are separate from the OSM data license. No Google Maps imagery or paid map API is used. The game does not request map tiles at runtime.

Source snapshot: 3,260 nodes, 482 ways, 14 relations. The selected context contains 189 building footprints, 42 road/path ways, 16 green features, four water features, one footbridge, one tree point and one tree row. Heights, widths, façades and flat terrain are documented approximations in README.md.

Geometry repair: the two orphan inner rings of source relation `18079383` are associated with their unique enclosing existing building relation `18079382` during import. This does not add a new geographic footprint and does not alter the raw export. Incomplete administrative boundaries are excluded from gameplay.

The production build includes `data/map.osm` and this notice as `data/NOTICE.txt`.
