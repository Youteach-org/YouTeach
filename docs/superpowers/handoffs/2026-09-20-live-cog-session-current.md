# Handoff — Live COG Session Bridge

Date: 2026-09-20 (America/Mexico_City)

## Repositories and branch

Work spans two repositories and MUST stay on the same feature branch until verification is complete.

- YouTeach: `youteachtk/YouTeach`
  - branch: `feature/live-cog-session-current-20260920`
  - HEAD verified at handoff: `fa93fa5f2e35a3c8af38234a8c42d68b3315c542`
- Classroom Online Games: `youteachtk/Classroom-Online-Games`
  - branch: `feature/live-cog-session-current-20260920`
  - HEAD verified at handoff: `9d42a7569f8f3382b262e5d1db636f4f51d35412`

Always verify actual HEADs before changing anything; this handoff can become stale after a push.

## Source of truth

Read these first in YouTeach:

- `docs/superpowers/specs/2026-09-20-live-cog-session-bridge.md`
- `docs/superpowers/plans/2026-09-20-live-cog-session-bridge.md`

Important accepted architecture:

- A COG activity in YouTeach Assignments is the authorized origin for the live launch context.
- Opening a game/monitor MUST NOT by itself publish a live activity.
- Each game keeps its own native session lifecycle and only publishes to YouTeach when the teacher explicitly starts it.
- Ending is explicit and confirmed.
- Browser close/navigation does NOT end the activity.
- Teacher/student presence is heartbeat-based.
- Presence is stale after 90 seconds.
- A live activity expires after 60 continuous minutes with zero presence.
- Results are returned to YouTeach idempotently.
- Canonical live game ids are exactly:
  - `verb-runner`
  - `support-meter`
  - `100-students-said`
  - `osascomp`
- `100-students-said` is Student-Buzzer-native: it has no external student launcher.

## Completed in YouTeach

Implemented on the feature branch:

- Shared live COG catalog in `functions/_shared/cog-live-http.js`.
- Teacher/student launch and resolve endpoints.
- Live session register/end/heartbeat.
- Student eligibility checks against group + assignment recipients.
- Server-side live expiry evaluator.
- Student Buzzer polls expiry and persists `status: expired`.
- Idempotent result receiver:
  - canonical path: `classroomGameResults/{cogSessionId}/{studentKey}/{resultId}`
  - conditional write / duplicate-safe behavior.
- Allowlisted per-game result metrics, including Verb Runner, Support Meter and OSASCOMP fields.
- 100 Students Said is explicitly marked Buzzer-native and external launch is blocked for it.
- Canonical catalog tests were added.

Important YouTeach commits near current HEAD:

- `47efb15c6d855477d6b10d679e67f538b904cb0d` — preserve allowlisted game-specific live metrics. This run was GREEN.
- `c4ce334c2280739b046ec3fec18186ab6b8f9ec7` — 100 Students Said native Buzzer launch contract.
- `0abcbacdcaa59150e00e92f11b05cc0cde8edf48` — mark 100 Students Said as Student Buzzer native.
- `81725194d45907283320cf2f458f8861fe199dc2` — block external launch for native Buzzer games.
- `fa93fa5f2e35a3c8af38234a8c42d68b3315c542` — canonical live COG game catalog test.

## Completed in Classroom Online Games

### Shared bridge

`shared/youteach-live-bridge.mjs` supports:

- teacher context resolve/save/load
- session register/end
- teacher heartbeat
- student resolve/save/load
- student heartbeat
- result submission

### Verb Runner

Implemented:

- explicit teacher live session start/end lifecycle
- YouTeach student launch + canonical identity
- teacher/student heartbeat
- idempotent result return with stable attempt/result ids
- retries reuse the same result object/resultId

Known GREEN checkpoint for result tests:
- `8cfa64ea87728160ba77d5904dab88bc7ab0f605` — Verb Runner live result suite passed before later CI infrastructure trouble.

### 100 Students Said

Implemented:

- explicit `START LIVE ACTIVITY`
- explicit confirmed `END ACTIVITY`
- teacher heartbeat
- monitor opening alone does not register a live game
- native mechanics remain unchanged
- students participate inside YouTeach Student Buzzer
- no external `JOIN GAME` route for this game

Known GREEN checkpoint before later CI infrastructure trouble:
- `10b652dd6a42609b8a46a0603ff0f5be7023a5e7` — monitor live bridge changes passed.

### Support Meter

Implemented:

- `Support-Meter/live-session.js` adapter
- native assigned session is created before YouTeach registration
- explicit confirmed `END ACTIVITY`
- non-destructive native session close (link invalidated; historical results retained)
- teacher heartbeat and re-entry behavior
- YouTeach live student launch
- canonical YouTeach identity stored on native runs
- student heartbeat
- final result automatically returned to YouTeach after 8 stories
- live result includes Support Meter, streak, stories completed and translation attempts
- standalone/free/link modes were preserved

