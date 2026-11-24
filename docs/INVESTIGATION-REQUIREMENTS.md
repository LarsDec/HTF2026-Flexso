# Investigation app requirements

Requirements for the investigation app (`src/investigation-app`, `srv/investigation-service`, `srv/domain/investigation*.ts`). Source: chat with Ilse Vermeer (investigator) on the Hack The Future platform; the same answers are in `VILLAGERS.md`. Only her literal answers are requirements. Everything we derived is marked **assumption**; extra findings in the data are marked **observation, not a rule**.

## Briefing

> "Some of our numbers don't add up, and I'm certain somebody tampered with them. I need proof, not rumours."

## 1. Ilse's literal answers (v1 to v6) and the rules that follow

| # | Our question | Ilse says |
|---|---|---|
| 1 | Which numbers don't add up and which source do you trust? | "Some numbers in the records simply cannot be true. Think of a sensor that suddenly measures more than double the normal flow of its pipe, or a negative amount of food in Tobin's stock. Finding the exact lines is your job. As for which source I trust, ask me that one separately." |
| 2 | What makes a change suspicious (hours, money threshold, users)? | "Hours, mostly. Nobody in Oakhaven works between midnight and four in the morning, Tobin is the earliest riser at four, so a change in that window makes me very uneasy. A change made by a name that isn't a person, like a system account or no name at all, worries me too. Money thresholds I have no notes on." |
| 3 | A pipe says 47 of 50, its sensor says 140. Which do you believe, and what proof do you want for the council? | "Honestly, I wouldn't pick one on a hunch. A sensor saying 140 on a pipe that carries 50 is more than double, so that reading simply cannot be true, and when a pipe and its own sensor disagree, the line deserves suspicion. For the council I'd want to see when that line was last changed and by whom, with the reason written in plain words I can explain myself." |
| 4 | What should the screen show for each suspicious line? | "For each line I'd want the reason it's suspicious in plain words I can repeat to the council, plus when it was last changed and by whom. And then I need a way to mark it "not to be trusted", so Maren, Tobin and the council don't act on it. How it all looks is up to you, I'm no tinkerer." |
| 5 | While going through the records I found a repair note on the main water pipe from 2024, signed only 'W. S.'. Nothing else says who that is. What can you tell me about that name? | *goes very quiet, then whispers* That note gives me chills, I'll admit. I have no idea who W. S. is, and I won't guess at a name. It ends with some strange letters I cannot read either. |
| 6 | Say you have marked the broken sensor line as 'not to be trusted'. Tomorrow morning Maren opens her screen and that line is on it. What should she see there, and what should she do with it? | *nods slowly* She should see clearly that the line is marked 'not to be trusted', so she doesn't act on it. What she does instead with her water is Maren's business, not mine. Best ask her yourself. |

### Rules that follow (confirmed by her words)

- R1. A sensor reading of more than double the normal flow of its pipe is impossible (v1, v3). "Normal flow" = the pipe's `nominalFlowRate`.
- R2. A negative amount of food in stock is impossible (v1).
- R3. A change made by a name that is not a person, such as a system account or no name at all, is suspicious (v2).
- R4. A change between midnight and four in the morning is suspicious; Tobin starts at four (v2).
- R5. No money threshold, no user-specific rule (v2).
- R6. When a pipe and its own sensor disagree, the line deserves suspicion; do not pick a source on a hunch (v3). The app shows the conflict, it does not decide which side is right.
- R7. Per suspicious line show: the reason in plain words she can repeat to the council, when it was last changed, and by whom (v3, v4).
- R8. There must be a way to mark a line "not to be trusted" so Maren, Tobin and the council do not act on it (v4).
- R9. Look and feel are ours to decide (v4). Her trusted source: answered in v3 (no source is picked on a hunch).
- R10. A marked line must be clearly visible on Maren's screen (v6, confirmed). What Maren does with it is for Maren to decide: ask her.
- R11. W. S. is unknown to Ilse (v5). Do not guess a name, and do not act on the encoded text.

### Our own readings (assumptions, not her words)

