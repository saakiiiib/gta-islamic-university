# Groves, gardens and open pitches

Task 18 uses a new deterministic reference-inspired planting plan for runtime and prepared data. The legacy planner remains available to reproduce historical fixtures; the current plan is independently compared to the preparation packet.

The [historical mango garden](https://commons.wikimedia.org/wiki/File:Cultural_function_at_mango_garden,_islamic_university_kushtia.jpg), [academic canopy](https://commons.wikimedia.org/wiki/File:Faculty_of_Arts_building,_Islamic_University,_Bangladesh.jpg) and [open field](https://commons.wikimedia.org/wiki/File:Grass_fields_at_Islamic_university_kushtia_-_2.jpg) guide character, not measured density or present species/location. Forest/wood uses 8 m art cells, orchard 9 m, garden 14 m, park 15 m, open grass/meadow 24 m. Garden candidates mix low shrubs and trees; pitches/recreation grounds receive no procedural planting.

This campus gets 300 trees and65 shrubs (previously240+48), plus the same separately mapped trees/rows. Forest200, orchard56, garden28 and park16 form the tree allocation. Counts are capped at300 trees/160 shrubs and use the existing single instanced canopy draw, with no new collision or asset downloads. Generic broadleaf art deliberately leaves species unspecified; approach palms and important individual trees require current identification before a special species model is placed. No stadium stands or unsurveyed field fixtures.

Every accepted plant passes existing road/building/water/bridge/courtyard exclusions plus radius-aware mapped-tree/row clearance. Full 2.8 m maximum canopy and1.2 m shrub envelopes keep routes clear. Source IDs/seed order make placements stable when green features are reordered. No source map mutation.

Five focused planner tests cover density/type distinctions, budgets, deterministic ordering, mapped-plant buffers and actual clearances. Preparation tests compare the current seeded plan/props to the checked-in packet while preserving original legacy hashes. Standard preparation/build passes; interactive canopy/visibility review and current tree survey remain pending.
