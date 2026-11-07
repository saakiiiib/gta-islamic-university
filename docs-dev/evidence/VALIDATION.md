# Research validation — 7 November 2026

Base application commit: `0433e85130ad0b52aec00e77338f4e5fc81da15b`.

- Existing application suite: `npm test` — **243 passed, 0 failed, 0 skipped**. Used existing installed dependencies.
- Existing application bundler: direct Vite build with output redirected to this task's scratch directory — **passed**. Existing warning: main bundle exceeds 500 kB after minification. This bypassed `prebuild`; it is not a fresh-install/full npm build validation.
- Standard `npm ci` and `npm run build` are specified in follow-up task 1; no workflow is introduced in this research commit.
- Image audit: **33 JPEG files decoded successfully**, all SHA-256 values match `references/campus/image-manifest.json`, all have a Commons source URL and named author. License distribution: **14 CC0**, **15 CC BY-SA 4.0**, **4 CC BY-SA 3.0**. Each license was checked before download.
- Map audit: successful Overpass and official OSM map API responses are retained with their reproducible query and comparison inventory. Declared Overpass base timestamp is older than retrieval day; do not label it November-current survey data.
- Scope audit before staging: tracked application source, source OSM, prepared data, package files, tests and deployment files have no changes. Added research files are confined to `docs-dev/`, `references/campus/` and the new root `AGENT_HANDOFF.md`.

These checks establish the research's scope and consistency. They do not establish real-world measurements or a new browser gameplay test.
