# Road dimensions and surfaces

Task 16 attaches widthEvidence and surfaceEvidence to every derived road/bridge. Valid parsed OSM width has precedence, followed by a validated source-backed override, followed by the existing class default. Mapped values are not independently surveyed. The override file starts empty because no current width survey was found.

All 40 campus roads keep their previous widths and exact buffered polygons: service/unclassified 6 m, paths/footways/cycleways/pedestrian 2.2 m, tertiary 8 m, trunk 7 m, remaining 6 m. All are low-confidence inferred defaults, measured=false. Only way276712534 has a mapped surface (asphalt); other surfaces stay unknown even though art materials exist. Bridge width remains2.2 m and vertical/ramp defaults are not surveyed. Source tags and one-way routing metadata stay intact.

The [dated per-road register](evidence/road-survey-register.json) provides every typed ID and its source status. Survey priorities are main-gate approach w975575586, academic loop, hall access and lake footpath/bridge w1317423268. Capture dated perpendicular widths, surface/edges, junction turning clearances, curb ramps and entrance connections, with a georeferenced station for each measurement. Do not infer lane widths or pavement material from highway class or one-way tags.

Acceptance for measured widths/surfaces remains pending. This task makes existing guesses visible and gives verified evidence a strict entry point without changing navigation or collision. Twenty-two focused map/width tests pass, including metre/foot parsing through the map pipeline, explicit-source precedence, invalid evidence, actual polygon identity and raw-tag retention. Standard preparation/build passes; full hosted checks cover navigation/vehicles.
