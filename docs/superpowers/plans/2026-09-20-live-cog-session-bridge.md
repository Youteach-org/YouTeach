# Live COG session bridge implementation plan

Date: 2026-09-20
Status: approved design, implementation pending

## Goal

Implement the approved live YouTeach Buzzer → Classroom Online Games → Student Buzzer bridge across both repositories.

Canonical design:
- `docs/superpowers/specs/2026-09-20-live-cog-session-bridge.md`

Repositories:
- `youteachtk/YouTeach`
- `youteachtk/Classroom-Online-Games`

## Required constraints

- GitHub remains the source of truth; Cloudflare Pages deploys only after repository changes pass tests.
- YouTeach and Classroom Online Games remain separate applications.
- No permanent game link may remain in the Student menu.
- The teacher must start a live game session before students see a game.
- Student access is scoped to the Buzzer group.
- Teacher/student identity handoff uses short-lived signed credentials; never pass passwords or mutable raw identity as authorization.
- Closing a tab does not end an activity.
- Explicit end requires confirmation.
- Automatic expiry is 60 continuous minutes with zero teacher and zero student presence.
- Returning teacher/student presence resets the inactivity window.
- Live-session results return automatically to YouTeach.
- Live-game result ingestion is idempotent.
- COG Assignment lifecycle remains separate.

## Architecture boundary

### YouTeach produces

- signed teacher session credential from the hardened authentication layer;
- signed student session credential from the hardened authentication layer;
- short-lived `cog-live-teacher` launch;
- short-lived `cog-live-student` launch;
- canonical current live-game state under the active Buzzer session;
- server-authoritative live result receipt / deduplication.

### Classroom Online Games produces

- validated teacher context from the YouTeach launch;
- COG live session id;
- teacher/student presence heartbeats;
- explicit end event;
- normalized live result envelope;
- game adapters that translate each game's native state to the shared bridge.

## Shared data contract

Use this canonical live-game descriptor inside YouTeach:

```js
{
  gameId: "verb-runner",
  gameName: "Verb Runner",
  cogSessionId: "ABC123",
  groupName: "533-2",
  status: "active",
  launchMode: "live-buzzer",
  startedAt: 1760000000000,
  updatedAt: 1760000000000,
  teacherPresenceAt: 1760000000000,
  noPresenceSince: null
}
```

Live student result envelope:

```js
{
  schemaVersion: 1,
  resultId: "verb-runner:ABC123:student-key:attempt-id",
  attemptId: "attempt-id",
  studentKey: "student-key",
  gameId: "verb-runner",
  cogSessionId: "ABC123",
  resultType: "individual",
  completedAt: 1760000000000,
  percentage: 85,
  points: null,
  metrics: {
    correct: 20,
    errors: 4,
    obstacleHits: 2,
    bestStreak: 7,
    timeMs: 132000
  }
}
```

The server must recompute or validate any value that is authoritative for YouTeach. Client percentages are evidence, not authority.

## Review focus

1. **Teacher closes browser accidentally** — connected game remains active; no end is emitted.
2. **One student remains online** — 60-minute zero-presence timer must not start or expire the activity.
3. **Teacher/student returns at minute 59** — `noPresenceSince` resets and the activity remains active.
4. **Student refreshes/re-enters** — a fresh launch credential resolves to the same canonical student/session without creating a duplicate identity or result.
5. **Result retry after network failure** — the same `resultId` is accepted once and subsequent retries return the existing receipt/state without duplicating points.

---

# Phase A — YouTeach secure prerequisite

## Task 1: Land the hardened session primitives on current YouTeach main

**Repository:** `youteachtk/YouTeach`

**Source reference already implemented on:** `feature/cog-youteach-secure-integrated-20260919`

**Files to reconcile onto current `main`:**
- `functions/_shared/teacher-session.js`
- `functions/_shared/student-session.js`
- `functions/_shared/credential-store.js`
- `functions/api/teacher-session.js`
- `functions/api/student-session.js`
- `teacher-auth.js`
- `student-auth.js`
- authentication tests from `tests/auth-*.test.mjs` and `tests/student-session-*.test.mjs`
- Cloudflare bindings/workflow changes required by `YOUTEACH_SESSION_SECRET` and the private auth store

**Interface produced:**

