# Version 1.0.3 expanded register update

- 26 automated checks cover authentication, checkout/stock, photos, backups, upgrade preservation, category creation/removal/recreation, stale offline edits, duplicate/replayed sync operations, and sales reports.
- Reports are tested for local-day boundaries, Monday–Sunday weeks, leap months, more than 100 receipts, removed-product history, accurate discounts/tax/payment totals and agreement between desktop and server.
- Category removal atomically reassigns products to Other without deleting stock or receipts. Removal state survives backup and sync; the Other fallback is protected.
- Desktop database schema 5 prevents older applications from silently reopening data with unsupported category semantics. A pre-upgrade backup is retained.
- Cloud integration tests use an isolated in-memory libSQL database; desktop persistence tests use real on-disk SQLite databases. This avoids Windows cleanup locks in the native libSQL test binding.
- The Windows build runs scripts/verify-ui.cjs against the actual Electron renderer and isolated app data, then scripts/verify-pdfs.py checks that generated PDFs contain item names, quantities, prices, totals and the final line of a long receipt.
- TypeScript and production builds pass. The native UI/PDF script is configured as a Windows CI gate, but has not run for this release yet: this workspace prevents Electron from opening its required socket. Windows launch, generated PDFs and a physical printer still require verification; no shop data is used by the automated checks.

## Previous release verification

# Version 1.0.2 category update

- 20 automated tests pass, including the previous authentication, checkout, stock, photo, backup and sync tests.
- Added coverage for empty-category persistence, two-device concurrent category creation, case/Unicode duplicate handling, rejected invalid names, offline queue replay after a lost acknowledgement, and an addition made during an incoming sync.
- Verified custom product assignments and empty categories survive backup/restore together with photos and receipts.
- Upgraded a database created by the actual 1.0.1 store implementation: inventory, receipts, photos, outgoing events and connection settings were retained. A schema-3 backup was saved before advancing to schema 4.
- Verified older desktop clients receive an explicit upgrade response for custom-category inventory, and new clients retain local data when the server has not been updated.
- TypeScript check and production renderer build pass.
- Interactive browser verification could not run in this workspace: the browser refused the local preview connection. A real Windows launch and manual category-form check remain device checks.

# Verification · 1.0.1

The supplied attachments contained the released 1.0.0 source and installer. They did not contain `desktop-current/`, `PHOTO-UPDATE.patch`, or the newer handoff's other named checkpoint files. This update extends the supplied source; it does not claim to include missing work.

## Automated checks

`npm test` exercises the real desktop SQLite store, the shared server business rules, and an isolated libSQL database using the same SQL adapter as Turso. Coverage includes:

- Existing checkout atomicity, stock validation, idempotency, integer-cent arithmetic, duplicate-code and stale-edit rejection.
- Desktop-to-online and online-to-desktop product/photo changes, item removal, and preserved receipts.
- Persistent outgoing events, lost acknowledgements, retry deduplication, and interrupted first import recovery.
- A local edit during a remote download, concurrent web checkouts, and recoverable offline stock conflicts.
- Same-field conflict resolution and independent-field merging.
- Schema 1 upgrade, stock/receipt preservation, custom-photo backup, and restore to a clean directory.
- Unauthorized/cross-origin requests, invalid photo types, password verification, session tampering, expiry, and password rotation.

`npm run typecheck` checks the app, its imported UI components, shared frontend types, and database/build configuration. The supplied source contains additional unused UI components whose optional packages were never included; they are not application entrypoints.

## Browser checks

Using the actual React interface and an isolated SQLite database, a JPG was chosen, previewed, saved as a new product, shown in Inventory, and reopened with its saved photo. The edit form was visually inspected. The replacement/removal buttons were visible, but further browser interaction was blocked by the automatic approval system. Those remaining UI clicks are not claimed as verified; photo changes/removal and inventory removal are covered by the automated database tests.

## Delivery status

The source repository is `magician-sam/shantivikasa`. The user installed the GitHub App and granted this repository access after the original HTTP 403. Vercel and its online SQL database still require setup. The earlier Vercel preview attempt was rejected by automatic approval review because of the session usage limit; no website or online database was deployed in that attempt.

## Build checks

Electron remains pinned to 44.2.0. The Windows x64 runtime is checked against the official release checksum. NSIS runs with warnings treated as errors. Existing app identity and both AppData paths are preserved.

## Limits of verification

The tests run on Linux. Windows installation/execution, Windows cookie persistence, camera access, USB scanners, and physical receipt printers require checking on the shop PC. The online database must be connected and its migrations applied before live syncing can be verified against Vercel.

The initial full import is intended for the supplied small shop register. Vercel request-size limits apply; very large historical databases may require a future paged import. Offline devices cannot guarantee stock reservations against each other; stock conflicts remain visible and local receipts are retained.
