# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**sukhBackv2** (`package.json` name `amarsukhback`) is the Express REST API backend for "Amar Sukh" — a condo/apartment (СӨХ) and parking management platform for the Mongolian market. It is the backend counterpart of the `sukhWeb` frontend (`D:\Work\sukhWeb`, Next.js). Route, model and field names are Mongolian business terms — keep this convention when adding code.

This is a production application (deployed via PM2) — treat production as high-risk; do not run `pm2`/`update` scripts yourself without explicit approval.

## Commands

```
npm start            # node index.js
npm run pm2          # pm2 start ecosystem.config.js
npm run pm2update    # pm2 restart amarSukhBack
npm run update        # git pull && pm2 reload amarSukhBack  — do not run this yourself
npm test / npm run e2e   # node scripts/e2e.js
npm run callbacks     # node scripts/callback-storm.js
npm run invoices      # node scripts/invoice-stress.js
npm run payments      # node scripts/qpay-payment-test.js
```

Several of the `test`/`e2e`/stress scripts under `scripts/` exercise real flows (invoicing, QPay payments) — read them before running; do not invoke scripts that hit real payment/SMS/ebarimt endpoints unless you are certain they're pointed at a non-production target. `tests/unit` holds actual unit tests, if any.

## Architecture

### Multi-tenant pattern (`zevbackv2`)

This backend is built on the private shared package **`zevbackv2`** (resolved from a local Verdaccio registry, not public npm — read its source in `node_modules/zevbackv2` when behavior is unclear). Key convention, shared with every other backend in this product family (`tureesBack`, `fsmBack`, `irtsBack`, `systemiinUdirdlaga`, `posBack`/`posBackv2`, `emBack`, `first-app`):

- `db.kholboltUusgey()` builds one **master** connection (`erunkhiiKholbolt`, "undsenBaaz") plus one Mongoose connection **per organization** (`db.kholboltuud`, keyed by `baiguullagiinId`), so each organization's data lives in its own physical MongoDB database.
- `tokenShalgakh` middleware (from `zevbackv2`) decodes the JWT, resolves the caller's org-specific connection, and injects it as `req.body.tukhainBaaziinKholbolt`. Global/shared collections (`baiguullaga`, `khariltsagch`, etc.) instead use `req.body.erunkhiiKholbolt`.
- Model files export a **factory function** `(conn) => conn.kholbolt.model(...)`, not a model instance — the same schema binds to N different per-organization databases.
- `crud(router, "<model>", Model, ...)` (from `zevbackv2`) auto-generates generic REST CRUD per model — many list/detail/delete calls need no bespoke controller, just schema + route wiring.

Before touching connection setup, read `zevbackv2`'s `db` module in `node_modules/zevbackv2` rather than assuming standard single-connection Mongoose.

### Folder map

- `routes/` — one file per domain area (contracts `gereeRoute`, parking `parkingRoute`/`zogsool*`, invoicing `nekhemjlekhRoute`, e-receipts `ebarimtRoute`, QPay `qpayRoute`/`walletQpayRoute`, reports `tailanRoute`/`biTailanRoute`, audit `auditRoute`, AI assistant `aiTuslakhRoute`).
- `controller/` — route handler logic.
- `services/` — business services: `invoiceService`/`invoiceSendService`/`invoiceDeletionService`/`invoiceZardalService`/`invoicePreviewService` (invoicing pipeline), `guilgeeService` (transactions), `walletApiService`, `smsService`, `addressService`, `auditService`, `tureesParkingService`/`zochinTureesSyncService` (sync with the `turees`/Rently parking product).
- `models/` — Mongoose schemas (factory-function style, see above).
- `middleware/` — `auditMiddleware`/`auditWrapper`/`crudAuditWrapper` (change-history logging — see `docs/BACKEND_HISTORY_LEDGER.md`), `cacheMiddleware`, `requestTiming`, `firebase-config`.
- `scratch/` — one-off inspection/repair scripts for production data incidents (ebarimt/qpay reconciliation). These are historical debugging tools, not application code — do not wire them into routes, and do not run the destructive ones (`delete_*`, `remove_*`, `void_*`, `bill_all_*`) against production data without explicit approval.
- `docs/BACKEND_HISTORY_LEDGER.md` — chronological record of backend changes/incidents; check it before assuming a field or behavior is unexplained.
- `tokhirgoo/` — environment config loading (dotenv-style), not committed secrets.

### Dependencies worth knowing about

`quickqpaypackv2`, `quickqpaypackvSukh`, `sukhParking-v1`, `zevbackv2`, `zuragpack` are private packages from a local registry (`http://103.143.40.90:4873` / `http://103.236.194.68:4873`), each with its own repo on disk under `D:\Work`. When a bug seems to originate inside one of them, read/fix it in its own repo, not by monkey-patching from `sukhBackv2`.

## Domain glossary (Mongolian → English)

| MN term | English | | MN term | English |
|---|---|---|---|---|
| sukh / СӨХ | condo owners' association | | zogsool | parking |
| geree | contract / lease | | khariltsagch | client / tenant |
| guilgee | transaction | | nekhemjlekh | invoice |
| ebarimt | e-receipt (tax e-invoice) | | tailan | report |
| zaalt | meter reading | | tseverlegee | cleaning |
| urgats | (see `urgatsRoute`/`UrgatsBeltgegch`) | | tokhirgoo | settings/config |

## Notes

- This repo had uncommitted local changes at the time this file was written — do not assume `git status` is clean, and do not revert/discard existing working-tree changes.
- Do not call real QPay/ebarimt/SMS endpoints, restart PM2, or run production-affecting scripts without explicit approval.