```js
getTeacherSessionToken() -> string
requireTeacherAuth() -> boolean
requireStudentSession() -> { studentKey, externalId, sessionToken }
verifyTeacherSession(token, secret) -> canonical teacher context | null
verifyStudentSession(token, secret) -> canonical student context | null
```

- [ ] **Step 1: bring the existing auth tests onto a branch based on current `main` without production auth changes.**
- [ ] **Step 2: run the auth tests and confirm RED because current main lacks signed-session APIs.**

Run:

```bash
node --test tests/auth-*.test.mjs tests/student-session-*.test.mjs
```

Expected: failures showing missing signed session/auth boundaries.

- [ ] **Step 3: reconcile the hardened auth implementation from the secure branch with current main.**

Do not copy assignment-specific UI while doing this task.

- [ ] **Step 4: run syntax checks and the full YouTeach suite.**

```bash
find functions -name '*.js' -print0 | xargs -0 -n1 node --check
node --test tests/*.test.mjs
sh build-pages.sh
```

Expected: zero test failures and successful static output.

- [ ] **Step 5: commit.**

Commit message:
`Integrate hardened YouTeach session primitives`

---

# Phase B — Shared YouTeach live-game policy

## Task 2: Add pure live-game lifecycle policy

**Repository:** `youteachtk/YouTeach`

**Create:**
- `cog-live-session-policy.mjs`
- `tests/cog-live-session-policy.test.mjs`

**Produces:**

```js
export const LIVE_COG_IDLE_TTL_MS = 60 * 60 * 1000;

export function validateConnectedGame(raw) {}
export function canStudentAccessLiveGame({ connectedGame, studentGroup, now }) {}
export function nextPresenceState({ connectedGame, teacherPresent, studentPresenceCount, now }) {}
export function shouldExpireConnectedGame({ connectedGame, now }) {}
export function liveResultKey({ gameId, cogSessionId, studentKey, resultId }) {}
```

- [ ] **Step 1: write failing tests** for:
  - exact group match;
  - inactive/ended game hidden;
  - active same-group game visible;
  - zero presence starts `noPresenceSince`;
  - any presence clears `noPresenceSince`;
  - 59:59 does not expire;
  - 60:00 expires;
  - stable deduplication key.

- [ ] **Step 2: run only the new test and verify RED.**

```bash
node --test tests/cog-live-session-policy.test.mjs
```

- [ ] **Step 3: implement the pure policy with no Firebase access.**

- [ ] **Step 4: run new test and full suite.**

```bash
node --test tests/cog-live-session-policy.test.mjs
node --test tests/*.test.mjs
```

- [ ] **Step 5: commit.**

Commit message:
`Add live COG session lifecycle policy`

---

# Phase C — Teacher handoff from YouTeach to COG

## Task 3: Add server-issued teacher live launch

**Repository:** `youteachtk/YouTeach`

**Create:**
- `functions/_shared/cog-live-token.js`
- `functions/api/cog-live-teacher-launch.js`
- `functions/api/cog-live-teacher-resolve.js`
- `tests/cog-live-teacher-launch.test.mjs`

**Modify:**
- `buzzer.js`
- `buzzer.html`
- `build-pages.sh` if `.mjs` root modules are not already copied after Task 1

**Launch token payload:**

```js
{
  purpose: "cog-live-teacher",
  teacherUsername,
  teacherRole,
  teacherDisplayName,
  youTeachSessionCreatedAt,
  groupName,
  iat,
  exp,
  nonce
}
```

**Teacher launch endpoint:**

```
POST /api/cog-live-teacher-launch
Authorization: Bearer <signed teacher session>
```

Response:

```json
{
  "ok": true,
  "launchUrl": "https://classroom-online-games.pages.dev/teacher/?ytLiveTeacher=...",
  "expiresAt": 1760000300000
}
```

- [ ] **Step 1: write failing tests** asserting:
  - no authenticated teacher session → 401;
  - no active Buzzer session/group → 409;
  - token purpose is `cog-live-teacher`;
  - group comes from canonical `session/current.groupName`, not client request;
  - Buzzer no longer opens COG by a bare static URL.

- [ ] **Step 2: verify RED.**

```bash
node --test tests/cog-live-teacher-launch.test.mjs
```

- [ ] **Step 3: implement server launch signing and wire it to the generic Buzzer activity flow when the selected/scheduled Activity Type is `COG`. Do not restore a standalone Classroom Games button.**

