# Task 6 Report

## Summary

- Locked `frontend` to `es-toolkit@1.50.0` as an explicit dependency and override, then regenerated the install state with a clean `npm --prefix frontend ci`.
- Added a regression/integration test file that proves the frontend build emits the `EvolucionPrecios` chunk and that the staged offline release can satisfy real `npm ci --offline` installs for backend and frontend.
- Added `scripts/create-offline-release.js` plus `npm run release:offline` to stage an offline release with:
  - the repository tree without `node_modules`;
  - `frontend/dist`;
  - backend/frontend lockfiles;
  - a dedicated `.npm-cache` warmed from both lockfiles;
  - a small `OFFLINE-INSTALL.txt` instruction file.
- Added `docs/operations/offline-install.md` documenting generation and installation of the offline package.
- Declared an explicit local system font fallback in `frontend/src/index.css`. No runtime CDN or remote font references were present in the built frontend after verification.

## Root Cause

The failing build was not caused by app code in `EvolucionPrecios`. `recharts@3.10.1` imports `es-toolkit/compat/*`, and the existing frontend install had an incomplete `frontend/node_modules/es-toolkit` tree without the `compat` directory. After locking `es-toolkit` directly and reinstalling from the updated lockfile, `es-toolkit/compat/sortBy` resolved correctly and the production build succeeded.

## Verification

Executed on 2026-08-15:

- `node --test test/scripts/offline-release.test.js`
  - Passed.
  - Confirms `npm --prefix frontend run build` succeeds and emits the `EvolucionPrecios-*.js` chunk.
  - Confirms `node scripts/create-offline-release.js --output <temp>` stages a package whose backend and frontend both pass `npm ci --offline --cache .npm-cache`.
- `npm run verify`
  - Passed.
  - Backend: `183` node tests passed.
  - Frontend: `10` Vitest files / `59` tests passed.
  - `oxlint` exited successfully with pre-existing warnings in unrelated frontend files.
  - `vite build` succeeded and emitted the production chunks, including `EvolucionPrecios-Bju4emGz.js`.
- `git diff --check`
  - Passed.

## Notes

- Unrelated untracked plan files were present before finishing:
  - `docs/superpowers/plans/2026-08-15-clientes-lan-offline.md`
  - `docs/superpowers/plans/2026-08-15-recepciones-historial.md`
- They were left untouched and should not be included in the task commit.
