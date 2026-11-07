# Sourced campus records

`src/data/campus-landmark-records.js` registers all 57 represented buildings by OSM type and ID. Names/aliases are research labels; raw OSM tags are retained. Each architectural field has its own value, status, confidence, source and observation date. Unknown dimensions and materials are null. The observation date is not a claim of present-day condition.

`validateCampusLandmarks(records, map.buildings)` rejects duplicates, invalid evidence, and unmatched keys. `getCampusLandmark(feature)` requires an explicit OSM type. `landmarkAppearance` applies only explicitly selected observed/reported medium/high-confidence color fields. Planned and provisional fields never activate rendering. No color or height override is activated in task 2; later tasks add dated observations individually.

The parser preserves typed identity; building palettes consume the lookup and the world exposes matched records for inspection. Source preparation includes src/data in its fingerprint, so changes invalidate generated preparation. See campus-realism.md and references/campus/SOURCES.md for the underlying research.