- [ ] **Step 4: run YouTeach suite/build.**

- [ ] **Step 5: commit.**

Commit message:
`Add authenticated teacher launch into Classroom Online Games`

---

# Phase D — COG shared live-session client

## Task 4: Add reusable COG live bridge module

**Repository:** `youteachtk/Classroom-Online-Games`

**Create:**
- `shared/youteach-live-bridge.mjs`
- `tests/youteach-live-bridge.test.mjs`

**Produces:**

```js
resolveTeacherLaunch({ token, issuer }) -> Promise<TeacherContext>
registerLiveGameSession({ teacherContext, gameId, gameName, cogSessionId }) -> Promise<ConnectedGame>
heartbeatTeacher({ liveSession }) -> Promise<void>
heartbeatStudent({ liveSession, studentIdentity }) -> Promise<void>
endLiveGameSession({ liveSession }) -> Promise<void>
resolveStudentLaunch({ token, issuer }) -> Promise<StudentContext>
submitLiveResult({ studentContext, result }) -> Promise<ResultReceipt>
```

**Rules:**
- only allow `https://youteach.pages.dev` and YouTeach Pages preview subdomains as issuer;
- keep resolved teacher context in memory/sessionStorage only as needed for navigation within COG;
- never store teacher password;
- do not mark a game active when a teacher merely opens a monitor.

- [ ] **Step 1: write failing unit tests** for issuer allowlist, purpose validation, group retention, and no activation-on-navigation.

- [ ] **Step 2: verify RED.**

```bash
node --test tests/youteach-live-bridge.test.mjs
```

- [ ] **Step 3: implement minimal module.**

- [ ] **Step 4: run COG tests.**

```bash
node --test tests/*.test.mjs
node --test Verb-Runner/tests/*.test.mjs
node --test Verb-Runner/sentence-run.test.js
```

- [ ] **Step 5: commit.**

Commit message:
`Add shared YouTeach live-session bridge`

---

# Phase E — COG teacher menu context propagation

## Task 5: Resolve teacher context at COG teacher menu and propagate it to game monitors

**Repository:** `youteachtk/Classroom-Online-Games`

**Modify:**
- `teacher/index.html`
- `teacher/teacher-menu.js`
- `tests/youteach-live-bridge.test.mjs`

**Behavior:**
- teacher menu resolves `ytLiveTeacher`;
- it shows the verified group;
- game links carry only an opaque local handoff reference or preserved signed teacher context, never raw group as authority;
- clicking Verb Runner / Support Meter / 100 Students Said / OSASCOMP only opens/configures that monitor;
- clicking a game card alone must not write YouTeach `connectedGame`.

- [ ] **Step 1: add tests proving current 100 Students Said early activation is rejected.**
- [ ] **Step 2: run test and verify RED against current `teacher-menu.js`.**
- [ ] **Step 3: remove the current menu-level Firebase write that activates 100 Students Said and replace it with context propagation only.**
- [ ] **Step 4: run tests.**
- [ ] **Step 5: commit.**

Commit message:
`Move live game activation out of COG teacher menu`

---

# Phase F — Verb Runner live-session adapter

## Task 6: Activate YouTeach connected game only when Verb Runner session is created

**Repository:** `youteachtk/Classroom-Online-Games`

**Modify:**
- `Verb-Runner/session-sync.js`
- `Verb-Runner/teacher.js`
- `Verb-Runner/teacher/index.html`
- `Verb-Runner/tests/youteach-live-session.test.mjs`

**Create test:**
- `Verb-Runner/tests/youteach-live-session.test.mjs`

**Create session signature:**

```js
createSession(settings, liveTeacherContext = null)
```

When a teacher context exists, session state records:

```js
{
  integration: {
    source: "youteach-buzzer",
    groupName,
    teacherUsername,
    live: true
  }
}
```

After Firebase session creation, call the shared bridge to register:

```js
registerLiveGameSession({
  teacherContext,
  gameId: "verb-runner",
  gameName: "Verb Runner",
  cogSessionId: code
})
```

**Explicit end:**
- rename button copy to `END ACTIVITY` when YouTeach-live;
- require `confirm("End this activity for the group? Students will no longer be able to enter.")`;
- only after confirmation close the Verb Runner session and notify YouTeach.

