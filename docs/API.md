# sukhBackv2 API Map (module-level)

> **Scope note:** this is a module-level map — one row per file in `routes/`, with an approximate count of
> custom (non-generic-CRUD) endpoints found via `grep -r "router\.(get|post|put|delete|patch)" routes/`, plus
> the domain each module covers. It does **not** cross-reference every frontend call site line-by-line the
> way `turees/docs/API-MAP.md` does (that was built by a dedicated scan script over one repo pair). Doing that
> by hand for every backend in this workspace was out of scope for this documentation pass — treat this file
> as "what lives where," and use `routes/<file>.js` + sukhWeb's `src/lib/endpoints.ts`/`use*.tsx` hooks for the
> exact contract when making a change.

## Mount point

All routers are mounted (see `index.js`) at root; most routes are protected by `zevbackv2`'s `tokenShalgakh`
middleware, which resolves the caller's org-specific Mongoose connection into `req.body.tukhainBaaziinKholbolt`.

## Modules

| Route file | Custom endpoints | Domain |
|---|---|---|
| ajiltanRoute.js | 12 | employee accounts, auth, permissions |
| auditRoute.js | 5 | change-history / audit log (`auditMiddleware`) |
| baiguullagaRoute.js | 9 | organization + building config |
| bankniiGuilgeeRoute.js | 6 | bank transaction import/reconciliation |
| gereeRoute.js | 14 | contracts / leases (core ledger) |
| khariltsagchRoute.js | 8 | clients / tenants |
| orshinSuugchRoute.js | 20 | residents |
| gerBuliinGishuunRoute.js | 8 | resident household/family members |
| parkingRoute.js | 24 | parking (legacy-named module; see also zogsoolRoute/zogsoolQrRoute) |
| zogsoolRoute.js | 4 | parking (zogsool-named module) |
| zogsoolQrRoute.js | generic CRUD only | parking QR entry/exit |
| walletRoute.js | 27 | resident/tenant wallet balance + top-up |
| walletQpayRoute.js | generic CRUD only | QPay top-up for wallet |
| walletTailanRoute.js | 1 | wallet reporting |
| qpayRoute.js | 13 | QPay payment gateway (live external service) |
| ebarimtRoute.js | 12 | e-receipt / tax e-invoice (live external service) |
| nekhemjlekhRoute.js | 8 | invoices |
| nekhemjlekhiinZagvarRoute.js | generic CRUD only | invoice templates |
| dansRoute.js | generic CRUD only | account (`dans`) |
| tailanRoute.js | generic CRUD only | reports |
| biTailanRoute.js | 1 | BI-style report |
| medegdelRoute.js | 14 | notifications |
| msgRoute.js | generic CRUD only | messaging |
| mailRoute.js | 1 | email sending |
| blogRoute.js | 5 | posts / articles (niitlel) |
| sanalAsuulgaRoute.js | 6 | surveys |
| tseverlegeeRoute.js | 4 | cleaning domain |
| udriinKhaaltRoute.js | 6 | daily closing |
| urgatsRoute.js | 1 | `urgats` domain (see `UrgatsBeltgegch` service — domain-specific, not fully glossaried) |
| ashiglaltiinZardluudRoute.js | 8 | operating cost line items |
| gereeniiZagvarRoute.js | 2 | contract templates |
| zochinUrikhRoute.js | 8 | guest invitation |
| zochinZogsoolRoute.js | 2 | guest parking |
| uneguiMashinRoute.js | 3 | whitelisted/free-pass vehicles |
| cameraRoute.js | 1 | camera/LPR integration |
| cronScheduleRoute.js | 3 | scheduled job configuration |
| shinechleltRoute.js | 3 | app update/changelog |
| appVersionRoute.js | 2 | mobile/app version gating |
| licenseRoute.js | 1 | license/subscription check |
| pdfRoute.js | 2 | PDF generation |
| transformationRoute.js | 1 | one-off data transformation |
| neeyeRoute.js | 3 | gate/door "open" action |
| aiTuslakhRoute.js | 2 | AI assistant |
| redisClient.js | — | not a route file — Redis client setup, re-exported from `routes/` for historical reasons |

## External/private dependencies touched by these routes

- `zevbackv2` — connection management, `tokenShalgakh`, generic `crud()`.
- `sukhParkingV1` — parking vehicle/fee/violation models used by `parkingRoute.js`/`zogsoolRoute.js`.
- `quickqpaypackvSukh` + `quickqpaypackv2` — QPay payment flows (`qpayRoute.js`, `walletQpayRoute.js`).
- External ebarimt tax API (`ebarimtRoute.js`), SMS gateway (notification sends), Firebase (`middleware/firebase-config`).

## Frontend consumer

`sukhWeb` (`D:/Work/sukhWeb`) is the only known consumer, via `src/lib/uilchilgee.ts` + `src/lib/endpoints.ts`
and per-model `src/lib/use*.tsx` SWR hooks.

---
_Generated 2026-11-10. If you need the exact method/path list for a module, grep that file directly —
this doc is a navigation aid, not a contract._
