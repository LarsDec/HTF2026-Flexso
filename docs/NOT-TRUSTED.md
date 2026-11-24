# "Not to be trusted" mark: how every app must show it

Source: Ilse Vermeer (investigation). Her words: for each suspicious line she wants a way to mark it "not to be trusted", "so Maren, Tobin and the council don't act on it" (answer 4). A marked line "should clearly show that it is marked 'not to be trusted', so she doesn't act on it" on Maren's screen (answer 6, confirmed). What a villager does instead with it is that villager's business: ask them.

## What exists (investigation app builder)

- Table `oakhaven.curse.Distrusts` (`db/schema.cds`): `entityName` (WaterPipes, Sensors, Repairs, Landmarks, StockItems), `recordID`, `reason`, `markedBy`. No CSV, starts empty. The marked line itself is never changed; it is only a label.
- Written only through `InvestigationService` (`/odata/v4/investigation/`): action `markUntrusted(entityName, recordID, reason, markedBy)` and `clearUntrusted(entityName, recordID)`. Suspicious lines are listed at `/odata/v4/investigation/Findings` (computed, rules in `srv/domain/investigation.ts`). UI: `src/investigation-app` (`/app/investigation`).
- Helpers in `srv/lib/distrusts.ts`: `markUntrustedRows(entityName, results)` fills the virtual fields on rows; `markUntrustedSensorsOnPipes(results)` adds the sensor marks to pipes.
- Virtual fields on a service entity: `untrusted` (Boolean), `untrustedReason`, `untrustedBy`, `untrustedAt`. Water service: WaterPipes, Sensors, Repairs, Landmarks (pipes also `untrustedSensorIDs/Reason/By/At` for a marked sensor on that pipe). Food service: StockItems.

## What your app has to do

1. Add the four virtual fields to the entity you show (copy the pattern from `srv/water-supply-service.cds`) and call `markUntrustedRows('<Entity>', results)` in an `after('READ')` handler. Not a per-row query: the helper does one query for all rows.
2. Show the mark where the line is used: an `sap.m.ObjectStatus` `state="Error"`, text "Not to be trusted" with an icon, plus the reason, who and when (text + icon + colour, never colour alone). Texts in i18n.
3. Do not let the app act on a marked line (no alert, no order advice, no ranking based on it) without saying so. Show it instead of hiding it.
4. Do not calculate the mark in the UI; bind the virtual fields.

## Per app

| App | Mark on | Status |
|---|---|---|
| water-app (Maren) | pipes, sensors (SENS-004 on BAKERY-BRANCH), repairs | built, reason/who/when shown |
| food-app (Tobin, teammate) | `StockItems` (Butter −3 is impossible; Ilse and Tobin both flagged it) | service fields prepared in our branch, app display to do |
| council-app (Rowan, teammate) | everything he decides on (pipes, stock, repairs) | to do: ask Rowan what he wants to see for a marked line |
| investigation-app (Ilse) | sets and clears the marks | built |

## Open

- Ilse did not say whether a marked line should be hidden or corrected. Only "marked, so nobody acts on it".
- Rowan and Tobin have not been asked yet what they do with a marked line (Maren: asked, answer pending).