### OSASCOMP

Implemented and now present at current branch HEAD:

- inline behavior was extracted to:
  - `OSASCOMP/student.js`
  - `OSASCOMP/teacher/monitor.js`
- `OSASCOMP/live-session.js` adapter
- deterministic room id derived from YouTeach session + assignment
- monitor re-entry attempts heartbeat first and resumes the same room if still active
- opening monitor does not register a new live session
- explicit teacher start and confirmed end
- teacher heartbeat
- YouTeach student launch with verified canonical identity
- student heartbeat
- final OSASCOMP result returned idempotently with score, correct, errors, attempts, best combo and mode
- current relevant commits:
  - `92335e7819` — live-session adapter
  - `82fa2bcefb` — teacher controls
  - `044489af88` — teacher lifecycle
  - `d4da523c15` — load live student module
  - `b1d9172f02` — YouTeach identity/results
  - `1f3fe4bdea` — OSASCOMP live verification
  - `9d42a7569f8f3382b262e5d1db636f4f51d35412` — canonical game catalog contract

## CI status at handoff

DO NOT interpret the current red Actions state as proof of product/test failures yet.

Classroom Online Games latest run at handoff:
- run `35548676940`
- HEAD `9d42a7569f8f3382b262e5d1db636f4f51d35412`
- all jobs report failure, INCLUDING `runner-probe`
- jobs expose no steps/logs through the connector
- `runner-probe` only runs:
  - `node --version`
  - `echo "runner-ok"`
- therefore first suspect GitHub Actions runner/infrastructure execution, not game code.

The workflow was deliberately split into jobs:
- runner-probe
- syntax
- shared-bridge
- verb-runner
- hundred-students-said
- support-meter
- osascomp
- build

Current workflow uses `actions/checkout@v5` for checkout jobs.

YouTeach latest run at handoff:
- run `35548673538`
- HEAD `fa93fa5f2e35a3c8af38234a8c42d68b3315c542`
- failure with no exposed steps/logs through the connector
- last clearly GREEN YouTeach checkpoint in this work: `47efb15c6d855477d6b10d679e67f538b904cb0d`, run `35547999655`.

### First action for the next instance

1. Verify both HEADs.
2. Check Actions again.
3. If `runner-probe` still fails before exposing steps, DO NOT start rewriting product code to chase the red status.
4. Retry or diagnose Actions infrastructure first.
5. Once runner-probe works, use the split jobs to fix any actual failing suite one game at a time.

## Important unfinished work

### 1. Teacher-facing result display in YouTeach

Result ingestion exists, but the full user-facing loop is NOT complete until the teacher can see COG results in the appropriate YouTeach Assignments review/results surface.

Do not assume that writing `classroomGameResults` is sufficient.

Required next work:
- inspect current Assignments review UI
- decide/read plan for how live COG receipts join the assignment/student rows
- show canonical result + game-specific metrics without fabricating grading
- preserve idempotent receipt semantics

### 2. End-to-end browser verification after CI recovers

Verify with real YouTeach flow and existing Ghost test students. Do not create duplicate Ghost accounts.

Minimum E2E cases:

- Verb Runner:
  teacher start -> Student Buzzer JOIN GAME -> canonical identity -> heartbeat -> complete -> one result receipt -> retry does not duplicate -> teacher end.
- Support Meter:
  teacher creates native assigned session -> YouTeach register -> student auto-identity -> 8 stories -> result receipt -> teacher end closes native link without deleting historical result.
- OSASCOMP:
  teacher start -> deterministic room -> student auto-identity -> finish -> one result receipt -> teacher reopen resumes same room while active -> teacher end.
- 100 Students Said:
  teacher starts monitor activity -> students stay in Student Buzzer -> buzzer/turn/points work -> NO external JOIN GAME -> teacher end.
- Expiry:
  zero presence must become `expired` after 60 continuous minutes; returning before that clears the zero-presence timer.

### 3. Documentation / final merge

After true green + E2E:
- update plan/ledger/spec with final checkpoints
- create/update PR(s) as appropriate
- do not merge to main until verification is complete
- deploy only after source is settled in GitHub

## User workflow rules that matter here

- GitHub is source of truth.
- Do not repeat completed work.
- Do not ask micro-decision questions; inspect current state and proceed.
- Keep decisions documented in GitHub.
- Do not modify the main game unnecessarily while adding integration.
- Preserve standalone/free modes where they already exist.
- For programming, provide complete files if manual replacement is ever required.
- 100 Students Said participation is Student-Buzzer-native.
- Never create duplicate Ghost students.
