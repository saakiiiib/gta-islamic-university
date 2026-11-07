# Courtyard-safe academic facade approximation

Only typed relations 18079381 (older Faculty Building) and 18079379 (Applied Science) receive this source-inspired arched treatment. Sources are the existing [Faculty photo](https://commons.wikimedia.org/wiki/File:Faculty_of_Arts_building,_Islamic_University,_Bangladesh.jpg) and [science-complex photo](https://commons.wikimedia.org/wiki/File:The_faculty_of_science,_Islamic_University.jpg), both historical 2021 views. Exact bay spacing/vertical divisions/current per-wing elevations are unmeasured.

The helper follows every original outer and courtyard wall ring, including reversed windings. It emits only wall-plane details, never a courtyard roof or floor; original extrusion/height/collision remains caller-owned. Entry zones clear decorative infill. Both returned geometries are batched once per building and disposed through the existing world batches. Other identities use the generic fallback; the disputed library is excluded.

Each actual building uses fewer than 3,600 added facade triangles, below the 20k cap. Six facade/integration tests plus five registry tests pass; standard build/preparation passes. Browser visual review remains pending. Historical pale wall/roof colors are dated art observations, not measured albedo or structural-material claims.
