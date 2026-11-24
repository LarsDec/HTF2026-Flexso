# Water app requirements

Requirements for the water app (`src/water-app`, `srv/water-supply-service`, `srv/domain/*`). Source: chat with Maren Holt (water keeper) on the Hack The Future platform. Only her literal answers are requirements; everything under "Rules implemented" is our reading of them.

## Briefing

> "Six pipes, one crew, and I'm always too late. When something breaks, I don't know which pipe is worst or who's sitting without water. Help me know where to go first."

## Maren's answers

| # | Our question | Maren says |
|---|---|---|
| 1 | Last time it went wrong: what happened, workaround, ideal? | "I was trying to keep the north side running. Instead I heard it from North Residential Area, people knocking on my door about weak taps, and they've been at it for days now. By the time folks complain, I'm already too late." |
| 2 | If you could run a health check on your six pipes every morning, what would it tell you? | "Per pipe, one plain word: fine, needs attention, alarm, or "I don't know" when the numbers are old or missing. Then a short answer: where do I go first, where next, and why that one first. I've got one crew and can do at most two repairs a day, so I need to know where my morning goes." |
| 3 | Take NORTH-BRANCH-02. What would make you call it "needs attention", and what would make it "alarm"? Give me the actual numbers. | "Same rules as every pipe. "Needs attention" is when the flow drops below 80 percent of its normal flow, or the pressure falls under 40 PSI. "Alarm" is flow below half of normal, or pressure under 25 PSI. And it has to be *below*: exactly 80 percent or exactly 40 PSI is still fine by me." |
| 4 | Right now NORTH-BRANCH-02 and SECONDARY-LOOP are both in alarm, and you can only fix two a day. When two pipes are in alarm, what decides which one you go to first? | "NORTH-BRANCH-02, no question. The SECONDARY-LOOP is only the backup ring, so it always comes last, even when it's in alarm. Nobody depends on it, but about 140 families in North Residential Area depend on that north branch." |
| 5 | How old can a pipe's reading be before you'd say "I don't know"? | "Fifteen minutes. If the reading is more than fifteen minutes old when I look at it, I don't trust it, so I don't know. Same goes for missing numbers. I'd rather see "I don't know" than a green light that's lying to me." |
| 6 | Sometimes a pipe says 47 out of 50 but its sensor says 140. Which one do you trust? | "Honestly, I don't know. I'm not sure what those two numbers would even be, so I won't guess which one is right. Some numbers have looked odd lately, and Ilse at the library is looking into that. Ask her." |
| 7 | How many families depend on SOUTH-BRANCH, and how many on BAKERY-BRANCH? | "I don't have a family count for those two. The BAKERY-BRANCH feeds The Bakery, and that's bread for the whole village. The SOUTH-BRANCH goes to South Meadow Farms, where the animals can manage about half a day on the troughs. The only number I know by heart is the 140 families in North Residential Area." |
| 8 | When a repair is already booked for a pipe, how should your morning list show that? | "Booked ahead? We don't really work like that. One crew, and each morning I decide where we go. What I do know: after a repair I note it myself, with which pipe, what was wrong, the date and who did it. From then on the pipe should show as repaired, until new readings say otherwise. How you show that on the list is up to you, you're the experts." |
| 9 | Is there anything the tool must never do, something that would make you stop trusting it? | "Never tell me a pipe is fine when it doesn't actually know. If the reading is more than fifteen minutes old or a number is missing, I want to see "I don't know", not a reassuring green light. If I walk out in the morning trusting that and find a dry tap, I'm done with it." |
| 10 | When you decide where the crew goes first, what counts more: how bad the pipe is (alarm or needs attention), or how many people depend on it? | "How bad it is, always. An alarm comes before a "needs attention", whoever is on the other end. People only decide it when two problems are at the same level." |
| 11 | Where does an "I don't know" pipe go in your morning list compared to alarm and needs attention? | "Somewhere in the middle. The alarms come first, then the pipes I know nothing about, then the "needs attention" ones. If I don't know what a pipe is doing, someone has to go and look, and that can't wait a whole week." |
| 12 | Say BAKERY-BRANCH and SOUTH-BRANCH both "need attention" and you only have one repair slot left today. Which one do you go to first, and why? | "BAKERY-BRANCH first. They're both at the same level and neither one feeds the other, so it comes down to people. The Bakery makes bread for the whole village, while the animals at South Meadow Farms can manage half a day on the troughs. SOUTH-BRANCH waits for tomorrow." |

## Rules implemented

### Status

