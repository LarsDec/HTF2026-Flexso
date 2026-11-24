# Council app: design (Rowan Ashby)

Design only, nothing built yet. Requirements: [COUNCIL-REQUIREMENTS.md](COUNCIL-REQUIREMENTS.md). References: Q1-Q6 = Rowan's answers, A1-A10 = assumptions in that doc, M-Q# = Maren, T-Q# / T-row# = Tobin, I-v# = Ilse. New assumptions of this design: A11-A22 (section 7).

## 0. Findings that change the plan

1. **The "not to be trusted" code is not on `main`.** `db/schema.cds` has no `Distrusts`; `srv/investigation-service.*`, `srv/lib/distrusts.ts`, `srv/domain/investigation.ts` and `src/investigation-app` do not exist (also not on `origin`, checked 2026-11-24). `NOT-TRUSTED.md` describes them as built: the code is on a teammate's machine. The council service depends on it landing first (step 4). The pure domain takes marks as input, so it can be built and tested without it.
2. **`Distrusts` starts empty.** With today's seed nothing is marked, so A10 alone would rank Butter −3 as "real panic". A15 therefore also treats impossible values found by the app as not to be trusted.
3. **No "nervous / real panic" function exists.** `food-reorder.ts` only has OK / ORDER_TODAY / LATE. Tobin's T-Q10 levels get a small new pure function in a new file, so the teammate's food files stay untouched.
4. **Food files are not changed.** The council only imports `loadConfig`, `pantryToday`, `loadReorderLines` (`srv/lib/food-pantry-data.ts`) and `toFixed` (`srv/domain/food-decimal.ts`).
5. **One small refactor of the water service.** The data loading in `srv/water-supply-service.ts` (`addHealthOverview`) moves to `srv/lib/water-network-data.ts` so both services share it. Behaviour unchanged.

## 1. Domain

### 1a. `srv/domain/food-comfort.ts` (new, pure)

```ts
export type ComfortLevel = 'fine' | 'nervous' | 'panic';
export function comfortLevel(current: string | number, minimum: string | number): ComfortLevel;
```

- `panic` when `2 × current < minimum`; `nervous` when `current < minimum`; else `fine` (T-Q10, T-Q11).
- Exact decimal compare with `toFixed`, no division, no floats. Strict: exactly the minimum = fine, exactly half = nervous (FOOD "ASSUMPTION – strict below").
- Minimum ≤ 0 → `fine`. Uses today's recorded stock, not a forecast (A14).

### 1b. `srv/domain/council.ts` (new, pure: no cds, no clock)

Reuses `evaluatePipes` output (status, `priorityRank`), `SECONDARY_LOOP_ID` and `KNOWN_DEPENDANTS` (`priority.ts`), `healthState` / `healthIcon` (`water-health.ts`), `flagSourceConflict` (`source-conflict.ts`, per sensor) and `comfortLevel`. **No thresholds of its own.**

**Inputs**

```ts
export type MarkEntity = 'WaterPipes' | 'Sensors' | 'Repairs' | 'Landmarks' | 'StockItems';
export interface CouncilPipe { ID: string; pipeID: string; status: HealthStatus; priorityRank: number;
  currentFlowRate: NumericInput; nominalFlowRate: NumericInput; currentPressure: NumericInput; readingAgeMinutes: number | null;
  sensors: readonly { ID: string; sensorID: string; flowRate: NumericInput }[];
  repairs: readonly { ID: string; issue: string | null }[]; }
export interface CouncilItem { ID: string; name: string; unit: string; currentQuantity: string; minStockLevel: string;
  isCritical: boolean; supplierName: string | null; dataError: boolean; }      // straight from ReorderLine
export interface CouncilLandmark { ID: string; name: string; suppliedBy: string | null; }
export interface TrustMark { entityName: MarkEntity; recordID: string; reason: string; markedBy: string; markedAt: string | null; }
export interface CouncilInput { pipes; items; landmarks; marks }   // readonly arrays of the above
export function buildCouncilPage(input: CouncilInput): CouncilPage; // { problems, untrusted, summary }
```

