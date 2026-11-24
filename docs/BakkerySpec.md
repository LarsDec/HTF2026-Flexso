# Spec: Bakery Reorder Assistant (SAP app)

## 1. Purpose

The client, Tobin, is the village baker of Oakhaven. His pantry screen shows today's stock, but it cannot tell him whether he can still bake next week, so he finds out about shortages too late.

Build an app that tells him **what to order, from whom, how much, and by when**, so that no ingredient drops below its minimum level before the delivery arrives.

The client's own words: he wants to order early enough that nothing drops below his minimum before the delivery arrives, "not just before it runs out".

If flour, milk or butter run short there is no bread, so those three are critical.

## 2. Before you start

You have access to the full project folder.

- Read the folder first. Identify the stack, the existing data model and the existing pantry screen.
- The existing screen is a table with these columns: Item (icon, name, code), Current quantity, Min. level, Consumption per day. Units are KG, L, Dozen and Number.
- Extend the existing app and reuse its entities and sample data. Do not start a new project.
- Use the framework already in the folder and follow SAP Fiori design guidelines. If it is a CAP project with Fiori elements, put the calculation in the service layer, not in the UI.
- If the folder contradicts this spec, say so in your final summary. Do not silently pick one.

## 3. Reference data

### 3.1 Stock snapshot (Tuesday 2026-11-24). Use it as test data.

| Item | Current | Min. level | Daily use (ordinary day) | Unit |
|---|---|---|---|---|
| Apples | 35 | 25 | 2.5 | KG |
| Bread | 35 | 20 | 5 | Number |
| Butter | -3 | 12 | 1.5 | KG |
| Cheese | 12 | 8 | 1 | KG |
| Eggs | 5 | 12 | 1.5 | Dozen |
| Flour | 40 | 45 | 6 | KG |
| Grain | 45 | 30 | 4 | KG |
| Milk | 180 | 120 | 60 | L |
| Potatoes | 80 | 50 | 8 | KG |
| Salt | 15 | 10 | 0.2 | KG |

### 3.2 Suppliers and delivery times

| Supplier | Days from order to pantry | Items |
|---|---|---|
| Local Dairy Farm | 1 | Milk |
| South Meadow Farms | 2 | Eggs, Butter |
| North Mill | 3 | Flour, Grain |
| Travelling merchant | 7 | Everything else (Apples, Cheese, Potatoes, Salt) |

### 3.3 Item attributes

- **Critical**: Flour, Milk, Butter. They are the bread ingredients.
- **Market-day multiplier**: Saturday is market day. On Saturday the village uses twice as much **flour, milk and bread**. The multiplier is 2 for those three items and 1 for all others.
- **Bread is baked in-house** every morning and is never ordered. Show it, but never recommend ordering it.

Suppliers, lead times, supplier-per-item, the critical flag and the multiplier must all be data. Do not hard-code them.

## 4. Business rules

Dates are whole days. Day 1 is tomorrow. "Today" is the date the app runs, or a date the user picks.

**R1. Forecast daily use.** On an ordinary day it is the item's daily use. On a market day (Saturday) it is daily use × the item's multiplier.

**R2. Expected stock on arrival.** For an order placed `k` days from today with lead time `L`:

`arrival_stock(k) = current_stock + incoming open orders arriving by then − sum of forecast use for days 1 … k+L`

**R3. Order-by date.** This is the **last** date (k ≥ 0) where `arrival_stock(k) ≥ min_level`. Search up to 60 days ahead. If nothing qualifies, show "no order needed within 60 days".

**R4. Status.**
- **OK**: the order-by date is after today.
- **Order today**: the order-by date is today (ordering tomorrow would arrive under the minimum).
- **Late**: `arrival_stock(0) < min_level`. Even ordering today, the stock dips below the minimum before delivery.

Also show these flags independently:
- **Below minimum now**: current stock is below the minimum.
- **Stock-out risk**: `arrival_stock(0) < 0`.
- **Data error**: current stock is negative. Compute with the recorded value and show a warning. Never clamp silently.

**R5. Recommended order quantity.** The client wants to have, at delivery, his minimum plus one week of ordinary use.

`target = min_level + 7 × daily use` (ordinary days, **no** Saturday multiplier)

`order_qty = max(0, target − arrival_stock(0))` if the status is Order today or Late, otherwise 0.

Make the "7" a configurable setting.

**R6. Never recommend an order for in-house items (Bread).**

**R7. Arithmetic.** Use decimal arithmetic, not floating point. Boundary cases such as exactly-equal-to-minimum must be correct.

### Notifications

The client wants a message when something **changes**: an item gets worse or is fine again. He does not want "ten messages a day". How to avoid that is left to us.

There is one shared pantry. His stock is the village's stock, so there is no per-user or per-household stock and no tenant logic. Notifications concern the pantry as a whole.

**N1. Only on status change.** Keep the last *notified* status per item (persisted). Send a message only when the current status (R4) differs from it. "Worse" is OK → Order today → Late. "Fine again" is the reverse. A Data error appearing counts as worse, and clearing counts as fine again. Never repeat a message while the status stays the same.

**N2. Daily digest.** Collect all changes and send **one message per day** at a configurable time (default **05:00** local time). The client reads his messages at five in the morning with his coffee, before the first loaves come out, so it must be short: a subject line with the counts (for example "Pantry: 2 worse, 1 fine again") and one line per item. It lists "Got worse" and "Fine again" separately, critical items first.

