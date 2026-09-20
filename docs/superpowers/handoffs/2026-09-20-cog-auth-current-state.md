# YouTeach ↔ Classroom Online Games secure integration — current-state handoff

Date: 2026-09-20
Status: active integration, rebuilt on current main
Source of truth: GitHub, not chat memory

## Active repositories and replacement PRs

### YouTeach
- Repository: `youteachtk/YouTeach`
- Active branch: `feature/cog-youteach-secure-current-20260920-v2`
- Replacement PR: **#12** — Integrate secure COG assignments and hardened auth on latest main
- Base: `main`

### Classroom Online Games
- Repository: `youteachtk/Classroom-Online-Games`
- Active branch: `feature/cog-youteach-secure-current-20260919-v2`
- Replacement PR: **#43** — Integrate secure YouTeach assignments into latest production Verb Runner
- Base: `main`

Old PRs **YouTeach #11** and **COG #41** are superseded by #12 and #43 because their branches diverged from newer `main` work. Do not merge #11 or #41.

## Why the integration was rebuilt

Both repositories advanced after the first secure-integration branches were created.

New YouTeach `main` work included:
- the live COG session bridge specification;
- Buzzer activity scheduling/team flows;
- exact generated-team assignment recipients;
- the shared `assignment-create-module`;
- the newer Assignment Library reuse flow inside that shared module.

COG `main` included recent pronunciation/review work and a Verb Runner 2.5 prototype that was later explicitly reverted, restoring the production runner.

The secure integration was therefore rebuilt from current `main`, not force-merged from the old PR branches.

## Reconciliation rulings

### Shared Create Assignment is authoritative

COG Assignment configuration belongs in the current shared `assignment-create-module.html/js`.

Do not restore the old duplicate COG creation UI into the legacy Teacher Assignments create panel.

The shared module now carries:
- certified COG game;
- mode;
- difficulty;
- optional minimum performance;
- task point value;
- Undo Submission policy.

The current Assignment Library/reuse flow is preserved. Reused COG activities retain reusable COG configuration while target/group/due date remain instance-specific.

### Generated-team recipients remain authoritative

The secure Student Assignments flow preserves current-main exact recipient targeting via `recipientStudentKeys`.

Do not regress to group-only visibility for assignments created from generated teams.

### Hidden template compatibility bridge

Current Teacher Assignments JavaScript still references legacy template-control IDs even though the primary Create Assignment UX moved to the shared popup module.

Those compatibility IDs remain inside an already-hidden container so:
- current JS does not dereference missing elements;
- the controls do not reappear in the primary Create Assignment UI;
- the newer shared-module/library architecture remains authoritative.

### Verb Runner production runner is preserved

The secure assignment/result logic is applied to the restored production Verb Runner.

The reverted Verb Runner 2.5 prototype is not reintroduced by this integration.

Recent pronunciation/audio/review assets remain untouched by the secure integration.

### Live COG and COG Assignment are distinct

The live Buzzer COG session bridge and a COG Assignment are separate lifecycles.

- **Live Buzzer COG:** teacher-controlled temporary group activity; result return is automatic.
- **COG Assignment:** due date, task points, assigned mode/difficulty, minimum-performance policy, Send to teacher, receipt, Undo/resubmit.

Do not make the Assignment flow replace the live-session bridge or vice versa.

## Implemented secure identity

YouTeach PR #12 contains:
- PBKDF2-SHA256 password records;
- Cloudflare KV credential-store abstraction using binding `YOUTEACH_AUTH`;
- signed expiring student sessions;
- signed teacher/admin sessions;
- student login/password endpoints;
- teacher login;
- teacher-authorized student enrollment/import;
- bootstrap credential provisioning;
- migration status;
- controlled bulk student migration;
- non-destructive preview migration mode.

Legacy passwords must not be deleted before their secure KV credential exists.

## Implemented secure COG Assignment flow

Across PR #12 and PR #43:
- YouTeach validates student identity and assignment server-side;
- YouTeach issues signed assignment launch context;
- COG resolves that context back against YouTeach;
- assigned mode/difficulty are locked;
- refreshing after the one-time launch credential is removed must not silently fall back to Free mode;
- gameplay/public Firebase state is not grade authority;
- a completed eligible COG Assignment result can use **SEND TO TEACHER**;
- YouTeach validates the result against the signed submission contract;
- official result receipts are stored server-side;
- points are converted proportionally;
- Student Assignments shows status/result;
- Teacher Assignments shows official COG result/receipt;
- Undo Submission/resubmission are supported.