**Level order** (`COUNCIL_LEVEL_ORDER`): `waterAlarm` > `foodPanic` > `foodNervous` > `waterUnknown` > `waterAttention` (Q3 generalised = A7; "I don't know" placed by us = A11).

- Water: alarm → waterAlarm, unknown → waterUnknown, attention → waterAttention, fine → not a problem.
- Food: panic → foodPanic, nervous → foodNervous, fine → not a problem.
- State/icon: water via `healthState` / `healthIcon`; food panic `Error` + `sap-icon://alert`, food nervous `Warning` + `sap-icon://warning`.

**Sort**

1. SECONDARY-LOOP always last, whatever its status (A12; M-Q4 "nobody depends on it").
2. Level index.
3. Within a water level: Maren's `priorityRank` (M-Q10, M-Q12).
4. Within a food level: critical first (`isCritical`, T-row 2), then name (A13).
5. Water and food never share a level. `rank` = position 1..n.

**Who is affected** (Q3, Q4, A8, A18). Never totals or sums.

- Pipe in `KNOWN_DEPENDANTS` → `peopleKind='families'`, `peopleCount=140` (NORTH-BRANCH-02, M-Q4, M-Q13). Families, never converted to people.
- SECONDARY-LOOP → `nobody` (M-Q4).
- Other pipes → `unknown`, no number.
- Food items → `wholeVillage`, no number (A3, T-row 9).
- `places` = names of trusted landmarks with `suppliedBy === pipeID` (A2).
- `pipeNote`, Maren's words: `bakeryBread` (BAKERY-BRANCH), `farmAnimalsHalfDay` (SOUTH-BRANCH) (M-Q12). A fact, not a time-to-dry claim.

**Ties** (Q5, A9, A17)

- A tie exists when a water line and a food line are both on the page (ranked or untrusted), the pipe feeds trusted landmark L, and the item's `supplierName === L.name` (exact).
- Both ways: water row gets `tiedTo` (ranked items), `tiedToUntrusted`, `tieVia = L.name`; food row gets `tiedTo` / `tiedToUntrusted` (pipe IDs) and `tieVia`.
- A tie never changes the order (Q5 is conditional; Maren has not confirmed). The text states only the data fact plus "whether this affects the deliveries is not known".
- North Mill (supplier) ≠ North Mill House (landmark, no `suppliedBy`), so Flour has no tie.

**Untrusted handling** (Q6, A10, A15, A16)

Marks → `Map` keyed `entityName:recordID`. Each untrusted line has a `source`: `mark` (Ilse), `impossibleStock` or `sourceConflict` (found by the app). A mark replaces an automatic finding on the same record.

| Line | Effect (`effect` code) |
|---|---|
| StockItem marked, or `dataError` (stock < 0) | not ranked, no level (`notRanked`); recorded value shown |
| WaterPipe marked | not ranked (`notRanked`) |
| Sensor marked, or unmarked sensor with `flagSourceConflict` | its pipe is ranked on its own pipe reading (`pipeRankedOnOwnReading`); pipe row gets `trustNote` |
| Repair marked | not used on this page (`notUsedOnPage`) |
| Landmark marked | not used for places or ties (`notUsedForPlacesAndTies`) |
| Mark whose record no longer exists | listed with its recordID (`recordNotFound`), never dropped |

Invariant: **no untrusted line ever appears in `problems` or counts in a level.** Untrusted part order: stock, pipes, sensors, repairs, landmarks, then subject; labelled "not ranked".

**Outputs**

