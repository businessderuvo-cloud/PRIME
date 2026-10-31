# PRIME deployment

All releases to Fly app `prime-gestionale-deruvo` must use `scripts/deploy-safe.mjs`; read `docs/SAFE-PUBLISHING.md` before publishing.

Take a live `snapshot` of the selected files before preparing the release, edit only its `files/` copies, then run `publish`. The shared queue serializes local releases and merges independent changes against the latest live image. Resolve overlapping edits against a fresh snapshot; never overwrite another task's changes or delete an active lock.

Do not call `fly deploy` directly or reuse an old Fly image as a release base. Include only authorized files and keep normal source files synchronized with the deployed edits. Deployments from another computer must use a shared server queue; the local queue does not lock out external Fly clients.
