# Shanti Vikasa shop register · 1.0.3

The existing cream and dark-red shop register, with offline Windows storage and a connected website for Vercel. The Windows app and website share inventory and receipts through an authenticated API and a Turso SQL database. Database credentials stay on the server.

## What changed

- **Manage categories** in Inventory removes a category and moves its products to Other. Products, quantities, photos, and receipts are kept. Removed categories stay removed across offline synchronization; they can be explicitly added again.
- **Sales & reports** provides daily, Monday–Sunday weekly, and calendar-month views. Choose a date, see sold quantities and current stock, payment totals, discounts, tax and average receipts, and export the report or all receipts for that period. Reports include all matching sales, not just the last 100.
- Receipt and QR printing use a separate print layout outside the modal, with item rows, quantities and totals and normal page flow for long receipts.


- Create categories from **Add category** in Inventory, the register, or the product form. Empty categories remain available; names are normalized and duplicates are merged without case sensitivity.
- Categories sync in both directions, including offline additions, and are included in backups. Existing categories, stock counts, receipts and photos are retained.
- On the first launch over an earlier installation, a `before-category-upgrade` database backup is created before the database version advances to 5.

## Updating an existing Windows installation

Deploy this website revision, then close the Windows app and run `ShantiVikasa-Setup-1.0.3.exe` using the same Windows account. Do not uninstall or restore a backup as part of the update. The installer uses the same app ID, installation folder and data directory. It replaces the application files, while the database and connection settings are retained.

Update every connected PC to 1.0.3 before assigning products to custom categories. Earlier apps cannot interpret those products; the API returns a clear upgrade message and keeps local data. Version 1.0.3 also refuses to replace local data with a snapshot from a website that has not yet received this update. The build applies the additive category migrations without reseeding inventory or receipts.

## Other register features

- Add, preview, replace, and remove product photos. JPG/PNG/WebP files are resized to a maximum 1,280 pixels and stored as JPEG. Original catalog photos remain unchanged.
- Remove products from inventory without deleting past receipts. Removed product codes stay reserved.
- A persistent SQLite queue uploads offline changes. The Windows app syncs on startup, after changes, and every 15 seconds while connected. The website refreshes every 15 seconds.
- Repeated uploads cannot record a sale twice. Concurrent online checkouts use transactional revision checks. Conflicting edits are shown for review.
- Local backups include custom photos. Restoring a backup makes a safety copy and disconnects that computer from the website to avoid overwriting online data.

## Run and test

Use Node.js 24.

```sh
npm ci
npm test
npm run typecheck
npm run build:desktop
npm start
```

`npm run dev` opens an isolated development register. It creates a temporary SQLite database and bypasses login **only in the development test configuration**. It never connects to the shop's database. Vercel uses the normal production build and requires sign-in.

## Deploy the website to Vercel

1. Import `magician-sam/shantivikasa` in Vercel. Keep the root directory at the repository root. `vercel.json` configures the build and API routes.
2. Connect a **Turso / libSQL database** and add its `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to this Vercel project's production environment. The URL begins with `libsql://` or `https://`. Use a separate database for preview deployments.
3. Run `npm run login:setup` locally. Choose a unique shop password. Put the generated `REGISTER_PASSWORD_HASH` and `REGISTER_SESSION_SECRET` in Vercel's production environment. Do not paste secrets into GitHub or commit them.
4. Redeploy. The build applies the checked-in SQL migrations automatically when the database variables exist. It does not seed or replace shop data. Without configuration, the website shows setup status and refuses access to shop APIs.
5. Open the website and sign in with the shop password.
6. In Windows 1.0.3, select **Connect website**, paste the Vercel production URL, and sign in. The first connection imports the current PC's inventory, receipts, and photos into the empty online database.

If the website already has data, the Windows app asks you to explicitly download it. A safety backup is saved before replacing local data. The original `shantivikasa.com` storefront is separate; this app does not change Shopify.

## Offline and conflict handling

Every completed local sale and inventory edit is committed together with its outgoing sync event. A connection failure leaves both on the PC. Sales use stable receipt references, so the printed reference stays the same when the online register assigns its ledger sequence.

Unrelated product edits merge. If both devices change the same field, syncing pauses on that event and offers **Keep this computer’s edit** or **Use online edit**. A safety backup is made before resolving the conflict.

Offline devices cannot reserve stock from each other. If an offline sale exceeds the remaining online count, it stays saved locally and waits for a stock correction online. Review the physical count and the unsynced sale before correcting the online stock; then select **Sync now**. A completed sale is never discarded by the conflict buttons.

The website requires internet. The Windows app works offline. All monetary amounts are integer cents. Card checkout only records an externally completed payment.

## Windows identity and data

- Database: `%APPDATA%\ShantiVikasa\register.sqlite`
- Installation: `%LOCALAPPDATA%\Programs\ShantiVikasa`
- App ID: `com.shantivikasa.register`
- Electron runtime: pinned to **44.2.0**

Existing shop data is authoritative. The seed is only read for a new database. This public repository includes the 27 original products and original photos, with **no live sales, SQLite backups, passwords, or tokens**. The installer built from this repository contains the public catalog seed and no live receipts. Existing installations retain their own inventory and receipts automatically.

To build an installer, install Python 3.11+ and NSIS 3:

```sh
python scripts/build-windows.py
```

The build verifies Electron's official SHA-256, builds the renderer, and creates `release/ShantiVikasa-Setup-1.0.3.exe`. A private original seed can be supplied with `--seed-snapshot /path/to/private-snapshot.json`. Do not commit that file.

See `VERIFICATION.md` for tested behavior and remaining real-device checks. The installer is unsigned; Windows may show an unknown-publisher warning.