```ts
CouncilProblem { ID /* 'water:<uuid>'|'food:<uuid>' */; rank; area: 'water'|'food'; subject; level: CouncilLevel; levelState; levelIcon;
  flowRate; nominalFlowRate; flowPercent /* display only, Math.round */; pressure; readingAgeMinutes;   // water
  quantity; minimum; unit;                                                                              // food
  peopleKind; peopleCount: number|null; places; pipeNote; tiedTo; tiedToUntrusted; tieVia;
  trustNote: 'sensorNotTrusted'|'sensorsDisagree'|null; trustNoteSubject; lastOnList: boolean }
UntrustedLine { ID; lineKind: 'stockItem'|'pipe'|'sensor'|'repair'|'landmark'; subject; parentSubject;
  source; recordedValue; recordedUnit; comparedTo /* nominal flow for conflicts */; reason; markedBy; markedAt; effect }
CouncilSummary { pipesTotal, pipesAlarm, pipesUnknown, pipesAttention, pipesFine, pipesNotCounted, waterFineNames;
  itemsTotal, itemsPanic, itemsNervous, itemsFine, itemsNotCounted, foodFineNames; untrustedCount }
```

Backend returns codes and raw values only; the UI builds every sentence from i18n with `{0}` placeholders.

## 2. Service: `CouncilService`

```cds
service CouncilService @(path: 'council', impl: 'srv/council-service') {
  @readonly @cds.persistence.skip entity Problems       { key ID : String(80);  rank : Integer; area : String(5); subject : String; level : String(20); levelState : String(10); levelIcon : String; flowRate : Decimal(9,2); nominalFlowRate : Decimal(9,2); flowPercent : Integer; pressure : Decimal(9,2); readingAgeMinutes : Integer; quantity : Decimal(9,2); minimum : Decimal(9,2); unit : String; peopleKind : String(15); peopleCount : Integer; places : String; pipeNote : String(30); tiedTo : String; tiedToUntrusted : String; tieVia : String; trustNote : String(20); trustNoteSubject : String; lastOnList : Boolean; }
  @readonly @cds.persistence.skip entity UntrustedLines { key ID : String(120); lineKind : String(10); subject : String; parentSubject : String; source : String(20); recordedValue : Decimal(15,2); recordedUnit : String; comparedTo : Decimal(15,2); reason : String(500); markedBy : String(100); markedAt : Timestamp; effect : String(30); }
  @readonly @cds.persistence.skip entity Summary        { key ID : String(10); generatedAt : Timestamp; /* the CouncilSummary fields */ }
}
```

**Why computed entities, not projection + virtual fields:** a council row is either a pipe or a stock item and the ranking needs everything at once, so there is no DB row to enrich. Same approach as the teammate's `ReorderLines` / `OrderProposals`. A single function returning a structure would make UI5 list binding and `$count` harder.

**`srv/council-service.ts`**

- Local `CdsApi` / `CdsService` interfaces (`ApplicationService`, `on`, `ql.SELECT`, `log`), `require`, no `any`.
- `loadCouncilInput(now)` in one `Promise.all`, no query in a loop:
  - water: `loadPipeNetwork()` from `srv/lib/water-network-data.ts` (3 queries: pipes; sensors `ID, sensorID, pipe_ID, flowRate, lastReading`; repairs `ID, pipe_ID, repairDate, issue`) → `evaluatePipes(inputs, now)`.
  - food: `loadConfig()` → `loadReorderLines(pantryToday(config), config.rules)` (3 queries; `dataError` identical to the food app).
  - landmarks: `SELECT.from('oakhaven.curse.Landmarks').columns('ID','name','suppliedBy')`.
  - marks: `SELECT.from('oakhaven.curse.Distrusts').columns('entityName','recordID','reason','markedBy','createdAt')` (or the `distrusts.ts` helper if it offers an "all marks" read).
- Each READ handler calls `buildCouncilPage` and returns its slice with `$count`; single-key read returns the row or `req.reject(404)`.
- `Summary`: one row, `ID 'current'`, `generatedAt = now`.
- Three entities in one `$batch` each load the input (~24 small queries): fine for these sizes, no caching.

**`srv/lib/water-network-data.ts`** (refactor commit): `loadPipeNetwork()`; `water-supply-service.ts` calls it and keeps `evaluatePipes` and its mapping. Keep the 👋 EXAMPLE comments intact.

## 3. UI: `src/council-app`

Copy the shell from `src/water-app` and rename:

