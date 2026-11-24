# Food app requirements

Requirements for the food app (`src/food-app`, `srv/food-stock-service`, `srv/domain/food-*`). Source: `BakkerySpec.md` (Tobin the baker's spec). There is no chat log with Tobin in this repo. Only his literal words quoted in the spec are requirements; everything under "Rules implemented" is our reading of the spec, and everything under "Assumptions" is ours, not Tobin's.

## Briefing / source

The only source is `BakkerySpec.md`. It describes Tobin's problem and quotes him in a few places. His literal words that appear in it:

> "not just before it runs out"

> "seven ordinary days"

> "ten messages a day" (he does not want them)

> "I'm not a tinkerer" (he leaves the channel to us)

He reads his messages on his phone at five in the morning, with his coffee, before the first loaves come out. His pantry screen shows today's stock, but it cannot tell him whether he can still bake next week, so he finds out about shortages too late. He wants to know what to order, from whom, how much, and by when.

## Tobin's answers

Not a chat. One row per literal client statement found in the spec.

| # | Topic | What Tobin says (quote) | Where in spec |
| --- | --- | --- | --- |
| 1 | When to order | He wants to order early enough that nothing drops below his minimum before the delivery arrives, "not just before it runs out". | section 1 |
| 2 | Critical items | If flour, milk or butter run short there is no bread, so those three are critical (bread ingredients). | section 1, 3.3 |
| 3 | Order quantity | At delivery he wants his minimum plus one week of ordinary use: "seven ordinary days" (so no Saturday extra). | R5, section 8 q4 |
| 4 | Market day | Saturday is market day: the village uses twice as much flour, milk and bread. | section 3.3 |
| 5 | Bread | Bread is baked in-house every morning and is never ordered. | section 3.3, R6 |
| 6 | Message volume | He wants a message when something changes (an item gets worse or is fine again), not "ten messages a day". | Notifications intro |
| 7 | Reading time | He reads his messages at five in the morning, before the first loaves come out; it must be short. | N2 |
| 8 | Channel | He left the channel to us: "I'm not a tinkerer". He reads on his phone, not necessarily in the app. | N7, section 8 q5 |
| 9 | Pantry | One shared pantry: his stock is the village's stock. | Notifications intro |
| 10 | Delivery times | Supplier lead times: Local Dairy Farm 1, South Meadow Farms 2, North Mill 3, Travelling merchant 7 days. (Given as reference data, not quoted.) | section 3.2 |

## Rules implemented

Our reading of the spec. Logic is in `srv/domain/`, numbers are exact decimals (R7). Tests: `srv/domain/food-reorder.test.ts` (R1-R7) and `srv/domain/food-notifier.test.ts` (N1-N7).

### Reorder (R1-R7)

| Rule | What it does | Where |
| --- | --- | --- |
| R1 | Forecast use = daily use, times the item's multiplier on the market day (Saturday). | `srv/domain/food-reorder.ts` (`forecastUse`), `food-calendar.ts` |
| R2 | `arrival_stock(k)` = current stock + open orders arriving by then - forecast use for days 1 ... k+L. | `food-reorder.ts` (`arrivalStock`) |
| R3 | Order-by = last day k >= 0 with `arrival_stock(k) >= min`, searched up to 60 days (see assumption 1). | `food-reorder.ts` (`computeReorder`) |
| R4 | Status OK / Order today / Late, plus flags Below minimum now, Stock-out risk, Data error (negative stock, computed as recorded, never clamped). | `food-reorder.ts` |
| R5 | `order_qty = max(0, min + 7 x daily use - arrival_stock(0))` when Order today or Late, else 0. The 7 is a setting (`coverDays`). | `food-reorder.ts`, `PantrySettings` |
| R6 | In-house items (Bread) never get an order. | `food-reorder.ts` |
| R7 | Decimal arithmetic, exact boundaries (Salt: exactly 10 on 2026-12-12 is OK). | `srv/domain/food-decimal.ts` |

### Notifications (N1-N7)

| Rule | What it does | Where |
| --- | --- | --- |
| N1 | Persisted last-notified status per item; message only when the current status differs. Data error appearing = worse, clearing = fine again. | `srv/domain/food-notifier.ts` (`planNotifications`), state in `NotificationStates` |
| N2 | One digest per day at a configurable time (default 05:00): subject with counts ("Pantry: 2 worse, 1 fine again"), one line per item, "Got worse" and "Fine again" separate, critical first. | `food-notifier.ts` |
| N3 | A critical item becoming Late sends an immediate message, at most once per item per 24 h. In quiet hours (default 20:00-05:00) it is held for the digest. | `food-notifier.ts` |
| N4 | No flapping: a change is only reported if still in effect when sent. | `food-notifier.ts` |
| N5 | Nothing changed means no message, no "all OK". | `food-notifier.ts` |
| N6 | First run (no stored status): one digest with every item that is not OK. | `food-notifier.ts` |
| N7 | Each entry: item, old -> new status, order-by date, quantity, supplier. Channel behind an interface; recipient is a setting. | `srv/lib/food-notification-channels.ts`, runner `srv/lib/food-notifier-runner.ts` |

### Acceptance tests

| Test | Covers | Status |
| --- | --- | --- |
| A | Snapshot of Tuesday 2026-11-24, order today (Milk, Grain, Flour, Butter, Eggs, Apples, Cheese, Potatoes, Salt, Bread). | Passing |
| B | Saturday rule: Flour on Wednesday 2026-11-25, order-by Monday 2026-11-30. | Passing |
| C | Notification cases 1-6 (flour immediate, cheese digest, apples no flapping, milk fine again, quiet day, butter in quiet hours). | Passing |

`npm test`: 118 tests in `srv/domain/*.test.ts`, all passing.

### Service and app

- `FoodStockService` (`/odata/v4/food-stock`): `ReorderLines` (R1-R6 as virtual fields), `OrderProposals` (grouped per supplier), `stockProjection` (14 days), actions `markAsOrdered`, `markAsReceived`, `setReorderAttributes`, `updateSupplier`, `updateSettings`, `acknowledge`, `runNotifier`.
- App `food.pantry` (`/app/food`, semantic object `FoodPantry`).

## Assumptions (ours, not Tobin's - need confirmation)

1. **ASSUMPTION - R3 reading.** Order-by = the last day before the first day whose delivery would arrive under the minimum. Late has no order-by date. "No order needed within 60 days" only when the whole window stays at or above the minimum. The spec text contradicted R4 here (see inconsistencies).
2. **ASSUMPTION - Notified status** is the pair (status, data error). Worse = higher status, or a data error appears. A better status together with a new data error counts as worse.
3. **ASSUMPTION - Time zone** is a setting, default Europe/Brussels. It decides "today", the 05:00 digest and quiet hours.
4. **ASSUMPTION - Email channel** = an outbox table (`OutboundMessages`) plus a server log line, because no mail server or mail library is available. In-app = `Notifications` rows shown in the app's Messages tab (the local launchpad has no Fiori notification service). The recipient stays empty until set.
5. **ASSUMPTION - Bread (in-house)** shows status and flags, is never ordered and never notified.
6. **ASSUMPTION - Overdue open orders** keep counting as incoming until "Received" is pressed. That books the stock and writes a `StockReceivals` row.
7. **ASSUMPTION - First-run digest** (no stored state) is sent at the first check outside quiet hours, not at the next 05:00.
8. **ASSUMPTION - Quiet hours 20:00-05:00.** The spec says they were never discussed with Tobin.
9. **ASSUMPTION - "Mark as ordered".** The spec says it was not discussed with Tobin. Built so the app does not say "order now" every day after he orders; needs his confirmation.
10. **ASSUMPTION - Spec section 8 defaults:** Butter -3 is read as stored and flagged as a data error; an order arrives exactly lead-time days later on any day; no pack-size rounding; 7 cover days, configurable.
11. **ASSUMPTION - Adding items and suppliers in the app** (`createStockItem`, `createSupplier`) is a team decision, not a statement from Tobin.
12. **ASSUMPTION - A picked future date is a forecast:** stock is rolled forward from the real today with forecast use and open orders, then the plan runs from that date. Decided by the team, not by Tobin; the spec only says "or a date the user picks". A picked date that is today or in the past uses the recorded stock as is.

## Spec inconsistencies found

- Test A omits "Below minimum now" for Butter, although -3 < 12. The app shows it.
- Test C says all items start OK, but case 4 starts Milk as Late.
- R3 versus R4 wording (see assumption 1).

## Questions left for Tobin

The question budget is limited. These are proposals, not a plan to ask all of them. One question per line, simple English.

1. Is it fine if I do not send you messages between 20:00 and 05:00?
2. After you order something, may I ask you to press "Ordered" in the app, so I know it is on its way?
3. Your butter count says -3 kg. How do you update your stock numbers, and what happened with the butter?
4. Does the travelling merchant come on certain days, or can he arrive 7 days after any order?
5. Do any items come in packs or have a minimum order size, for example a full sack of flour?
6. What email address should your 05:00 message go to?

## Known limitations

- The computed lists (`ReorderLines`, `OrderProposals`) ignore `$top`, `$skip` and `$orderby`. Fine for 10 items.
- `ReorderLines` and `OrderProposals` use `on('READ')` instead of the `after('READ')` that APPS.md rule 5 asks for. Flagged for the team.
- The browser check of the 14-day projection is not done yet.
