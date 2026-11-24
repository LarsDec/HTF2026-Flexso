# VILLAGERS.md: requirements per villager (HTF 2026, Oakhaven)

Working notes so team members and AI assistants can build without the chat history.
Updated 2026-11-24. Data facts checked against `db/data/*.csv`. Conventions: see `AGENTS.md`.

## 1. Purpose and rules

- Requirements come only from the villager chats on the HTF platform (limited questions per villager).
- **Only what a villager said is a requirement.** Quotes are marked `"..."`. Anything we inferred is
  marked **[derived]** and must not be presented as the villager's wish; confirm it or keep it optional.
- README one-liners are platform briefs, not chat answers: marked **[brief]**.
- Never invent thresholds, priorities or rules. Unknown = open question; ask the villager.
- Computed values (status, rank, flags) go in a service handler (`virtual` field + `after('READ')`,
  see the `👋 EXAMPLE`), never in the UI. Status in UI5 = `ObjectStatus` with text + icon + state.

| Villager | Domain | App (planned) | Questions left |
|---|---|---|---|
| Maren Holt | water | `water-app` | 2 of 15 |
| Tobin Reyes | food / bakery | `food-app` | 6 of 15 |
| Rowan Ashby | village council | `council-app` | 15 of 15 |
| Ilse Vermeer | librarian / investigation | `investigation-app` | 5 of 15 |

---

## 2. Maren Holt (water), 2 of 15 questions left (13 used)

**[brief]** "Six pipes, one crew, and I'm always too late. When something breaks, I don't know which
pipe is worst or who's sitting without water. Help me know where to go first."

### Her words (chat)
1. Last failure: she heard it from North Residential Area, "people knocking on my door about weak
   taps ... By the time folks complain, I'm already too late."
2. Health check: "Per pipe, one plain word: fine, needs attention, alarm, or "I don't know" when the
   numbers are old or missing. Then a short answer: where do I go first, where next, and why that one
   first. I've got one crew and can do at most two repairs a day."
3. Thresholds, "same rules as every pipe": needs attention = flow below 80 % of normal or pressure
   under 40 PSI; alarm = flow below half of normal or pressure under 25 PSI. "Exactly 80 percent or
   exactly 40 PSI is still fine by me."
4. NORTH-BRANCH-02 before SECONDARY-LOOP: "The SECONDARY-LOOP is only the backup ring, so it always
   comes last, even when it's in alarm. Nobody depends on it, but about 140 families in North
   Residential Area depend on that north branch."
5. Staleness: "If the reading is more than fifteen minutes old when I look at it, I don't trust it,
   so I don't know. Same goes for missing numbers."
6. Pipe 47/50 vs sensor 140: she does not know which to trust; "Ilse at the library is looking into
   that. Ask her." → see section 3.

7. (v13) Pipe or sensor marked "not to be trusted": summary only (literal text to be added from the chat): the pipe must not look fine; it shows "I don't know".

### Fixed rules
- `ratio = currentFlowRate / nominalFlowRate` (normal flow = `nominalFlowRate` **[derived]**, she said "normal flow").
- **alarm**: `ratio < 0.5` OR `currentPressure < 25`.
- **needs attention**: `ratio < 0.8` OR `currentPressure < 40` (and not alarm).
- **fine**: otherwise. Strictly less than: 0.8 / 40 PSI = fine; 0.5 / 25 PSI = needs attention.
- **I don't know**: reading older than 15 min (strictly more) or any input missing. Overrides the rest.
- **I don't know (v13)**: also when the pipe or one of its sensors is marked "not to be trusted" (built in `srv/domain/pipe-overview.ts`). Reason shown: Marked "not to be trusted", so the numbers are not used.
- **Ranking**: by people depending on the pipe. NORTH-BRANCH-02 (~140 families) first;
  SECONDARY-LOOP always last, also in alarm.
- **Capacity**: one crew, max 2 repairs/day → show a "my morning" top 2, each with a reason.
- **[derived]** freshness source: pipes have no timestamp; use the pipe's sensor `lastReading`. Not confirmed.
- **[derived]** "SECONDARY-LOOP last" could generalise to `pipelineType = secondary`; she only named this pipe.

### Data (CSV, verified)
| Pipe | Flow / nominal | Ratio | PSI | Status by her rules | Feeds (`Landmarks.suppliedBy`) |
|---|---|---|---|---|---|
| PRIMARY-MAIN | 142 / 150 | 0.947 | 58 | fine | (none) |
| NORTH-BRANCH-01 | 76 / 80 | 0.95 | 52 | fine | (none) |
| NORTH-BRANCH-02 | 20 / 65 | 0.308 | 22 | alarm | North Residential Area (~140 families, from chat) |
| BAKERY-BRANCH | 47 / 50 | 0.94 | 47 | fine, but SENS-004 says flow 140 | The Bakery |
| SOUTH-BRANCH | 40 / 60 | 0.667 | 38 | needs attention | South Meadow Farms |
| SECONDARY-LOOP | 12 / 40 | 0.30 | 20 | alarm (always last) | (none) |