**N3. Immediate exception.** A **critical** item (Flour, Milk, Butter) that becomes **Late** triggers an immediate message, at most once per item per 24 hours. Everything else waits for the digest. During quiet hours (default 20:00–05:00, configurable) immediate messages are held and appear in the 05:00 digest instead. Quiet hours were not discussed with the client, so mention them in your summary.

**N4. No flapping.** A change is reported only if it is still in effect when the message is sent. If an item went OK → Late → OK between two digests, send nothing for it.

**N5. Quiet when quiet.** Send nothing if nothing changed. No "all OK" message.

**N6. First run.** With no stored status, send one digest listing every item that is not OK, then track changes from there.

**N7. Content and channel.** Each entry shows the item, old → new status, order-by date, recommended quantity and supplier. The client left the channel to us ("I'm not a tinkerer"). He reads messages on his phone at 05:00, not necessarily inside the app, so the default channel is **email**, with an in-app SAP Fiori notification as well. Put the channel behind an interface so text can be added later. The recipient address must be a setting, not hard-coded.

## 5. Requirements

### Must
1. **Reorder overview** (main screen), one row per item, with: Item (icon, name, code), Supplier, Lead time (days), Current, Min., Daily use, Expected stock on arrival, Status, Order-by date, Recommended order quantity (with unit).
2. Critical items sorted to the top by default. Status shown with Fiori semantic colours: Error for Late, Warning for Order today, Success for OK.
3. Flags from R4 visible in the row (Below minimum now, Stock-out risk, Data error).
4. Supplier, lead time, multiplier and critical flag maintainable as data.
5. Calculation and notification logic covered by automated tests, including the acceptance tests in section 6.
5a. Notifications as defined in rules N1–N7.

### Should
6. **Orders by supplier** view: all items to order, grouped per supplier with quantities (one order per supplier).
7. **Projection detail** per item: a day-by-day stock projection for the next 14 days, marking the minimum line and the Saturdays.
8. **Mark as ordered**: stores item, quantity, order date and expected arrival date. The item then shows "Ordered, arrives <date>" and the quantity counts as incoming stock in R2. This was **not** discussed with the client. Without it the app says "order now" every day after he orders. Build it, and say in the summary that it needs his confirmation.

## 6. Acceptance tests

### Test A: snapshot of Tuesday 2026-11-24 (section 3.1), order placed today

| Item | arrival_stock(0) | Status | Order qty |
|---|---|---|---|
| Milk | 120 L | Order today | 420 L |
| Grain | 33 kg | Order today | 25 kg |
| Flour | 22 kg | Late, below minimum now | 65 kg |
| Butter | -6 kg | Late, Stock-out risk, Data error | 28.5 kg |
| Eggs | 2 dozen | Late, below minimum now | 20.5 dozen |
| Apples | 17.5 kg | Late | 25 kg |
| Cheese | 5 kg | Late | 10 kg |
| Potatoes | 24 kg | Late | 82 kg |
| Salt | 13.6 kg | OK, order-by 2026-12-12 | 0 |
| Bread | n/a | In-house, no order | none |

Salt is the exact-boundary case: on 2026-12-12 the expected stock on arrival is exactly 10, which is still OK. This tests R7.

### Test B: the Saturday rule

Today is Wednesday 2026-11-25. Flour: stock 100 kg, minimum 45, daily use 6, lead time 3 days.

Expected order-by date: **Monday 2026-11-30**. Without the Saturday multiplier the result would be Tuesday 2026-12-01, which is wrong.

### Test C: notifications (digest at 05:00, all items start as OK and already notified)

1. Flour goes OK → Late at 10:00: **immediate** message (critical). Later the same day it goes Late → Order today → Late: no further message, because the status equals the last notified one.
2. Cheese goes OK → Late at 10:00: no immediate message (not critical). The next 05:00 digest lists it under "Got worse".
3. Apples go OK → Order today → OK between two digests: nothing is sent.
4. Milk was Late and is refilled to OK: the next digest lists it under "Fine again".
5. A day with no status changes: no message at all.
6. Butter goes OK → Late at 22:00 (quiet hours): no immediate message. It appears in the next 05:00 digest.

## 7. Out of scope

- Demand forecasting beyond the Saturday rule.
- Connecting to real supplier systems or sending orders.
- A recipe or bill of materials for bread.
- Authentication and roles beyond what the existing app has.

## 8. Open questions

These are for the client. Do not guess silently. Implement the stated default and keep it easy to change.

1. **Butter shows -3 kg.** The cause is unknown (an unrecorded delivery or a wrong count), and so is how stock figures get updated. Default: read the stock as stored and flag negatives.
2. **Delivery schedule.** The travelling merchant may only come on certain days. Default: an order placed on any day arrives exactly `lead time` days later.
3. **Pack sizes or minimum order sizes.** Unknown. Default: no rounding.
4. **Saturday and the one-week cover.** The client said "seven ordinary days", so R5 ignores the Saturday extra. Keep the 7 configurable.
5. **Notification recipient.** The client wants a short summary at 05:00 and leaves the channel to us. Default: email plus in-app notification. His email address or phone number is unknown, so make it a setting.

## 9. Deliverables

- Working app extending the existing project.
- Tests for R1–R7 including Tests A and B.
- A short summary of what you built, what you assumed, anything in the folder that contradicted this spec, and how to run it.