- A1. "Double" is a strict "more than 2 times", the same factor the water app already uses (`CONFLICT_FACTOR = 2` in `srv/domain/source-conflict.ts`). Exactly 2.0 times is not flagged.
- A2. "Between midnight and four" means a time of day from 00:00:00 up to, but not including, 04:00:00. At 04:00 Tobin is awake, so that is a normal working time.
- A3. "A change" is read from `modifiedAt` / `modifiedBy` (managed aspect). On a new row `modifiedAt` equals `createdAt`, so creations are covered too.
- A4. "A name that isn't a person": we treat `null`, empty or whitespace, `system` and `anonymous` as non-persons. `system` and "no name" are her examples. `anonymous` is ours (CAP's default user in this open app). See open question 2 about `council`.
- A5. Severity for sorting is our own idea: the number of rules a line hits, then newest change first (section 4).
- A6. Marking is persistent and shared by all apps; verbergen or correcting is not asked for and is not built.

## 2. Detection rules as pure functions (design only)

Location: `srv/domain/investigation.ts` (+ `investigation.test.ts`). Pure functions: no database, no clock, no `cds`. The handler reads the rows, calls the functions and builds the findings. Reuse `toNumber` / `toDate` from `srv/domain/numbers.ts` and `CONFLICT_FACTOR` from `srv/domain/source-conflict.ts`; do not copy the factor.

| Rule | Function (signature idea) | Returns true when | Missing data |
|---|---|---|---|
| (a) impossible flow | `isImpossibleSensorFlow(sensorFlow, pipeNominalFlow, factor = CONFLICT_FACTOR)` | `sensorFlow > factor * pipeNominalFlow` (strict) | not a number, or nominal missing or <= 0: false (cannot judge) |
| (b) negative stock | `isNegativeStock(currentQuantity)` | `currentQuantity < 0` (0 is fine) | not a number: false |
| (c) non-person editor | `isNonPersonEditor(modifiedBy)` | trimmed, lower-cased name is empty or in `NON_PERSON_NAMES = ['system', 'anonymous']` | null or empty: true |
| (d) quiet hours | `isInQuietHours(modifiedAt, utcOffsetMinutes = OAKHAVEN_UTC_OFFSET_MINUTES)` | local time of day in `[00:00, 04:00)` | no or invalid date: false |

Composing function: `findSuspiciousLines(input): Finding[]` with `Finding = { entityName, recordID, label, rules: RuleId[], reason, changedAt, changedBy, severity }`. A sensor row is checked with (a), (c), (d); a stock row with (b), (c), (d); pipes, repairs and landmarks with (c), (d). One finding per record, listing every rule it hits. The reason sentence is built from one template per rule (plain English, no jargon) and joined.

### Time zone for rule (d)

Chosen: **Oakhaven time, which we set equal to UTC** (`OAKHAVEN_UTC_OFFSET_MINUTES = 0`, one constant, passed as a parameter so it is trivial to change). This is an **assumption**.

- Ilse speaks about the village clock ("nobody in Oakhaven works between midnight and four"), not about a server or browser clock. So the rule must not depend on where the team's laptop is.
- The repo defines no offset for Oakhaven. Every timestamp in the data is UTC (`...Z`).
- The data fit it: every normal change in the CSVs happens between 08:10Z and 16:45Z (a working day). With UTC as the village clock only the three `system` rows at 03:13Z fall in the window, and her example (SENS-004 at 03:13) is hit. A far-off offset would either flag normal daytime work (for example UTC+8 turns 16:45Z into 00:45) or move 03:13 out of the window.
- UI warning: a UI5 `DateTime` type formats in the browser's zone. A browser in Belgium (UTC+1 in November) would show 03:13Z as 04:13 and the finding would look like it is outside the window. Show the time with `UTC: true` and label it "(Oakhaven time)".

## 3. What the rules hit right now (checked against the CSVs)

All times UTC = Oakhaven time (assumption above). Scanned: WaterPipes (6), Sensors (6), Repairs (6), Landmarks (10), StockItems (10); StockReceivals and Notifications are empty.

### Rule x record

| Record | (a) > 2x flow | (b) negative stock | (c) non-person | (d) 00:00-04:00 |
|---|---|---|---|---|
| Sensor SENS-004 (pipe BAKERY-BRANCH) | yes, 140 vs 50 = 2.8x | n/a | yes, `system` | yes, 03:13 |
| StockItem BUTTER | n/a | yes, -3 KG | yes, `system` | yes, 03:13 |
| Repair 30000000-...-0006 (pipe SOUTH-BRANCH) | n/a | n/a | yes, `system` | yes, 03:13 |

Per rule: (a) 1 line, (b) 1 line, (c) 3 lines, (d) 3 lines. In total **3 suspicious lines**, all changed in the same minute: 2026-11-17 03:13 by `system`. No other row has a modification time between 00:00 and 04:00 or an empty or system editor. Other sensors: SENS-001 142 vs 150, SENS-002 76 vs 80, SENS-003 20 vs 65, SENS-005 40 vs 60, SENS-006 12 vs 40: none above 2x. No other negative quantity.

### Per finding (reason in plain words, last changed, by whom)

| Line | Reason (words for the council) | Last changed | By |
|---|---|---|---|
| Sensor SENS-004 on BAKERY-BRANCH | "This sensor reports 140 litres a minute, but its pipe can carry only 50, so it claims 2.8 times the most the pipe can carry. The pipe itself says it carries 47. The record was changed at 03:13, when nobody in Oakhaven works, by `system`, which is not a person." | 2026-11-17 03:13 | `system` |
| Stock item Butter | "The pantry says minus 3 kilos of butter. You cannot have less than nothing, and Tobin says there is about half a block in the cellar. The record was changed at 03:13, when nobody in Oakhaven works, by `system`, which is not a person." | 2026-11-17 03:13 | `system` |
| Repair on SOUTH-BRANCH ("Replaced valve seal at the meadow junction") | "This repair record was changed at 03:13, when nobody in Oakhaven works, by `system`, which is not a person." | 2026-11-17 03:13 | `system` |

Source conflict (R6): BAKERY-BRANCH (pipe: 47 of 50, last changed 2026-09-10 14:30 by `tobin.reyes`) and its sensor SENS-004 disagree. The finding is attached to the sensor row, because that is the line that changed; the pipe is shown next to it as the other side. Assumption: Ilse's "the line" in v3 means the sensor line, since the pipe line has an ordinary history. The existing `sourceConflict` flag in the water app stays as it is.

### Observations, not rules (we do not turn these into rules)

- Repair `...0006` is dated **2026-12-30**, in the future (today is 2026-11-24, the row was changed 2026-11-17), and says `repairedBy` Tobin Reyes. It is already hit by (c) and (d) through who and when. The future date itself is not something Ilse named; it is also an open point of Maren's chat.
- "Deepwood Forest" exists **3 times** in Landmarks (C8, B8, A6), all created and modified by `council` on 2026-01-12 in the daytime. Nobody said this is wrong (the forest may be several cells). No rule hits it.
- 15 rows were last modified by `council` (10 landmarks, Grain, Apples, Cheese, Salt, and repair `...0005`), all in the daytime. `council` is a group account rather than a named person; under A4 it is not flagged. See open question 2.
- Repair `...0005` (PRIMARY-MAIN, "W. S.", dated 2024-12-21 00:00) has an encoded string in its text. It was changed 2026-01-12 11:30, so no rule hits it. Asked Ilse in v5: she does not know who W. S. is and will not guess (R11). The encoded text is not acted on; ignore it unless the team decides otherwise.
- The repair date of that row (00:00) is an event date, not a change time. Rule (d) uses `modifiedAt` only.
- The demo feed (`srv/lib/demo-freshness.ts`) rewrites `lastReading` by plain SQL and deliberately leaves `modifiedAt` / `modifiedBy` alone, so it creates no findings.
- The app is open (no login), so CAP stamps new CQL writes with `anonymous`. That is why `anonymous` is in the non-person list (A4), and why the "marked by" name must be typed in (section 4).

## 4. "Not to be trusted" marking (Ilse v4; design is our assumption)

Ilse asked for "a way to mark it". Everything below, including persistence, is our reading.

### Data model (`db/schema.cds`, no CSV change)

```cds
/** A record somebody marked as "not to be trusted" (Ilse). One mark per record. */
entity Distrusts : cuid, managed {
  entityName : String(40);   // 'WaterPipes' | 'Sensors' | 'Repairs' | 'Landmarks' | 'StockItems'
  recordID   : UUID;         // ID of that record
  reason     : String(500);  // plain words, required
  markedBy   : String(100);  // who marked it, typed in (no login in this app)
}
```

`managed` gives createdAt, createdBy, modifiedAt, modifiedBy. Because the app has no login, `createdBy` is `anonymous`; that is why `markedBy` is an explicit field. No foreign key: a polymorphic pair (entityName, recordID) keeps one table for every entity. Starts empty and is not in any CSV, so `npm run db:reset` removes all marks (fine for a demo).

### Service (`srv/investigation-service.cds` + `.ts`, path `investigation`)

- `@readonly entity Distrusts as projection on db.Distrusts;`
- `@readonly entity Findings` computed in a `READ` handler from the pure functions of section 2, sorted by severity; each row carries `status` (`trusted` or `untrusted`) and the mark details from `Distrusts`.
- `action markUntrusted(entityName : String, recordID : UUID, reason : String, markedBy : String) returns Distrusts;` Validation with `req.error`: entityName in the allow-list, the record exists, reason and markedBy not empty (400), already marked (409).
- `action clearUntrusted(entityName : String, recordID : UUID) returns Boolean;` removes the mark (404 when there is none). Assumption: clearing deletes the row, so the history of a cleared mark is gone. If the council wants history, add `clearedAt` / `clearedBy` instead of deleting.
- Only these two actions write; every entity stays `@readonly`.
- Shared helper (for example `srv/lib/distrusts.ts`): `markUntrustedRows(entityName, rows)` does one query `recordID in (...)` and fills virtual fields; called from `after('READ')` of the other services.

### Where the mark becomes visible

Virtual fields on the projections, repo pattern: `virtual null as untrusted : Boolean`, `untrustedReason`, `untrustedBy`, `untrustedAt`.

| App | Where | What the user sees |
|---|---|---|
| water-app (Maren) | pipe list and pipe detail on `WaterPipes`; sensor block on `Sensors` | `ObjectStatus` "Not to be trusted" (Error, warning icon) with the reason, who and when under it. A sensor mark shows on its pipe as "Sensor SENS-004 not to be trusted". Assumption: the health status and the ranking are not changed, only labelled; her plan list does not silently drop the pipe. |
| food-app (Tobin) | stock item row and detail (`StockItems`, for example Butter -3 KG) | Same badge and reason. Assumption: no ordering advice and no notification is generated from a quantity that is marked, and the quantity is shown as "not to be trusted" instead of a red shortage. |
| council-app (Rowan) | the at-a-glance overview, per tile and in a header count | A count "N records not to be trusted" and a warning icon on any tile that is based on a marked record, with a link to the investigation app. |

How far the mark changes calculations (label only, or exclude from numbers) is open question 1.

## 5. App proposal: investigation-app

Copy `src/oakhaven-app` to `src/investigation-app` and rename everywhere:

| Item | Value |
|---|---|
| folder | `src/investigation-app` |
| `sap.app.id` / namespace | `oakhaven.investigation` (JSDoc `@namespace oakhaven.investigation.controller`, `.model`) |
| `ui5.yaml` metadata name, `mountPath` | `oakhaven.investigation`, `/app/investigation` |
| `semanticObject` / action | `Investigation` / `display` |
| icon | a Tabler or SAP search icon, for example `sap-icon://search` |
| data source | `investigationService` -> `/odata/v4/investigation/` as default model |
| libs | `sap.ui.core`, `sap.m`, `sap.f` (and `sap.ui.layout` only if used), in `manifest.json` and `ui5.yaml` |

### Visual part (read: see what is wrong)

- `sap.f.DynamicPage`, theme `sap_horizon_dark`, no custom colours.
- Header: counters as `NumericContent` tiles: suspicious lines (now 3), impossible values (rules a and b, now 2), odd changes (rules c and d, now 3), not to be trusted, still to review (suspicious and not marked).
- Table `items="{/Findings}"`, sorted by severity (descending): 1. number of rules hit, 2. newest change, 3. entity then record (stable). Columns: Severity (`ObjectStatus`, text "3 of 4 rules" + icon + state), Line (entity + name, for example "Sensor SENS-004 on BAKERY-BRANCH"), Reason (plain words, wrapped), Last changed (UTC, "Oakhaven time" label), Changed by, Status (`ObjectStatus`: "Trusted" or "Not to be trusted" with Error state and icon; "trusted" only means "no mark", not "checked"), Actions.
- Empty state: `IllustratedMessage` "No suspicious lines found". Busy on the table; `busy=false` on error.

### Input part (write: act on it)

- Row button "Mark as not to be trusted" (the only `Emphasized` action per row) opens a dialog: a required `TextArea` "Reason" (prefilled with the generated reason, editable) and a required `Input` "Your name". Submit calls `markUntrusted` through an operation binding + `invoke()`; success `MessageToast`, errors `MessageBox.error` with the server message.
- A marked row shows "Clear mark" (confirmation dialog, then `clearUntrusted`).
- All texts in `i18n/i18n.properties`; destroy the dialog in `onExit`.

### Team principle

**Every app in this project has a visual part (see) and an input part (act).** Water-app: pipe overview and `logRepair`. Investigation-app: findings list and mark / clear. Food-app and council-app need an input part too (to be decided with Tobin and Rowan; never invented here).

### Tests (before saying done)

- Unit tests on the pure functions: exactly 2.0x is not flagged (100 vs 50), 100.01 is; 0 stock is fine, -0.01 is not; 03:59:59 is flagged and 04:00:00 is not; 00:00:00 is flagged; empty, `system`, `anonymous` are non-persons; null flow or nominal gives false.
- A scenario test on the seed data expects exactly the three findings of section 3.
- `npm test`, `npm run typecheck`, `npm run lint:ui5`, `npm run build`, then check the app in the browser (including a mark and a clear round trip). Test marks only in the local SQLite; `npm run db:reset` undoes them.

## 6. Open questions for Ilse (ranked, we cannot derive these)

1. When you mark a line "not to be trusted", should Maren, Tobin and the council still see it with a warning, or should the numbers be left out of what they work with (for example butter ignored in the stock advice)? (Decides label only versus exclusion; v4 only says they must not act on it.)
2. Is a change by the name "council" (15 records, all in daytime) as worrying as a change by "system", or is "council" a real person's account in your view? (Changes the number of suspicious lines.)
3. Besides the two examples (sensor over double, negative stock), do you also call these impossible: a repair dated in the future (2026-12-30), or the same place listed three times (Deepwood Forest)? (Only these two concrete cases; she said finding the lines is our job, so she may say "yours to find".)