On this data: NORTH-BRANCH-02 first (her words); SECONDARY-LOOP last (her words); SOUTH-BRANCH
second is **[derived]** from "always last", not confirmed.
Sensors SENS-001..006 (one per pipe) match their pipe's flow and pressure, except SENS-004 flow.
Households are not in the data; only the "~140" from the chat.

### Open questions (ask Maren)
- With two alarms and max 2 repairs: is SECONDARY-LOOP still in the top 2, or does SOUTH-BRANCH
  (needs attention, feeds farms) go before it? ("always last" suggests yes, confirm.)
- Freshness: sensor time or something else? What should the app explicitly not do?

### Built (water-app)
Map, table and plan select the same pipe; detail panel; clickable priority in "My morning"; "Mark as repaired" and Log repair; status filter; "I don't know" for marked pipes (question-mark icon, crossed circle on the map). Details: `WATER-REQUIREMENTS.md`, `NOT-TRUSTED.md`.

### Proposed app design [derived]
- `WaterSupplyService.WaterPipes` virtual fields: `flowRatio : Decimal`, `healthStatus : String`
  (`fine|attention|alarm|unknown`, CDS enum), `statusReason : String` (e.g. "pressure 22 < 25 PSI"),
  `priorityRank : Integer`, `priorityReason : String`, `sensorConflict : Boolean`,
  `readingAgeMinutes : Integer`. One `after('READ')` handler, one extra query for missing inputs +
  sensors (`{ in: [...] }`), no query in a loop.
- Families per pipe: no source in data. Option: a small constant map in `srv/lib/` with only the
  number Maren gave (NORTH-BRANCH-02 = 140), others "unknown" until asked. Do not invent numbers.
- Staleness threshold (15 min) as one constant; make it testable (demo feed hides it, see section 4).
- Screens: DynamicPage with "My morning" card (top 2, reason text) above a pipe table
  (ObjectStatus Error/Warning/Success/None + icon, ObjectNumber for L/min and PSI);
  FlexibleColumnLayout detail: flow, pressure, sensor values, conflict warning, repairs, landmark(s)
  fed. Optional map overlay via `mapPath` (README "The village map").
- Sensor/pipe conflict: show both values and a warning; do not pick one until Ilse answers.

---

## 3. Cross-references between villagers

