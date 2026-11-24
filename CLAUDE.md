@AGENTS.md

## Working method (team agreement)

### Divide the work over subagents
- The main agent stays on the villager chat (read along, log answers, propose the next question). Everything else goes to subagents, each with the model that fits the task:
  - **haiku**: mechanical edits, counters, doc clean-up.
  - **sonnet**: code, tests, scenario scripts, docs checks, repo research.
  - **opus**: synthesis, architecture, solution texts.
- A subagent gets one self-contained task with clear done-criteria and reports back briefly: files changed, what was tested, what was not. The main agent checks the diff and test results before saying anything is done.
- Never start a second subagent on files another one is using.

### Villager answers go in docs
- Every question and the villager's literal answer is logged in a per-villager doc (question number, our question, the answer, derived rule, questions left). Only literal answers are requirements; our own reading is marked as an assumption.
- Before proposing a question, check that doc: a question must be 100% new. A wasted question cannot be recovered.
- Keep the app's requirements doc (`docs/<APP>-REQUIREMENTS.md`) in sync: add the answer row, move confirmed rules out of "open questions", mark our own assumptions as assumptions.

### How we ask questions (limited budget, so every question must pay off)
- One question per message, English, simple, max 600 characters, no jargon.
- Ask open, scene-setting questions that make the villager give the whole picture. Example: "If you could run a health check on your six pipes every morning, what would it tell you?" answered our planned questions 1 and 2 in one reply (statuses, order, "why", the two repairs a day).
- Use concrete choices with real numbers or two real pipes when we need a decision rule ("A or B first?"), not abstract ones.
- Do not ask what the villager already said or what the data answers. If the villager refers to someone else ("ask Ilse"), ask that villager instead.
- Leftover questions need not be used up. Use them only when another villager refers to something, or when nothing else is left.

### Verification
- Done means: `npm test`, `npm run typecheck`, `npm run lint:ui5`, `npm run build` clean and the change checked in the browser. Say what was not verified.
- Never invent requirements. Commit style: English, imperative, capitalised, no prefix, no trailing period; small commits per concern.

### Test data without touching the repo
- Test scenarios (stale readings, repairs, alarms) are applied to the local SQLite DB only, never to the CSVs, and undone with `npm run db:reset`. The demo feed (`srv/lib/demo-freshness.ts`) refreshes sensors every 20 s; rename a sensor ID to exempt it from the feed while testing.
