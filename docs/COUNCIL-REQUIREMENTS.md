# Council app requirements

Requirements for the council app (`src/council-app`, planned). Source: chat with Rowan Ashby (village council) on the Hack The Future platform; the same answers are in `VILLAGERS.md`. Only his literal answers are requirements. Everything we derived is marked **assumption**.

## Briefing

> **[brief]** "Every week we decide where the village's money goes, and every week we're guessing. We want to see at a glance how Oakhaven is doing and where it hurts."

## Rowan's answers

| # | Our question | Rowan says |
|---|---|---|
| 1 | Picture next week's council meeting. Before you decide where the money goes, you get one screen about Oakhaven. What would you want to read on it, and what would make you say "this is where it hurts, the money goes here"? | "Ah, Monday evening at Shepherd's Inn. I would want one page, preferably on paper, that tells us how Oakhaven is doing on water and food together, with the biggest problems right at the top. "This is where it hurts" is simple for me: a part of the village where someone may go without water or go hungry this week. How you measure that, you'll have to tell me, you're the experts." |
| 2 | Say on Monday two problems are on your page: NORTH-BRANCH-02 is in alarm, and about 140 families in North Residential Area have weak taps. And Tobin's flour is already below his minimum, so bread for the whole village is at risk. Only one can go at the top. Which one, and what made you choose? | "That is a hard one, and exactly the kind of choice that keeps us at the table until late. My gut says the bread, because it touches the whole village, while weak taps still means those families get some water. But I'd want the page to tell me how serious each one really is. Maren can tell you what an alarm on NORTH-BRANCH-02 means, and Tobin what "below his minimum" means for this week." |
| 3 | Here is what Maren and Tobin told us. Your page this Monday would hold four problems: NORTH-BRANCH-02 in alarm (Maren drops everything), SOUTH-BRANCH needs attention, eggs at "real panic" (below half Tobin's minimum), and flour at "nervous" (just under his minimum). How would you order these four, and why? | "If Maren drops everything for NORTH-BRANCH-02, that goes at the top: families without proper water is the first thing we must fix. Then the eggs, because "real panic" sounds worse than "nervous", then the flour, and SOUTH-BRANCH last, since it only needs attention for now. But if your page can say how many people each problem touches, I'd trust the order a good deal more." |
| 4 | You'd trust the order more if the page said how many people each problem touches. How many people or families live in Oakhaven in total? And roughly how many depend on North Residential Area, The Bakery and South Meadow Farms? | "I'm afraid I don't have that number in my head, and I won't guess, because a wrong number is exactly what gets our money spent in the wrong place. If it's somewhere in the data that survived the Desync, you'll find it better than I would. And do ask me about those three parts of the village separately, one at a time." |
| 5 | Let's start with South Meadow Farms. It sits on SOUTH-BRANCH, which needs attention, and it also delivers Tobin's eggs and butter. Who depends on the farms, and does that change where SOUTH-BRANCH goes on your page? | "Who exactly depends on the farms, I couldn't tell you; Tobin knows best who gets what from them, and Maren whether SOUTH-BRANCH can hurt the farms' work. But if a water problem there could make the egg trouble even worse, then it's no longer a small item at the bottom of my page. I'd want the page to show me when two problems are tied together like that, so we don't fix one and forget the other." |
| 6 | Ilse has marked two lines as "not to be trusted": Tobin's butter count (minus 3 kg) and a flow sensor on BAKERY-BRANCH. On your Monday page, what should you see for those two, and should they still count when you order the problems? | "I'd want to see both of them on the page, clearly marked in plain words as "not to be trusted", not quietly left out. I simply don't want to spend our money on a wrong number, so I'd rather they didn't push anything to the top on their own. How you handle them in the order is up to you, and Ilse knows best what's wrong with them." |

## Rules confirmed by his words

- The council meets every week on Monday evening at Shepherd's Inn (answer 1).
- One page, preferably on paper, so it must be printable (answer 1).
- Water and food together on that page (answer 1).
- The biggest problems at the top (answer 1).
- "Where it hurts" = a part of the village where someone may go without water or go hungry this week (answer 1).
- How to measure that is left to us ("you're the experts"). Every measure we choose is therefore an assumption that we must be able to explain.
- The page must tell how serious each problem really is (answer 2).
- His reasoning: something touching the whole village weighs more than weak taps, because weak taps still means those families get some water (answer 2). This is his "gut", not a fixed rule.
- For the four problems in answer 3, his order is: 1. NORTH-BRANCH-02 (water alarm), 2. eggs (food real panic), 3. flour (food nervous), 4. SOUTH-BRANCH (water needs attention) (answer 3).
- His reasons, literal: "families without proper water is the first thing we must fix" (water alarm first); "real panic" sounds worse than "nervous" (eggs before flour); SOUTH-BRANCH last because it "only needs attention for now" (answer 3).
- The page should say how many people each problem touches; he would trust the order a good deal more (answer 3).
- Q3 replaces his Q2 "gut says the bread": once he saw the levels, the water alarm goes first (answer 3).
- Rowan does not know how many people live in Oakhaven and will not guess: "a wrong number is exactly what gets our money spent in the wrong place" (answer 4). So the page must never show an invented or estimated people count.
- He wants the three parts of the village (North Residential Area, The Bakery, South Meadow Farms) asked about one at a time (answer 4).
- The page must show when two problems are tied together, "so we don't fix one and forget the other" (answer 5).
- If a water problem could make a food problem worse, it is "no longer a small item at the bottom of my page" (answer 5). Conditional: this only applies if the link is real. Rowan does not know whether it is (see A9).
- Marked "not to be trusted" lines (Ilse's marks, see `NOT-TRUSTED.md`) stay on the page, clearly marked in plain words "not to be trusted", never quietly left out (answer 6).
- A marked line must not push anything to the top on its own; "I'd rather they didn't push anything to the top on their own" (answer 6).
- How marked lines are handled in the order is left to us: "How you handle them in the order is up to you" (answer 6).
- What is wrong with a marked line is Ilse's domain: "Ilse knows best what's wrong with them" (answer 6). Show her reason on the page.

## Our own assumptions (not Rowan's words, to confirm or explain)

- A1. Reuse Maren's pipe statuses and Tobin's reorder statuses instead of inventing new thresholds.
- A2. "A part of the village" for water = the landmarks fed by a pipe (`Landmarks.suppliedBy`).
- A3. Food is one shared pantry (Tobin, FOOD-REQUIREMENTS row 9), so food problems are village-wide.
- A4. "This week" = the 7 days after the meeting.
- A5. We do NOT turn "bread above water" into a fixed ranking rule. Seriousness must come from Maren (what an alarm on NORTH-BRANCH-02 means) and Tobin (what "below his minimum" means for this week).
- A6. Mapping Tobin's "nervous" and "real panic" to the page's seriousness levels (for example warning and alarm) is ours. He named no levels, only the two feelings.
- A7. Generalised level order for the page = water alarm, food real panic, food nervous, water needs attention, then fine. Based on one example only (answer 3). To confirm with Rowan, especially whether food nervous always goes above water needs attention.
- A8. Where no count is known, the page says so in words (e.g. "number of people unknown"), never with an invented number. For food it says "whole village (one shared pantry)" without a number (answer 4, A3).
- A9. A "tie" = a pipe that feeds a landmark which is also the supplier of a stock item with a problem (here SOUTH-BRANCH -> South Meadow Farms -> Eggs, Butter). Whether SOUTH-BRANCH actually hurts the farms is NOT known. Until Maren confirms, the page shows the link as a fact from the data, not as a cause (answer 5).
- A10. A marked "not to be trusted" line gets no seriousness level of its own and does not count in the ranking. It is listed in a separate "Not to be trusted" part of the page, with Ilse's reason, who marked it and when. A problem that also has trusted evidence keeps its place: BAKERY-BRANCH is ranked on its pipe reading, not on the marked sensor SENS-004; Butter -3 is not ranked as "real panic" (answer 6).

## Data fact

- There is no money, cost, price or budget field in the data model (checked `db/schema.cds`). The page cannot show money; it can only show where it hurts.
- No population, household or family count exists anywhere in `db/data` or `db/schema.cds` (all CSVs checked). The only number is Maren's "about 140 families" on NORTH-BRANCH-02 (chat).
- South Meadow Farms (SOUTH-BRANCH) is also the supplier of Tobin's Eggs and Butter (`StockItems.supplier_ID` -> `Suppliers`).

## Open questions

- How serious each problem is:
  - Food (answered by Tobin, chat Q10): "Below it I get nervous, and below half of it it's real panic." So the food levels are: below minimum = nervous; below half of minimum = real panic. Flour now is "just a bit under that comfort level", so nervous, not panic.
  - Water (Maren, chat Q13, literal): "An alarm on NORTH-BRANCH-02 means less than half the water is getting through, or the pressure is under 25 PSI. For those 140 families that's weak taps at best; they've been complaining about exactly that for days. Whether it goes fully dry, and how soon, I honestly can't tell you. That's why I drop everything for an alarm." So a water alarm means weak taps at best for the people on that pipe. No "goes dry" time is known, so the page must not claim one. What "needs attention" means for people is still unknown (Maren asked to be asked separately).
- Bread (Tobin, chat Q11, literal): "Whether I'd bake fewer loaves or stop altogether, I honestly can't tell you, because I've never let it come to that and I don't want to find out!" So the food levels are only nervous (below minimum) and real panic (below half of minimum). No "people go without bread" point exists, so the page must not claim one.
- How the money is divided (Maren, Q13): "how the money gets divided is Rowan's business, so ask the council about that part."
- How many people each problem touches: total population is unknown to Rowan and not in the data; he will not guess (answer 4), so the page shows no total. Known: about 140 families in North Residential Area (NORTH-BRANCH-02, Maren). Still to ask, one at a time: The Bakery (BAKERY-BRANCH).
- South Meadow Farms (answer 5): who depends on the farms is referred to Tobin (the data already says Eggs and Butter, `StockItems.supplier_ID`). Whether SOUTH-BRANCH (needs attention) hurts the farms' work and their egg/butter deliveries, and from what point, is referred to Maren.
- Who acts on the decision?

## Questions left

9 of 15.