| From | To | Topic | Status |
|---|---|---|---|
| Maren, Q6 | Ilse | "Some numbers have looked odd lately". BAKERY-BRANCH: pipe 47/50 L/min vs SENS-004 140 L/min (SENS-004 modified by `system` 2026-11-17T03:13Z). Which source is right? | Asked. Ilse: some records "simply cannot be true" (a sensor over 2x its pipe's nominal flow; negative food stock). Finding the lines is our job. Which source she trusts: ask separately (not yet asked) |

Add a row whenever a villager points to another one.

---

## 4. Tobin Reyes (food / bakery), 6 of 15 questions left

**[brief]** "I want to know before it goes wrong, not after." Chat answers (9 used) are kept in the team notes outside the repo; not worked out here.

### Data (CSV, verified; StockItems via `/odata/v4/food-stock`)
| Item | Qty | Min | Use/day | Unit |
|---|---|---|---|---|
| Grain | 45 | 30 | 4 | KG |
| Milk | 180 | 120 | 60 | L |
| Apples | 35 | 25 | 2.5 | KG |
| Flour | 40 | 45 | 6 | KG |
| Butter | -3 | 12 | 1.5 | KG |
| Eggs | 5 | 12 | 1.5 | Dozen |
| Potatoes | 80 | 50 | 8 | KG |
| Bread | 35 | 20 | 5 | Number |
| Cheese | 12 | 8 | 1 | KG |
| Salt | 15 | 10 | 0.2 | KG |

Below min now: Flour, Eggs, Butter (negative). `StockReceivals` and `Notifications` have no rows;
`srv/food-stock-service.ts` is empty. All entities `@readonly`: writes need actions.

### Open questions (ask Tobin)
- What does he want to see first in the morning? What counts as "going wrong": below `minStockLevel`,
  or running out within N days? How many days ahead?
- What to do with a negative quantity (Butter -3)? Who receives a notification and when is it "read"?
- How does he register a delivery (supplier, amount)? Does he trust `consumptionRate`?

### Possible design [derived, only after his answers]
Virtual fields on StockItems such as `daysOfCover = currentQuantity / consumptionRate` and a stock
status; actions `registerReceival` (on StockItems) and `acknowledge` (on Notifications). Thresholds
come from Tobin, not from us.

---

## 5. Rowan Ashby (village council), 15 of 15 questions left

**[brief]** "We want to see at a glance how Oakhaven is doing." No chat answers yet.
Data: `council` is `createdBy` of all pipes, landmarks and stock items. An overview would combine
water and food (both OData models are already in the app manifest: `""` and `food`).
**Ask first:** what must the council decide this week; what "doing well" means per domain; which
numbers they look at now; who acts on what they see.
**Possible design [derived]:** one overview page with per-domain tiles reusing Maren's and Tobin's
computed statuses (no new rules of our own).

---

## 6. Ilse Vermeer (librarian / investigation), 7 of 15 questions left

**[brief]** "Somebody tampered with our data. I want to see what changed."

### Her words (chat)
1. Asked which numbers look wrong and which source she trusts: "Some numbers in the records simply cannot be true. Think of a sensor that suddenly measures more than double the normal flow of its pipe, or a negative amount of food in Tobin's stock. Finding the exact lines is your job, I'm afraid. As for which source I trust, ask me that one separately, please."

2. (v5) Asked about the repair note signed "W. S.": "*goes very quiet, then whispers* That note gives me chills, I'll admit. I have no idea who W. S. is, and I won't guess at a name. It ends with some strange letters I cannot read either."

3. (v6) Asked what Maren should see for a line marked "not to be trusted": "*nods slowly* She should see clearly that the line is marked 'not to be trusted', so she doesn't act on it. What she does instead with her water is Maren's business, not mine. Best ask her yourself."

### Requirements from her answer
- The app must find impossible values itself. Two rule types are confirmed by example: sensor flow > 2x the nominal flow of its pipe (SENS-004: 140 vs 50) and negative stock quantity (Butter -3).
- She wants proof, not rumours (intro): each finding needs the exact row.
- Still open: which source she trusts (pipe or sensor), what proof means, other kinds of impossible values, what the app should do with a bad value (flag, hide, correct).
- [v6, confirmed] A marked line must be clearly visible on Maren's screen. What Maren does with it is for Maren to decide: ask her.
- [v5] W. S. is unknown to Ilse: do not guess a name, do not act on the encoded text.

Data hint: only the `managed` fields exist (`createdAt/By`, `modifiedAt/By`): no change history or
old values. Suspicious rows are listed in section 7.
**Ask first:** the pipe 47 vs SENS-004 140 question from Maren; which changes she considers
suspicious (user `system`? night-time edits? people editing outside their domain?); what proof she
needs; does she want old values (needs a new change-log entity) or only "who/when".
**Possible design [derived]:** a cross-entity "recent changes" list from `modifiedAt/modifiedBy`
across all entities, with flags for the anomalies below; detail per row with the raw values.

---

## 7. Data-quality pitfalls in the repo data

| # | Where | What | Impact |
|---|---|---|---|
| 1 | `srv/lib/demo-freshness.ts` | Sets every `Sensors.lastReading` to now every 20 s while the server runs (CSV has 2026-11-16T17:00Z). | Maren's "I don't know" (>15 min) never shows in the demo. Test with the feed stopped, test data or a lowered threshold; explain this in the demo. |
| 2 | Sensors SENS-004 | Flow 140 on BAKERY-BRANCH (pipe 47, nominal 50). Modified by `system` 2026-11-17T03:13Z. | Sensor and pipe disagree; status differs per source. Ask Ilse. |
| 3 | Repairs #6 | SOUTH-BRANCH, "Replaced valve seal at the meadow junction", `repairDate` 2026-12-30 (future), `repairedBy` Tobin Reyes, created by `system` 2026-11-17T03:13Z. | Planned repair or fake entry? Do not treat as done. |
| 4 | StockItems BUTTER | `currentQuantity` -3, modified by `system` 2026-11-17T03:13Z. | Invalid quantity; days-of-cover and status must handle it. |
| 5 | Same timestamp | Items 2-4 all by `system` at 2026-11-17T03:13Z. | Likely the "tampering" Ilse means (unconfirmed). |
| 6 | Cross-domain edits | `maren.holt` modified MILK, FLOUR, EGGS, BREAD; Tobin Reyes is `repairedBy` on three pipe repairs (#2, #3, #6); modified NORTH-BRANCH-01, BAKERY-BRANCH, SECONDARY-LOOP and created all sensors. | Possibly normal, possibly suspicious: ask, do not judge. |
| 7 | Repairs #5 | PRIMARY-MAIN, dated 2024-12-21 by "W. S.", odd text. | Not part of any villager's need; leave alone unless the team decides otherwise. |
| 8 | Landmarks | "Deepwood Forest" three times (C8, B8, A6). Only 3 of 10 landmarks have `suppliedBy`. | Do not use `name` as a key. Pipes without landmarks have no known dependants. |
| 9 | Landmarks.suppliedBy | A `pipeID` string, not an association. | Join in the handler on `pipeID`; no `$expand`. |
| 10 | WaterPipes.lastMaintenance | BAKERY-BRANCH, NORTH-BRANCH-01, SECONDARY-LOOP have a maintenance date but no repair row. | Repair log is incomplete; do not derive "last repair" from Repairs alone. |
| 11 | Households | Not in the data model. | Only Maren's "~140" for NORTH-BRANCH-02; everything else must be asked. |