| Item | Value |
|---|---|
| `sap.app.id` / namespace | `oakhaven.council` (`@namespace oakhaven.council`, `.controller`, `.model`) |
| `ui5.yaml` | `metadata.name: oakhaven.council`, `mountPath: /app/council`, libs `sap.m`, `sap.f`, `sap.ui.core`, `themelib_sap_horizon` |
| manifest | dataSource `councilService` → `/odata/v4/council/` as default model (`autoExpandSelect`, `operationMode: Server`); libs `sap.ui.core`, `sap.m`, `sap.f`; `fullWidth: true` |
| inbound | semanticObject `Council`, action `display`, icon `sap-icon://ti/building-community` (fallback `sap-icon://group`) |
| index.html | `sap_horizon_dark`, resource-roots `{"oakhaven.council": "./"}` |

New app → `docker compose up --build --watch`.

**One view `Main.view.xml`, one `sap.f.DynamicPage`**; content in `fragment/CouncilPage.fragment.xml` (cheap "paper mode" fallback). Top to bottom:

1. **Title**: "Oakhaven this week"; "For the council, Monday evening at Shepherd's Inn"; "Made on {0}" (`Summary.generatedAt`, `DateTimeOffset` type) (Q1). Actions `Refresh` (Default, `model.refresh()`) and `Print` (only `Emphasized`, `sap-icon://print`), both `class="councilNoPrint"`.
2. **"How Oakhaven is doing"** (`binding="{/Summary('current')}"`), `ObjectStatus` lines with text + icon + state (Q1):
   - "Water: {alarm} alarm · {unknown} I don't know · {attention} needs attention · {fine} fine (of {total} pipes)"
   - "Food: {panic} real panic · {nervous} nervous · {fine} fine (of {total} items)"
   - "{n} lines not to be trusted, see below" (Error, only when n > 0)
3. **"Where it hurts, biggest first"** + "Order: water alarm, food real panic, food nervous, water I don't know, water needs attention" (Q3, A7, A11). `sap.m.Table items="{/Problems}"` (server-sorted). Columns:
   - `#` (`rank`)
   - Problem: `ObjectIdentifier` (`subject`; "Water pipe · feeds {places}" or "Pantry")
   - How serious: `ObjectStatus` (level text via i18n, `levelState`, `levelIcon`); facts "{0} of {1} L/min ({2}%), {3} PSI" or "{0} of minimum {1} {2}"; meaning line:
     - water alarm: "Weak taps at best (Maren). Whether and when it runs dry: not known." (M-Q13)
     - food panic: "Below half of Tobin's minimum: 'real panic'. When bread would run out: not known." (T-Q10, T-Q11)
     - food nervous: "Below Tobin's minimum: 'nervous'."
     - water unknown: "Reading older than 15 minutes or missing. Nobody knows; someone has to go and look." (M-Q5, M-Q11)
     - water attention: "What this means for people is not known yet."
     - with `trustNote`: second `ObjectStatus` (Error) "Sensor {0} on this pipe is not to be trusted".
   - Who is affected: "About {0} families (Maren)" / "Whole village, one shared pantry (number not known)" / "Number of people unknown" / "Nobody depends on it (backup ring, Maren)"; Maren's note on a second line (`councilMuted`).
   - Tied to: "{tieVia} is fed by this pipe and delivers {tiedTo}" / "Its supplier {tieVia} is fed by {tiedTo}", "(also: {tiedToUntrusted}, not to be trusted)", "Whether one makes the other worse is not known."
   - No `minScreenWidth` (no popins in print).
   - Empty: `IllustratedMessage` `sapIllus-SuccessHighFive`, "No part of the village has a water or food problem right now."
4. **"Fine"**: "Water fine: {waterFineNames}. Food fine: {foodFineNames}."
5. **"Not to be trusted (not used in the order above)"**: `Table items="{/UntrustedLines}"`:
   - Line: "Butter (stock)" / "Sensor {0} on {1}" / "Pipe {0}" / "Repair on {1}: {0}" / "Place {0}"
   - Status: `ObjectStatus` Error, `sap-icon://error`, "Not to be trusted" (Q6)
   - Recorded number: "{0} {1} recorded" or "sensor {0} L/min on a pipe of normal {1} L/min"
   - Why + who/when: Ilse's reason; "Marked by {0} on {1}" or "Found by the app; Ilse has not checked it yet"
   - Effect: "Not ranked" / "Pipe ranked on its own reading" / "Not used on this page" / "Not used for places and ties" / "Record not found"
   - `noDataText`: "No line is marked as not to be trusted."
