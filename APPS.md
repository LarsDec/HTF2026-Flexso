# Apps and ownership (read this before you add or change an app)

Goal: four villagers, four apps, built in parallel without merge conflicts.

## One app per villager, one owner per file group

| Villager | App folder (`src/`) | App id / namespace | `mountPath` | `semanticObject` | Backend files (only this app's owner edits them) |
|---|---|---|---|---|---|
| Maren Holt (water) | `water-app` | `water.pipes` | `/app/water` | `WaterPipes` | `srv/water-supply-service.{cds,ts}`, `srv/domain/water-health.ts`, `priority.ts`, `repair-status.ts`, `pipe-overview.ts`, `source-conflict.ts`, `numbers.ts` (shared helper) in `srv/domain/` |
| Tobin Reyes (baker) | `food-app` | `food.pantry` | `/app/food` | `FoodPantry` | `srv/food-stock-service.{cds,ts}`, `srv/domain/food-*.ts` |
| Rowan Ashby (council) | `council-app` | `council.overview` | `/app/council` | `CouncilOverview` | new `srv/council-service.{cds,ts}`, `srv/domain/council-*.ts` |
| Ilse Vermeer (library) | `investigation-app` | `investigation.records` | `/app/investigation` | `InvestigationRecords` | new `srv/investigation-service.{cds,ts}`, `srv/domain/investigation-*.ts` |

## Rules that prevent conflicts
1. **Unique values per app**: folder name, `sap.app.id` / `@namespace` (everywhere identical), `mountPath`, `semanticObject` (the launchpad uses it as tile key; a duplicate silently replaces another tile), and a different icon.
2. **Never edit another villager's app folder or service files.** Need data from another service? Read it over OData, or ask its owner.
3. **New logic goes in a new file**, not in a shared one: pure functions in `srv/domain/<villager>-*.ts`, tests next to it (`*.test.ts`).
4. **Shared files** (`db/schema.cds`, `db/data/*.csv`, `package.json`, `AGENTS.md`, `srv/server.ts`, `tsconfig.json`): change only after telling the team in the chat; keep the change small and additive (a new entity or a new script, never a rewrite).
5. **Computed fields** are `virtual` elements filled in an `after('READ')` handler of the owner's own service; the UI never calculates.
6. After every change: `npm run typecheck`, `npm run lint:ui5`, `npm run build`, then check the app in the browser. Run Docker with `docker compose up --build --watch`.

## Tests
`npm test` runs `srv/domain/*.test.ts` (node:test, no extra package): 71 tests, all passing. Covered: `water-health`, `priority`, `repair-status`, `pipe-overview` and `source-conflict` (one test file each). Not covered: `numbers.ts` (only indirectly), the service handlers (`water-supply-service.ts`) and all UI5 code; those are checked in the browser.