- [ ] **Step 1: failing tests** for create-vs-open behavior and confirmed end.
- [ ] **Step 2: verify RED.**
- [ ] **Step 3: implement adapter.**
- [ ] **Step 4: verify tests/full COG suite.**
- [ ] **Step 5: commit.**

Commit message:
`Connect Verb Runner sessions to YouTeach live activities`

---

# Phase G — Student Buzzer dynamic live-game access

## Task 7: Remove permanent Verb Runner menu item and add group-scoped live-game card

**Repository:** `youteachtk/YouTeach`

**Modify:**
- `student-buzzer.html`
- `student-buzzer.js`
- replace `tests/verb-runner-launch.test.mjs` with live-session expectations
- create `tests/cog-live-student-ui.test.mjs`

**Remove:**
- sidebar `openVerbRunnerBtn`;
- `createVerbRunnerLaunchToken()`;
- direct permanent `/Verb-Runner/?launch=...` path.

**Add UI:**

```html
<section id="liveGameCard" hidden>
  <span id="liveGameName"></span>
  <button id="joinLiveGameBtn" type="button">JOIN GAME</button>
</section>
```

**Visibility rule:**
use `canStudentAccessLiveGame(...)`; never infer access from game-specific Firebase paths.

- [ ] **Step 1: rewrite existing launcher test so it fails while the permanent sidebar button still exists.**
- [ ] **Step 2: add group/status UI tests and verify RED.**
- [ ] **Step 3: implement dynamic card.**
- [ ] **Step 4: verify full YouTeach suite.**
- [ ] **Step 5: commit.**

Commit message:
`Replace permanent game links with live Student Buzzer access`

---

# Phase H — Student live launch API

## Task 8: Issue and resolve student credentials for a specific live session

**Repository:** `youteachtk/YouTeach`

**Create:**
- `functions/api/cog-live-student-launch.js`
- `functions/api/cog-live-student-resolve.js`
- `tests/cog-live-student-launch.test.mjs`

**Request:**

```
POST /api/cog-live-student-launch
Authorization: Bearer <signed student session>
```

The client does not choose authoritative game/group/session values. Server reads current `connectedGame`.

Response contains a COG URL with a short-lived signed credential.

Validation:
- active connected game;
- same student group;
- not expired/ended;
- student exists;
- token scoped to `gameId + cogSessionId + studentKey`.

- [ ] **Step 1: failing tests for cross-group, ended session, expired session, and valid re-entry.**
- [ ] **Step 2: verify RED.**
- [ ] **Step 3: implement endpoints and wire `joinLiveGameBtn`.**
- [ ] **Step 4: run tests/build.**
- [ ] **Step 5: commit.**

Commit message:
`Add group-scoped live student game launch`

---

# Phase I — Verb Runner student identity + automatic results

## Task 9: Resolve live student identity in Verb Runner

**Repository:** `youteachtk/Classroom-Online-Games`

**Modify:**
- `Verb-Runner/session-sync.js`
- `Verb-Runner/prototype.js`
- `Verb-Runner/index.html`
- create `Verb-Runner/tests/youteach-live-student.test.mjs`

**Rules:**
- `ytLiveStudent` is a separate launch path from free mode and assignment launch;
- resolve verified identity through YouTeach;
- bind runner presence to the teacher-created `cogSessionId`;
- display nickname/full name from YouTeach;
- refresh/re-entry obtains a new token from Student Buzzer and rejoins the same session.

- [ ] **Step 1: failing tests for canonical identity and session binding.**
- [ ] **Step 2: verify RED.**
- [ ] **Step 3: implement live launch path.**
- [ ] **Step 4: run Verb Runner suite.**
- [ ] **Step 5: commit.**

Commit message:
`Resolve YouTeach live student identity in Verb Runner`

## Task 10: Submit Verb Runner live results automatically

**Repository:** both

**YouTeach create:**
- `functions/api/cog-live-result-submit.js`
- `functions/_shared/cog-live-result-store.js`
- `tests/cog-live-results.test.mjs`

**COG modify:**
- `Verb-Runner/session-sync.js`
- `Verb-Runner/prototype.js`
- `Verb-Runner/tests/youteach-live-result-submit.test.mjs`

**YouTeach storage shape:**