6. **"What this page cannot tell you"** (muted): no people counts except North Residential Area, no time until a pipe runs dry or bread runs out, no money data (Q1, Q4, M-Q13, T-Q11).

**Controller / model**: bind in XML, no JSON copy. `dataReceived` → `MessageBox.error` with the server message. Tables `enableBusyIndicator`. `model/formatter.ts` (`@namespace oakhaven.council.model`) maps codes to i18n keys with `sap/base/strings/formatMessage`.

**Print** (Q1 "preferably on paper")

- `onPrint`: remember `Theming.getTheme()` (`sap/ui/core/Theming`) → `Theming.setTheme("sap_horizon")` → on `applied` (check `getTheme()==="sap_horizon"`, it can fire at once) call `(globalThis as { print?: () => void }).print?.()` → restore the theme. The `globalThis` narrowing avoids DOM lib types (tsconfig `lib` is `ES2022`) and `any`. Confirm with `npm run lint:ui5`.
- `css/style.css`, theme parameters, own classes only:

  ```css
  html, body, #container, #container-uiarea { height: 100%; }
  .councilMuted { color: var(--sapContent_LabelColor); }
  @page { size: A4; margin: 12mm; }
  @media print {
    html, body, #container, #container-uiarea { height: auto; overflow: visible; }
    .councilNoPrint { display: none; }
    .councilRow { break-inside: avoid; }
  }
  ```

- Risk: the DynamicPage / launchpad scroll container may clip the print to one screen. Check print preview standalone (`/app/council/index.html`) and in the launchpad. Fallback: a view flag hides the DynamicPage and shows a plain `VBox class="councilPaper"` with the same fragment.

**i18n keys**

| Area | Keys |
|---|---|
| App and page | `appTitle`, `appDescription`, `pageTitle`, `pageSubtitle`, `madeOn`, `refresh`, `refreshTooltip`, `print`, `printTooltip` |
| Summary | `summaryTitle`, `summaryWater`, `summaryFood`, `summaryUntrusted` |
| Problems table | `problemsTitle`, `orderExplained`, `colRank`, `colProblem`, `colSerious`, `colPeople`, `colTie`, `areaWater`, `areaFood`, `feeds` |
| Levels | `levelWaterAlarm`, `levelFoodPanic`, `levelFoodNervous`, `levelWaterUnknown`, `levelWaterAttention` |
| Facts and meaning | `factsWater`, `factsFood`, `meaningWaterAlarm`, `meaningFoodPanic`, `meaningFoodNervous`, `meaningWaterUnknown`, `meaningWaterAttention` |
| People and notes | `peopleFamilies`, `peopleWholeVillage`, `peopleUnknown`, `peopleNobody`, `noteBakeryBread`, `noteFarmAnimalsHalfDay` |
| Ties | `tieWater`, `tieFood`, `tieUntrusted`, `tieNotKnown` |
| Trust notes | `trustSensorNotTrusted`, `trustSensorsDisagree` |
| Fine and empty | `fineTitle`, `fineLine`, `emptyTitle`, `emptyText` |
| Untrusted table | `untrustedTitle`, `colLine`, `colStatus`, `colValue`, `colWhy`, `colEffect`, `notTrusted`, `lineStock`, `linePipe`, `lineSensor`, `lineRepair`, `lineLandmark`, `valueRecorded`, `valueConflict`, `markedByOn`, `foundByApp`, `effectNotRanked`, `effectPipeOwnReading`, `effectNotUsed`, `effectNoPlacesTies`, `effectNotFound`, `untrustedNone` |
| Closing and errors | `unknownsTitle`, `unknownsText`, `loadError` |

## 4. Input part