- Ratio = `currentFlowRate / nominalFlowRate`.
- Alarm: ratio < 0.5 or pressure < 25 PSI.
- Attention ("needs attention"): ratio < 0.8 or pressure < 40 PSI.
- Comparisons are strict: exactly 80 % or exactly 40 PSI is fine; exactly 50 % or 25 PSI is attention, not alarm.
- Worst of flow and pressure wins.
- Unknown ("I don't know"): the reading is older than 15 minutes, or a number is missing. Exactly 15:00 old is still ok, anything older than that is unknown. Unknown beats every other status and a pipe is never shown green when it is unknown.

### Ranking

- Severity first (v10): an alarm always comes before "needs attention", whatever the number of people. Only at the same level the number of dependants decides: NORTH-BRANCH-02 (about 140 families, North Residential Area) goes first among equals.
- SECONDARY-LOOP always comes last, even in alarm (backup ring, nobody depends on it).
- Order of statuses (v11): alarm, then "I don't know", then needs attention, then fine (`STATUS_ORDER` in `srv/domain/priority.ts`).
- Confirmed (v12): at equal status BAKERY-BRANCH goes before SOUTH-BRANCH (bread for the whole village vs animals who manage half a day), see `IMPACT_ORDER` in `srv/domain/priority.ts`. Order within equal status: known family count, then this impact order, then unknown pipes.
- Our assumption, not Maren's: the alphabetical tie-break by pipe ID only applies to pipes with no known impact.
- The morning list is capped at 2 repairs per day, one crew.
- No family counts exist for SOUTH-BRANCH and BAKERY-BRANCH, so no numbers are invented. The reason is shown in words: BAKERY-BRANCH = bread for the whole village; SOUTH-BRANCH = animals, about half a day.

### Repairs

- Repairs are not booked ahead. They are completed repairs that Maren notes afterwards: pipe, what was wrong, date, who did it.
- After a repair the pipe shows "repaired" until new readings say otherwise. This is a label next to the status, not a fifth status. Limitation: the demo feed refreshes sensors every 20 s, so the label disappears quickly in the demo.
- A repair dated in the future on SOUTH-BRANCH, logged by `system`, is flagged as suspicious and is not treated as a repair.
- Assumption (our reading of Maren's v8 answer, not a new question): Maren notes repairs herself, so the app has a 'Log repair' action (pipe, what was wrong, date, who did it). It only records completed repairs: a future date or an empty / 'system' name is refused.

### Source conflict

- SENS-004 reports flow 140 while the pipe (BAKERY-BRANCH) says 47/50. Maren does not know which is right and refers to Ilse (library). The app only flags that the sources conflict and does not pick one. Ilse (investigation) confirmed: she would not pick a source on a hunch, a sensor reading more than double the pipe's normal flow "simply cannot be true", and a pipe that disagrees with its own sensor deserves suspicion. So the "more than twice the nominal flow" threshold comes from Ilse. She wants to see when the line was last changed and by whom.
- Implemented: the flag shows which sensor reads what, and when and by whom that line was last changed (Ilse's wish).

## Data now

| Pipe | Flow / nominal | Pressure (PSI) | Status |
|---|---|---|---|
| PRIMARY-MAIN | 142 / 150 | 58 | fine |
| NORTH-BRANCH-01 | 76 / 80 | 52 | fine |
| NORTH-BRANCH-02 | 20 / 65 | 22 | alarm |
| BAKERY-BRANCH | 47 / 50 | 47 | fine (source conflict with SENS-004) |
| SOUTH-BRANCH | 40 / 60 | 38 | needs attention |
| SECONDARY-LOOP | 12 / 40 | 20 | alarm, always last |

## Open questions

- Family counts for the other pipes are unknown.
- Unknown when a pipe has no timestamp of its own: the newest sensor reading is used.

## Our own assumptions (not from Maren, to confirm)

- Map: the pipe routes are drawn on `oakhaven-map.jpg` from `WaterPipes.mapPath`. Status is shown by line style (thick solid = alarm, dashed = needs attention, thin solid = fine, dotted = unknown) plus a text label and a legend with icons. Selecting a route or a list row highlights the other. Maren never asked for a map.
- "My morning" cards show the rank as an ordinal ("1st priority", "2nd priority"): the order of the plan, not the position in the full list. The server fills `morningRank` (1 or 2, else empty) and exposes the plan as the read-only `MorningPlan` entity (top 2 chosen server-side).
- The "not to be trusted" mark is shown on the card, in the list and on the map label, with the reason and who/when. The app does not pick a side and does not hide the pipe.
- The repair dialog refuses empty fields, a future date and the name "system" in the UI as well as on the server.
- A Dutch UI text set (`i18n_nl.properties`) exists as a convenience; English stays the fallback.