```
classroomGameResults/{cogSessionId}/{studentKey}/{resultId}
```

or private KV canonical storage plus Firebase display cache if the hardened infrastructure from Task 1 already provides a private result store. Prefer reuse of the secure receipt/store primitives from the September 19 branch.

**Idempotency:**
same `resultId` → same receipt/result, no duplicate points.

**Verb Runner trigger:**
call automatic submission from the successful run-completion path after the native finish state is produced. Do not require `SEND TO TEACHER` for `launchMode: live-buzzer`.

- [ ] **Step 1: failing server tests for forged group/session/student and duplicate result.**
- [ ] **Step 2: failing Verb Runner test proving live completion calls the submission adapter automatically.**
- [ ] **Step 3: implement server validator/store and client submit.**
- [ ] **Step 4: run both repositories' complete test suites.**
- [ ] **Step 5: commit in each repository.**

Commit messages:
- YouTeach: `Store verified live COG results idempotently`
- COG: `Return Verb Runner live results automatically`

---

# Phase J — Presence and 60-minute inactivity expiry

## Task 11: Add shared teacher/student presence and expiry

**Repository:** both

**YouTeach create:**
- `functions/api/cog-live-heartbeat.js`
- `functions/api/cog-live-expire.js`
- `tests/cog-live-expiry.test.mjs`

**COG modify:**
- `shared/youteach-live-bridge.mjs`
- `Verb-Runner/teacher.js`
- `Verb-Runner/prototype.js`

**Presence semantics:**
- teacher heartbeat every 20–30 seconds while monitor is open;
- student heartbeat every 20–30 seconds while game is open;
- server treats presence stale after a bounded threshold such as 90 seconds;
- zero valid presence writes `noPresenceSince`;
- any valid heartbeat clears it;
- expiry endpoint/poll evaluates 60-minute TTL and marks the session ended.

Use server timestamps/validated request time, not client-supplied time, for expiration authority.

- [ ] **Step 1: failing tests for last-person leaves, minute 59 return, minute 60 expiry, stale heartbeat.**
- [ ] **Step 2: verify RED.**
- [ ] **Step 3: implement heartbeat and expiry.**
- [ ] **Step 4: verify suites.**
- [ ] **Step 5: commit.**

Commit messages:
- YouTeach: `Add live COG presence and inactivity expiry`
- COG: `Send live COG presence heartbeats`

---

# Phase K — Migrate every currently exposed COG game

## Task 12: Migrate 100 Students Said to the shared live-session lifecycle

**Repository:** `youteachtk/Classroom-Online-Games`

**Modify:**
- `teacher/teacher-menu.js` — remove current early `connectedGame` activation
- `100-Students-Said/monitor.html`
- `100-Students-Said/monitor.js`
- `100-Students-Said/config.js`
- `100-Students-Said/game-core.test.js` or create `100-Students-Said/live-session.test.mjs`

**Behavior:**
- monitor load = configuration only;
- explicit game-start action creates/registers live COG session;
- explicit end uses confirmation and shared bridge;
- team points continue syncing to YouTeach;
- Student Buzzer visibility is driven only by YouTeach connected game.

- [ ] RED test current early activation.
- [ ] implement start/end adapter.
- [ ] verify 100 Students Said tests and COG suite.
- [ ] commit: `Migrate 100 Students Said to live session bridge`.

## Task 13: Migrate Support Meter

**Repository:** `youteachtk/Classroom-Online-Games`

**Create:**
- `Support-Meter/live-session.js`
- `Support-Meter/live-session.test.mjs`

**Modify:**
- `Support-Meter/teacher.html`
- `Support-Meter/teacher.js`
- `Support-Meter/firebase-client.js`
- `Support-Meter/game.js`

**Teacher adapter:**
- `Support-Meter/teacher.js:createSession()` remains the native Support Meter session creator;
- after `createAssignedSession(...)` succeeds, `live-session.js` calls `registerLiveGameSession(...)` with `gameId: "support-meter"`, `gameName: "Support Meter"`, the Support Meter `sessionId`, and the verified YouTeach teacher context;
- add `<button id="endLiveActivity">END ACTIVITY</button>` to `teacher.html`;
- the end button is shown only for a YouTeach live session, requires confirmation, closes the Support Meter session link/state without deleting historical results, then calls the shared bridge end endpoint;
- the existing Download Results flow may still offer data deletion, but deleting/downloading is not the live-session end signal.