Rowan asked for no input. Only Refresh and Print (A19). The inputs that feed this page live with their owners: Maren logs repairs, Tobin orders and edits stock, Ilse marks lines. A "council decision" note would be an invented requirement. If the team wants an input part, ask Q-B (section 8) first; if yes, the smallest version is one action `noteDecision(problemID, text, by)` on a new `CouncilNotes` entity, shown in the footer.

## 5. Tests

`npm test` (glob `srv/domain/*.test.ts`, node:test + assert/strict, like `priority.test.ts`).

**`food-comfort.test.ts`**

| current / minimum | expected |
|---|---|
| 40/45 | nervous |
| 45/45 | fine |
| 22.5/45 | nervous (exactly half) |
| 22.49/45 | panic |
| 5/12 | panic |
| 6/12 | nervous |
| −3/12 | panic |
| "12.00"/"12" | fine |
| x/0 | fine |

**`council.test.ts`, seed fixture**: pipes and sensors from the CSVs, statuses from the real `evaluatePipes` with `now = 2026-11-16T17:05:00Z` (fresh readings); items from the CSVs with `dataError` true for Butter; landmarks from the CSVs; no marks.

**Expected output today**

| rank | subject | level | people | places / tie |
|---|---|---|---|---|
| 1 | NORTH-BRANCH-02 | waterAlarm (20/65, 31%, 22 PSI) | families, 140 | North Residential Area; no tie |
| 2 | Eggs | foodPanic (5 of 12 Dozen) | wholeVillage, null | tiedTo SOUTH-BRANCH via South Meadow Farms |
| 3 | Flour | foodNervous (40 of 45 KG) | wholeVillage, null | no tie (North Mill ≠ North Mill House) |
| 4 | SOUTH-BRANCH | waterAttention (40/60, 67%, 38 PSI) | unknown, null | South Meadow Farms; note farmAnimalsHalfDay; tiedTo Eggs, tiedToUntrusted Butter |
| 5 | SECONDARY-LOOP | waterAlarm (12/40, 30%, 20 PSI), lastOnList | nobody | none |

- Untrusted: Butter (`impossibleStock`, −3 KG, `notRanked`); SENS-004 (`sourceConflict`, 140 vs 50, parent BAKERY-BRANCH, `pipeRankedOnOwnReading`). BAKERY-BRANCH is fine, so not in `problems`.
- Summary: pipes 6 total, 2 alarm, 0 unknown, 1 attention, 3 fine, `waterFineNames` "BAKERY-BRANCH, NORTH-BRANCH-01, PRIMARY-MAIN"; items 10 total, 1 panic, 1 nervous, 7 fine, 1 not counted, `foodFineNames` "Apples, Bread, Cheese, Grain, Milk, Potatoes, Salt"; `untrustedCount` 2.

**Scenarios** (one test each)

1. Ilse marks Butter and SENS-004: same five problems; two untrusted lines `source 'mark'` with reason/by/at; no duplicate automatic lines.
2. Ilse marks Eggs: NB-02, Flour, SOUTH-BRANCH, SECONDARY-LOOP; Eggs `notRanked`; SOUTH-BRANCH `tiedTo` null, `tiedToUntrusted` "Butter, Eggs".
3. NB-02 sensor older than 15 min: NB-02 becomes waterUnknown at rank 3 (Eggs, Flour, NB-02, SOUTH-BRANCH, SECONDARY-LOOP), still 140 families.
4. SECONDARY-LOOP unknown or attention: still last.
5. Ilse marks the SOUTH-BRANCH pipe: not ranked; Eggs `tiedToUntrusted` SOUTH-BRANCH.
6. Ilse marks the South Meadow Farms landmark: no ties; SOUTH-BRANCH `places` empty; landmark listed `notUsedForPlacesAndTies`.
7. SOUTH-BRANCH fine: Eggs has no tie.
8. Milk nervous (critical) and Eggs nervous: Milk before Eggs.
9. Everything fine, no marks: `problems` empty.
10. Mark on an unknown recordID: `recordNotFound` line.
11. Invariants over all scenarios: no untrusted ID in `problems`; `peopleCount` non-null only for `KNOWN_DEPENDANTS` pipes; no food row has a count; level order monotonic apart from lastOnList.

