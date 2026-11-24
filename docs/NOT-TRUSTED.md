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
| food-app (Tobin, teammate) | `StockItems` (Butter −3 is impossible; Ilse and Tobin both flagged it) | fields ready in `FoodStockService.StockItems` (`untrusted`, `untrustedReason`, `untrustedBy`, `untrustedAt`); display is up to the food-app builder, not bound yet |
| council-app (Rowan, teammate) | everything he decides on (pipes, stock, repairs) | to do: ask Rowan what he wants to see for a marked line |
| investigation-app (Ilse) | sets and clears the marks | built |

## For the food-app builder (Tobin)

Status: the fields below are ready on the service. `src/food-app` does not bind them yet. What follows is our reading (an assumption) until Tobin has been asked what he wants to see for a marked item.

**What the mark does.** It is a label on the line. The item is not hidden and its numbers are not changed (Butter stays at -3). The mark only tells the reader "do not act on this".

**Fields.** On `StockItems` in `FoodStockService` (`/odata/v4/food-stock/StockItems`), filled by `markUntrustedRows('StockItems', results)` in `srv/food-stock-service.ts`:

| Field | Type | Meaning |
|---|---|---|
| `untrusted` | Boolean | true when Ilse marked this item (null/false otherwise) |
| `untrustedReason` | String | her reason, in plain words |
| `untrustedBy` | String | who marked it |
| `untrustedAt` | Timestamp | when |

**How to bind (UI5).**
1. Make sure the four fields are in the request. With `autoExpandSelect` the model builds `$select` from what the view binds, so binding the fields (step 2) is enough. If you set `$select` by hand, add `untrusted,untrustedReason,untrustedBy,untrustedAt`. The handler reads missing inputs itself, so nothing else is needed in the service.
2. Add a control on the row (and in the detail view), visible only when marked:
   `<ObjectStatus visible="{= ${food>untrusted} === true}" state="Error" icon="sap-icon://question-mark" text="{i18n>notTrusted}" />` (`sap-icon://alert` also works). Show reason, who and when next to it, e.g. a second `Text` with `{i18n>notTrustedBy}` and placeholders `{0}` (by), `{1}` (date, OData type with `formatOptions`), and `{food>untrustedReason}`.
3. All texts go in `i18n/i18n.properties`. Text + icon + colour together, never colour alone.
4. Do not compute the mark in the UI; bind the fields.

**Reorder advice and notifications.** `ReorderLines`, `OrderProposals` and `Notifications` are computed from `StockItems`. They do not carry the mark yet (the projection of `ReorderLines` has no `untrusted*` fields). For a marked item the app must not show ORDER_TODAY / LATE (or a stock-out notification) as if it were certain. Butter at -3 kg is impossible, so any advice calculated from it is not reliable. Show "I don't know" (same wording as Maren's water-app) instead of the status, or at least show the not-to-be-trusted label next to the advice. Either bind `untrusted` through the item (`Detail` binds `/ReorderLines(<ID>)`, so an association or an extra field on `ReorderLines` would be needed: ask us) or look the item up in `StockItems`.

**Assumption.** That a marked item shows "I don't know" instead of an order status is our own interpretation, copied from Maren's answer for pipes (v13). Tobin has not been asked. Ask him before building more than the label.

## Open

- Ilse did not say whether a marked line should be hidden or corrected. Only "marked, so nobody acts on it".
- Rowan and Tobin have not been asked yet what they do with a marked line (Maren answered in v13: a pipe with a marked pipe or sensor must show "I don't know", not a green light; built in `pipe-overview.ts`).