**Student adapter:**
- `Support-Meter/game.js` detects a `ytLiveStudent` launch before the existing `join` token/free-mode path;
- verified identity populates `state.studentName` and `state.sessionId`;
- live launch skips manual student name/class-code authorization;
- Support Meter completion in `nextStory()` automatically submits a normalized live result through `live-session.js`;
- manual/free-mode Support Meter continues using the existing native flow outside YouTeach live launch.

**Result mapping:**

```js
{
  resultType: "individual",
  percentage: Math.round(state.meter),
  metrics: {
    supportMeter: state.meter,
    streak: state.streak,
    storiesCompleted: stories.length,
    translationAttempts: state.translationAttemptCount
  }
}
```

- [ ] **Step 1: write failing `Support-Meter/live-session.test.mjs`** asserting teacher start registration, explicit end confirmation hook, verified student identity, and automatic completion submit.
- [ ] **Step 2: verify RED.**

```bash
node --test Support-Meter/live-session.test.mjs
```

- [ ] **Step 3: implement `Support-Meter/live-session.js` and wire the exact teacher/student files above.**
- [ ] **Step 4: run Support Meter tests plus the full COG suite.**

```bash
node --test Support-Meter/*.test.js Support-Meter/*.test.mjs
node --test tests/*.test.mjs
node --test Verb-Runner/tests/*.test.mjs
```

- [ ] **Step 5: commit.**

Commit message:
`Migrate Support Meter to live session bridge`

## Task 14: Migrate OSASCOMP

**Repository:** `youteachtk/Classroom-Online-Games`

The current OSASCOMP student and teacher logic is inline in HTML. Extract it before adding the bridge so the integration is testable instead of growing the inline scripts.

**Create:**
- `OSASCOMP/game.js` — exact extraction of the current student inline application logic;
- `OSASCOMP/teacher/monitor.js` — exact extraction of the current teacher inline monitor logic;
- `OSASCOMP/live-session.js` — student YouTeach live adapter;
- `OSASCOMP/teacher/live-session.js` — teacher YouTeach live adapter;
- `OSASCOMP/live-session.test.mjs`.

**Modify:**
- `OSASCOMP/index.html` — replace the large inline application script with `game.js` + live adapter imports;
- `OSASCOMP/teacher/index.html` — replace the large inline monitor script with `monitor.js` + teacher live adapter;
- `teacher/index.html` only if card metadata/copy needs to identify OSASCOMP live-session support.

**Teacher behavior:**
- the existing room code becomes an internal/native OSASCOMP channel identifier, not the YouTeach authorization mechanism;
- for a YouTeach launch, add `START LIVE ACTIVITY` and `END ACTIVITY` controls to the monitor;
- `START LIVE ACTIVITY` creates/selects the OSASCOMP room/channel and registers it as `gameId: "osascomp"` for the verified YouTeach group;
- `END ACTIVITY` requires confirmation and ends the bridge without relying on browser close.

**Student behavior:**
- `ytLiveStudent` resolution supplies canonical YouTeach name and the authoritative OSASCOMP room/session id;
- in live mode, the existing manual `Student name` and `Class code` form is bypassed;
- the normal standalone/manual OSASCOMP join form remains available outside the YouTeach live path;
- the teacher sees the canonical YouTeach student name in Supabase presence because the resolved name is the one tracked.

**Result mapping:**

```js
{
  resultType: "individual",
  percentage: attempts ? Math.round(correct / attempts * 100) : 0,
  metrics: {
    score,
    correct,
    attempts,
    bestCombo: best,
    mode
  }
}
```

The existing `finish()` path emits the automatic live result once per `resultId`.

- [ ] **Step 1: extract the inline student/teacher scripts without behavior changes and add a regression test that loads the extracted modules.**
- [ ] **Step 2: run the extraction test and existing COG suite; keep behavior green before adding bridge logic.**
- [ ] **Step 3: write failing live-session tests** for no permanent access, verified group/session identity, explicit start/end, and automatic finish result.
- [ ] **Step 4: implement the two OSASCOMP bridge adapters.**
- [ ] **Step 5: run:**