**Manual** (local SQLite only, undo with `npm run db:reset`): rename a sensor ID to make a pipe stale; mark via `InvestigationService.markUntrusted` once it exists; compare the page and `GET /odata/v4/council/Problems` with the table above.

## 6. Build plan (small commits)

| # | Commit | Done when |
|---|---|---|
| 1 | Add Tobin's comfort levels as a pure function | `food-comfort.ts` + test; `npm test`, `npm run typecheck` green |
| 2 | Add council page ranking logic | `council.ts` + test (seed + scenarios 1-11); `npm test`, typecheck |
| 3 | Share water network loading between services | `srv/lib/water-network-data.ts`; water service uses it; `npm test`; `/odata/v4/water-supply/WaterPipes` unchanged; water-app works |
| 4 | *(dependency)* Investigation `Distrusts` on main | `oakhaven.curse.Distrusts` in `db/schema.cds`; get it from the teammate, do not re-implement |
| 5 | Add CouncilService with problems, untrusted lines and summary | cds + ts; `npm run build`; `npm run db:reset`; curl the three entities, match section 5 |
| 6 | Add council app shell and launchpad tile | ui5.yaml, manifest, Component, index.html, i18n, empty DynamicPage; `docker compose up --build --watch`; tile visible; `npm run lint:ui5` |
| 7 | Show ranked problems, fine line and untrusted lines on the council page | fragment, table, formatter; lint, typecheck; browser check against section 5 |
| 8 | Add printing to the council page | Print button, theme switch, print CSS; A4 print preview standalone and in the launchpad; fallback if clipped |
| 9 | Document council app design and assumptions | COUNCIL-REQUIREMENTS (A11-A22, "built"), NOT-TRUSTED council row, AGENTS.md project structure |

Final: `npm test`, `npm run typecheck`, `npm run lint:ui5`, `npm run build` clean; browser at `/launchpad/index.html` matches section 5; print preview checked. Report anything not verified.

## 7. New assumptions (ours, to explain or confirm)

- **A11.** Water "I don't know" goes after food nervous and before water needs attention. Keeps Maren's "unknown above needs attention" (M-Q11) and Rowan's Q3 order; an unknown cannot push above known serious problems (spirit of Q6).
- **A12.** SECONDARY-LOOP always last on the page but still shown (M-Q4; Q1 definition).
- **A13.** Within a level: water by Maren's priority; food critical first, then name.
- **A14.** Food levels use today's recorded stock, strict "below", exact decimal compare.
- **A15.** Impossible stock (< 0, Tobin's R4 data error) is not ranked even without Ilse's mark; listed as not to be trusted, "found by the app". Same for a sensor that disagrees with its pipe.
- **A16.** Per-entity effects of a mark as in the table in 1b.
- **A17.** A tie needs an exact supplier/landmark name match and both lines on the page; it never changes the order.
- **A18.** People only as Maren's 140 families; never totals or sums.
- **A19.** No input part; Refresh and Print only.
- **A20.** Paper = light theme while printing, plus a generation timestamp.
- **A21.** "This week" (A4) cannot be measured: no time-to-dry, no time-to-no-bread (M-Q13, T-Q11). The page shows today's state and lists what is unknown.
- **A22.** Maren's notes ("bread for the whole village", "animals manage about half a day") shown as her words, not as counts.

## 8. Questions for Rowan (9 left), only these change the build

- **Q-A (A11, one constant):** "Sometimes Maren's readings for a pipe are too old, so the page says 'I don't know' for it. Where should that pipe go on your page: above the eggs at 'real panic', between the flour and SOUTH-BRANCH, or at the bottom?"
- **Q-B (only if the team wants an input part):** "After Monday's meeting, would you want to write anything back on this page, for example what the council decided for each problem, or is reading and printing it enough?"

Not needed for the build: confirming A7 in general; The Bakery's people count (only adds a `KNOWN_DEPENDANTS` entry); what "needs attention" means for people and whether SOUTH-BRANCH hurts the farms (Maren; only change texts and tie wording).
