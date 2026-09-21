# Handoff — Live COG Session Bridge

Date: 2026-09-20 (America/Mexico_City)

## Repositories and branch

Work spans two repositories and MUST stay on the same feature branch until verification is complete.

- YouTeach: `Youteach-org/YouTeach`
  - branch: `feature/live-cog-session-current-20260920`
  - current verified implementation checkpoint: `5c2cc2f5b16042441581f6685f14c9c095cd9a5f`
- Classroom Online Games: `Youteach-org/Classroom-Online-Games`
  - branch: `feature/live-cog-session-current-20260920`
  - current verified implementation checkpoint: `d2fc95a22a243f803aa0e0afbbffb03434f31d16`

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

## CI status — latest verified checkpoint

Both repositories now belong to `Youteach-org` and use the same feature branch.

### YouTeach

- repo: `Youteach-org/YouTeach`
- verified HEAD: `5c2cc2f5b16042441581f6685f14c9c095cd9a5f`
- run: `35568127333`
- server JavaScript syntax: GREEN
- tests: **134/134 GREEN**
- Pages build: GREEN

Teacher-facing Results TDD remains verified:
- `60f12c07cdcbab158556bddd35f0a69297b10c6c` — RED display tests.
- `8616af768d475caba503e2a7c27576b3262e2813` — first GREEN display/index implementation.
- `c3ffc87421b7d1ba5aace824a64430c438374e75` — RED authenticated-read tests.
- `b1ee0a3d6bd4f5bbd5ebd83f2f6497a4398e474a` — authenticated result-read implementation GREEN.

### Classroom Online Games

The repository was transferred from the personal owner to:
- repo: `Youteach-org/Classroom-Online-Games`
- branch migration preserved history and refs.

The transfer resolved the Actions runner-allocation failure:
- transferred checkpoint `9dbf1e3709bc4ac668054f510972f8bb37c62050`;
- old run `35565450102` was retried under the organization;
- isolated `runner-probe` received GitHub-hosted runner `1000000019` and passed;
- rerun split jobs then passed: syntax, shared-bridge, Verb Runner, 100 Students Said, Support Meter, OSASCOMP and build.

Latest verified COG contract checkpoint:
- HEAD: `d2fc95a22a243f803aa0e0afbbffb03434f31d16`
- run: `35568129792`
- runner-probe: GREEN
- syntax: GREEN
- shared-bridge: **10/10 GREEN**
- Verb Runner: GREEN
- 100 Students Said: GREEN
- Support Meter: GREEN
- OSASCOMP: GREEN
- build: GREEN

The prior no-runner failure was therefore an owner-level Actions infrastructure condition, not a product-code failure.

### Task 15 contract verification

Completed RED → GREEN in both repos:
- YouTeach RED `b88b0a743323c38916f3c4c0114d45a025d8807d`, run `35568075925`: 133/134 with one intentional schema mismatch.
- COG RED `733de01472f4d5f8e19389cd8d217688c66e261b`, run `35568079733`: shared-bridge 9/10 with one intentional schema mismatch.
- YouTeach GREEN `5c2cc2f5b16042441581f6685f14c9c095cd9a5f`, run `35568127333`: 134/134 + build.
- COG GREEN `d2fc95a22a243f803aa0e0afbbffb03434f31d16`, run `35568129792`: full split workflow + build.

Canonical cross-repo contract is pinned to `schemaVersion: 1`.

## Completed since the original handoff

### Teacher-facing result display in YouTeach

The visible Results loop is now implemented and verified.

Canonical idempotent receipt storage remains:
`classroomGameResults/{cogSessionId}/{studentKey}/{resultId}`

A display-oriented assignment index is mirrored from the canonical receipt:
`classroomGameResultsByAssignment/{assignmentId}/{studentKey}/{resultId}`

Rules:
- canonical receipt remains the idempotency authority;
- duplicate/retry requests reuse the existing canonical receipt and backfill the assignment index;
- attempt history is preserved; no attempt is silently discarded;
- Assignments highlights the latest receipt but exposes full result history;
- game-specific allowlisted metrics are shown;
- percentages and game points are labeled as game results, **not assignment grades**;
- AI/manual grading controls do not treat COG receipts as PDF submissions or fabricate a grade.

Teacher read path:
- endpoint: `/api/cog-assignment-results`
- requires a valid signed teacher session;
- the browser does not attach a direct Firebase listener to the COG result index;
- Assignments refreshes the authenticated result cache periodically while COG assignments exist.

## Important unfinished work

### 1. Task 16 — browser E2E with existing Ghost students

CI and cross-repository contract tests are now trustworthy and GREEN. The remaining acceptance gate is real browser verification. Reuse the existing Ghost accounts; never create duplicate Ghost students.

Minimum cases:

- Verb Runner:
  teacher start -> Student Buzzer JOIN GAME -> canonical identity -> heartbeat -> complete -> exactly one result receipt -> same receipt retry does not duplicate -> teacher end.
- Support Meter:
  create native assigned session -> register YouTeach -> automatic student identity -> complete 8 stories -> result receipt -> END ACTIVITY closes access but retains history.
- OSASCOMP:
  teacher start -> deterministic room -> automatic student identity -> finish -> one result receipt -> reopen monitor resumes same active room -> teacher end.
- 100 Students Said:
  teacher start -> students remain inside Student Buzzer -> buzzer/turns/points -> NO external JOIN GAME -> teacher end.
- Expiry:
  automated policy verification for 90-second stale presence and 60 continuous minutes of zero presence; any return before expiration resets `noPresenceSince`.

### 2. Task 17 — final verification / documentation / deploy

Only after Task 16 passes:
- update final README/continuity documentation;
- verify exact final commits GREEN in both repositories;
- create/update PRs as appropriate;
- do not merge to `main` before E2E;
- deploy through the established Cloudflare Pages workflow after source is settled in GitHub.

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