```bash
node --test OSASCOMP/live-session.test.mjs
node --test tests/*.test.mjs
node --test Verb-Runner/tests/*.test.mjs
node --test 100-Students-Said/*.test.js
```

- [ ] **Step 6: commit.**

Commit message:
`Migrate OSASCOMP to live session bridge`
---

# Phase L — Cross-repository end-to-end verification

## Task 15: Add contract tests that pin both sides to the same schema

**Repository:** both

**Create in YouTeach:**
- `tests/cog-live-contract.test.mjs`

**Create in COG:**
- `tests/youteach-live-contract.test.mjs`

Both tests must assert exact values for:
- token purposes `cog-live-teacher`, `cog-live-student`;
- `launchMode: "live-buzzer"`;
- descriptor fields;
- result envelope fields;
- 60-minute TTL constant;
- allowed production origins.

- [ ] write contract tests.
- [ ] deliberately change one fixture/value to verify RED, then restore.
- [ ] run all tests.
- [ ] commit matching contract version `schemaVersion: 1`.

## Task 16: Browser smoke test the complete story

**Precondition:** deploy preview branches for both repositories.

Verify in browser:

1. Sign in as teacher in YouTeach.
2. Select a Buzzer group and create/activate its YouTeach session.
3. Open Classroom Online Games from Buzzer.
4. Confirm COG shows verified teacher/group context.
5. Open Verb Runner monitor without creating a session.
6. Confirm Student Buzzer shows no game.
7. Create Verb Runner session.
8. Confirm only students in the selected group see `JOIN GAME`.
9. Join as a Ghost/test student.
10. Confirm Verb Runner displays the YouTeach nickname/name.
11. Close the student's Verb Runner tab; reopen from Student Buzzer; confirm re-entry.
12. Close teacher monitor; confirm Student Buzzer still shows the game.
13. Reopen monitor and confirm the same session can continue.
14. Complete a run and confirm YouTeach receives one result.
15. Retry the same result request and confirm no duplicate.
16. Press `END ACTIVITY`, cancel once, confirm session remains active.
17. Press `END ACTIVITY` again and confirm; verify Student Buzzer card disappears.
18. Use automated policy tests for the 60-minute expiry rather than waiting an hour in browser.

## Task 17: Production verification and documentation

**Repository:** both

Run YouTeach:

```bash
find functions -name '*.js' -print0 | xargs -0 -n1 node --check
node --test tests/*.test.mjs
sh build-pages.sh
```

Run COG:

```bash
node --check Verb-Runner/prototype.js
node --test tests/*.test.mjs
node --test Verb-Runner/tests/*.test.mjs
node --test Verb-Runner/sentence-run.test.js
node --test 100-Students-Said/*.test.js
```

Update:
- YouTeach `docs/superpowers/README.md`
- COG `docs/superpowers/PROJECT-CONTINUITY.md`
- the live-session spec only if implementation revealed an explicitly approved design change.

Deploy from GitHub to Cloudflare Pages.

Verify the workflow run for the exact production commit in each repository is successful before calling the work complete.

---

# Implementation order

The tasks are intentionally ordered so no student-facing live link is shipped before the security/session prerequisite and server validation exist.

Do not implement Tasks 7–10 against the current insecure `localStorage` identity model and plan to harden it later. The signed session layer is a prerequisite, not cleanup.

Do not merge the COG Assignment lifecycle into this live flow. Reuse infrastructure only where the security semantics are identical.

# Expected final behavior

Teacher:
`YouTeach Buzzer → Open COG → choose game → CREATE/START SESSION → teach → END ACTIVITY`

Student:
`YouTeach Student Buzzer → game card appears only for active group session → JOIN/RETURN TO GAME → verified name in game → result returns automatically`

Expiration:
`explicit teacher end OR 60 continuous minutes with zero teacher and zero student presence`.


## Approved UI replacement — 2026-09-20

The implementation plan is amended as follows:

- remove the standalone `openCogTeacherBtn` / Open Classroom Games card from Buzzer;
- Team Source owns Activity Type, team target, title, and schedule controls;
- Activity Type taxonomy matches Assignments and includes `COG`;
- scheduled activities may target all generated teams or one team;
- scheduled activity records live under `teamActivities` and are referenced from the active Buzzer session;
- a future/remaining authenticated COG launch action must originate from the generic COG activity flow, not from a permanent COG-only button.
