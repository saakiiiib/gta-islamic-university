# Pull request checks

The workflow `.github/workflows/pr-checks.yml` uses Node 24.17.0 and runs `npm ci`, `npm test`, then `npm run build`. A failing command fails the job. It runs on pull requests or manual dispatch, with read-only repository permissions and no deployment step. Action revisions are pinned.

The build invokes campus preparation and may regenerate `src/generated/`. Review those changes when generator inputs change; CI runs in an ephemeral checkout and does not commit generated files. `dist/` is ignored. This workflow does not deploy the Pages site or change branch-protection settings.