## Verification evidence

### YouTeach
Implementation head `806cc095ee1aa8bb5e87ef041eaf915f76cab900` was verified after merging the newer YouTeach `main`:
- auth-hardening suite: success;
- COG official-results suite: success;
- full regression suite: success;
- Pages build: success;
- isolated Cloudflare Pages preview deploy: success;
- preview smoke: success.

Documentation/infrastructure-only commits may follow that head. Always inspect the current PR #12 Actions before merging.

### Classroom Online Games
Head `2abf676bddd83a016b93e4912241082463e8110b` was verified with:
- JavaScript syntax checks;
- approved pronunciation asset cache;
- approved pronunciation asset verification;
- all Verb Runner regression tests;
- shared COG contract tests;
- static preview build;
- isolated Cloudflare Pages preview deployment;
- preview smoke test.

Always inspect current PR #43 Actions before merging.

## Ghost Test Lab distinction

Canonical Ghost test identity:
- group: `FANTASMA`;
- external IDs: `GHOST01`–`GHOST20`;
- nicknames: `FAKE-01`–`FAKE-20`.

Ghost Test Lab is teacher-side simulation. It can simulate presence, buzzer and submissions for many Ghosts without creating 20 authenticated browser sessions.

That does **not** prove Student Login works.

Before production auth cutover, at least one Ghost — preferably `GHOST01` — must be tested through the real Student login and then through:

YouTeach Assignment → Verb Runner → locked assigned run → Send to teacher → teacher result → Undo Submission → resubmit.

Do not migrate real students merely because Ghost Test Lab simulation works.

## Current infrastructure blocker

The existing GitHub Actions Cloudflare token can deploy Pages, but a Workers KV API attempt returned **HTTP 401**.

Required permission on the existing Cloudflare API token:

`Account → Workers KV Storage → Edit`

PR #12 carries a manual-only workflow:

`.github/workflows/auth-infra-provision.yml`

It creates/reuses separate KV namespaces for:
- preview;
- production;

and writes the `YOUTEACH_AUTH` binding configuration.

Do not run it until the Cloudflare token has Workers KV edit access.

Do not commit or log plaintext teacher/admin/student credentials.

## Production feature gates

Official COG grading remains disabled until auth cutover is validated.

Order:

1. provision preview KV;
2. provision protected preview credentials;
3. verify teacher login in preview;
4. verify at least one Ghost real student login in preview;
5. verify full COG Assignment result / Undo / resubmit loop;
6. verify Ghost Test Lab mass simulation still works;
7. provision production KV and teacher/admin credentials;
8. run controlled student credential migration;
9. require migration status:
   - `pending = 0`;
   - no public credential fields;
   - `readyForCredentialCutover = true`;
10. enable `YOUTEACH_AUTH_HARDENED=true`;
11. re-test login, enrollment/import and password change;
12. merge/deploy compatible COG + YouTeach integration after fresh exact-head verification;
13. only then enable `YOUTEACH_COG_OFFICIAL_RESULTS_ENABLED=true`;
14. run one final Ghost official-result test before real-student use.

## Current next action

1. Confirm PR #12 and PR #43 remain mergeable against their current `main` and all current checks are green.
2. Add `Account → Workers KV Storage → Edit` to the existing Cloudflare token used by GitHub Actions.
3. Run the manual YouTeach auth-infrastructure workflow.
4. Validate isolated preview authentication with a real Ghost login.
5. Do **not** migrate real students and do **not** merge to production before that preview gate passes.

## Continuity rule

Every material decision must be written back to GitHub before ending a work session.

When a future instance is asked to continue this work:
1. read `docs/superpowers/README.md`;
2. read this handoff;
3. inspect YouTeach PR #12 and COG PR #43;
4. inspect current `main` heads;
5. inspect current Actions on both PR heads;
6. continue from the first unresolved gate above;
7. do not recreate old PR #11/#41 work.
