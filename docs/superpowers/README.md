# YouTeach Superpowers continuity index

Repository: `Youteach-org/YouTeach`
Canonical branch: `main`
Production flow: GitHub -> Cloudflare Pages

## Purpose

This folder is the canonical continuity layer for YouTeach.

Any future ChatGPT/Codex/Superpowers instance working on this repository should read this index first, then the linked specs, before making product or architecture changes.

GitHub is the source of truth. Chat memory is secondary.

## Required reading order

1. `docs/superpowers/specs/2026-09-15-youteach-continuity-roadmap.md`
   - current roadmap;
   - accepted product/architecture decisions;
   - implementation order;
   - current next action.

2. `docs/superpowers/specs/2026-09-15-reusable-content-exams-analytics-admin.md`
   - reusable Assignment Template vs Assigned Instance;
   - Assignment Library;
   - course/topic analytics;
   - Course Intelligence / Program Builder direction;
   - manual Exam Bank;
   - Administration.

3. `docs/superpowers/specs/2026-09-16-grading-project-evidence-student-ux.md`
   - canonical AI grade -> teacher review -> publish workflow;
   - exact evidence-type grading rules;
   - duplicate-grading ledger/idempotency;
   - exam annotations;
   - Project checkpoints with photo/video/document evidence;
   - expanded student assignment cards;
   - manual points/percentage grading;
   - published student grades.

4. `docs/superpowers/specs/2026-09-16-clear-manual-grade.md`
   - direct Clear grade behavior;
   - grade reset without deleting the student's submission;
   - regrading after reset.

5. `docs/superpowers/specs/2026-09-19-ghost-test-lab.md`
   - reusable Ghost student test accounts;
   - simulated attendance/presence;
   - real assignment submission and grading verification;
   - Buzzer simulation.

6. `docs/superpowers/specs/2026-09-20-live-cog-session-bridge.md`
   - teacher-controlled live COG sessions from YouTeach Buzzer;
   - group-scoped Student Buzzer game access;
   - verified identity handoff and automatic result return;
   - explicit end plus 60-minute zero-presence expiry.

7. `docs/superpowers/specs/2026-09-24-assignment-architecture-active-block-review-grading.md`
   - group-specific persistent Active Block / Unit;
   - Evaluation Category -> Activity Type -> grading configuration hierarchy;
   - legacy Assignment Type compatibility;
   - in-page Review submission PDF + grading workflow.

8. `docs/superpowers/plans/2026-09-24-assignment-architecture-active-block-review-grading.md`
   - staged implementation plan and regression checklist for the 2026-09-24 redesign.

9. Relevant implementation files and recent commits on `main`.
   - UI micro-decisions that are already implemented are authoritative in code/commit history even when not repeated word-for-word in a spec.

## Global UI rules

### Global list-selection rule

Whenever a YouTeach page contains a list with multi-selection, use the standard **master checkbox** pattern:
- every item keeps its own checkbox;
- a master checkbox appears at the top of the checkbox column, normally in the table/list header;
- checking the master checkbox selects all currently listed items;
- unchecking it deselects all currently listed items;
- when only some items are selected, the master checkbox uses the indeterminate state.

Do not replace this standard pattern with separate `Select all` / `Deselect all` buttons unless a specific page explicitly requires them. This is a standing project-wide UX rule for current and future list-based pages.

## Interaction convention

- Number every assistant response to this user. Keep the response number visible at the beginning of each reply when working on this project.

## Continuity rules

1. Material decisions must be written to GitHub.
2. Product decisions, architecture rules, data-model decisions, workflow rules, and accepted UX behavior belong in `docs/superpowers/specs/`.
3. Small implementation details and visual corrections may live in code plus commit history, but any change that affects future design choices must also update a spec.
4. Do not rely on a previous chat being available.
5. Do not silently reverse an accepted decision. If a decision changes, update the relevant spec and explain the replacement.
6. GitHub changes happen first; Cloudflare deploys from GitHub.
7. Keep YouTeach and Classroom Online Games as separate repositories. Integrate through explicit contracts.
8. Reusable content must remain separate from historical student instances/data.
9. Never copy prior submissions/grades into a reused Assignment instance.
10. The approved exam-library feature is the manual Exam Bank; internal Question Bank / Exam Creator / Answer Sheet Creator are not approved scope.
11. External AI exam creation/rearrangement is outside the Exam Bank and must be designed separately.
12. Admin is a separate role-aware section from Teacher.
13. Current project terminology should stay consistent with the specs.

## Current high-level sequence

1. Field-validate AI grading -> teacher review -> publish on real tasks.
2. Stabilize responsive behavior across desktop/tablet/mobile.
3. Add Assignment Template / Assigned Instance model.
4. Build Assignment Library.
5. Add Course -> Unit -> Topic -> Subtopic metadata.
6. Add analytics foundation.
7. Build the manual Exam Bank.
8. Build Administration.
9. Harden authentication and finish Cloudflare/infrastructure cleanup.
10. Build Course Intelligence / Program Builder when historical data is sufficient.

## How another instance should continue

When asked to continue YouTeach:

1. Read this file.
2. Read the current specs above.
3. Inspect recent commits on `main`.
4. Check the current implementation before proposing duplicate work.
5. Continue from the roadmap's "Current next action".
6. When a new material decision is made, update GitHub before ending the work session.

## Source-of-truth summary

- Repository: `Youteach-org/YouTeach`
- Branch: `main`
- Hosting: Cloudflare Pages
- Database/live state: Firebase Realtime Database
- Assignment evidence: Google Drive
- Canonical project continuity: `docs/superpowers/`


## Live COG integration checkpoint — 2026-09-23

Integration branch: `live-cog-20260922`.

Verified preview pair:
- YouTeach: `https://live-cog-20260922.youteach.pages.dev`
- Classroom Online Games: `https://live-cog-20260922.classroom-online-games.pages.dev`

Current verified behavior:
- Teacher selects the working group in YouTeach, generates Smart Teams, opens Assignments, creates a `COG` assignment, and receives a signed COG teacher launch.
- Student Buzzer shows `JOIN GAME` only for an active connected game and an eligible assignment recipient.
- Group eligibility uses the current multi-group membership model; a student's primary `groupName` does not need to equal the active working group when `groupMemberships` includes that group.
- Live heartbeat, explicit end, 90-second stale-presence evaluation, and 60-minute zero-presence expiry remain Firebase-backed.
- Verified COG results are stored under `assignmentSubmissions/{assignmentId}/{studentKey}/cogResults/{resultId}`.
- COG result receipts are displayed in Teacher Assignments as result history; they are not PDF submissions and are not automatic assignment grades.
- Root browser `.mjs` modules must be copied by `build-pages.sh`; Student Buzzer imports `cog-live-session-policy.mjs` at runtime.
- Preview E2E on YouTeach run `35828301497` passed teacher login, FANTASMA Smart Teams, COG assignment launch, GHOST20 JOIN GAME, canonical identity, heartbeat, idempotent result receipt, Teacher Results UI, and END ACTIVITY.
- YouTeach verification run `35828301309`: 230/230 tests, syntax checks, and Pages build GREEN.
- COG verification/deploy checkpoint: runs `35828254105` / `35828254080` GREEN.

Do not revive the abandoned KV/session-store authentication design. Firebase Realtime Database remains the canonical live-state architecture for YouTeach.


## Production merge — 2026-09-23

Live COG integration is now merged to `main`.

- Production merge commit: `f11d83cc7d2a49bdbfee576c8b202c5f669672b2`
- Production Cloudflare workflow: `35942862101` — GREEN
- Regression tests in production workflow: GREEN
- Pages build: GREEN
- Cloudflare deploy: GREEN
- Cloudflare production-state inspection: GREEN

Matching COG production merge: `7ee3af882ccebbec0514d2cc29ed58b224c9ae46`.


## Assignment architecture checkpoint — 2026-09-24

Accepted and documented before implementation:

- The active Block / Unit becomes group-specific and persistent at `groups/<groupName>/activeEvaluationBlock`; global `settings.activeBlock` is migration fallback only.
- Teacher Assignments defaults its Block filter to the selected group's active block; `All blocks` remains an explicit temporary browser filter.
- Group evaluation criteria are the primary Assignment categories. Teacher-visible names remain configurable while each criterion gains an underlying system family.
- Assignment classification is separated into Evaluation Category, Activity Type/subtype, grading scheme, and grading workflow.
- Legacy `assignmentTypeCode` values remain supported and are not destructively migrated.
- `Open submitted PDF` is to become an in-page `Review submission` modal with PDF viewer plus manual/AI grading controls.
- Canonical spec and implementation plan are the two 2026-09-24 files listed above.


## Assignment architecture implementation checkpoint — 2026-09-24

Phase 1 implementation PR: **#17 — Add group-specific active block workflow**.

Implemented on `feature/assignment-architecture-implementation-20260924`:

- canonical group-specific block state at `groups/<groupName>/activeEvaluationBlock`;
- shared group-aware active-block resolver with legacy `settings.activeBlock` fallback;
- Group Management **Active Block** button and popup;
- temporary compatibility mirror to `settings.activeBlock` for the current working group while older consumers are migrated;
- Teacher Assignments defaults its Block filter to the working group's active block;
- **All blocks** remains an explicit temporary browser filter and does not mutate the group's active block;
- clearing Assignment Browser filters returns to the group's active block;
- Create Assignment defaults to the group's active block while still allowing a per-assignment override;
- both `group-mangement.html/js` and the currently loaded `teacher-enrollment.html/js` path are kept compatible;
- regression tests cover independent active blocks for different groups and the new Assignments/Create Assignment defaults.

Still pending from the approved 2026-09-24 architecture:

1. Evaluation Category system-family metadata and configurable activity subtypes.
2. Create Assignment hierarchy redesign.
3. Assignment Browser grouping by evaluation category.
4. Universal in-page **Review submission** PDF + grading modal.
5. Progressive migration of other global-active-block consumers to the group-aware resolver.


## Assignment category hierarchy checkpoint — 2026-09-24

Implementation branch: `feature/assignment-category-hierarchy-20260924`.

Implemented after the group-specific Active Block foundation:

- Evaluation criteria remain teacher-named primary categories and now persist an underlying `systemCategory`: `EXAM`, `TASK`, `PARTICIPATION`, `ATTENDANCE`, or `OTHER`.
- Group Management exposes that underlying family beside the freely editable visible category name. Existing criteria infer a safe family from their previous source/name when possible.
- Added `assignment-activity-model.js` as the canonical compatibility taxonomy for legacy codes, activity subtypes, and default grading behavior.
- Legacy codes remain supported: `EX`, `CT`, `HW`, `PJ`, `PC`, `RS`, `PT`, and `COG`.
- Create Assignment now presents **Evaluation category -> Activity type -> Grading scheme -> Grading workflow**. The old flat Assignment Type selector remains hidden only as a compatibility bridge for Task Codes and existing special workflows.
- Exam activities now target a configured evaluation category just like other graded activities. Legacy exams that cannot be mapped safely remain reviewable/unassigned rather than being guessed.
- New assignment records add `systemCategory`, `activitySubtype`, `activitySubtypeLabel`, `gradingScheme`, and `gradingWorkflow` without deleting legacy fields.
- Assignment Library keeps the new reusable activity/grading defaults but still strips group, Block, evaluation target, due date, Task Code, submissions, and grading state.
- Assignment Browser groups cards under the configured evaluation categories and shows Activity Type on each card.
- Unresolved legacy records appear under **Needs category review**.
- Project keeps `PJ` compatibility for checkpoints/evidence; COG keeps `COG`; all Exam subtypes keep `EX`.

Next implementation checkpoint:

1. Run full regression/build/deploy validation for the hierarchy.
2. Implement the universal in-page **Review submission** modal with PDF viewer plus grading.
3. Reuse the existing Exam PDF source and annotation workflow instead of introducing a second annotation stack; do not broaden server-side Drive PDF streaming until backend-validated teacher sessions exist.


## Review submission implementation checkpoint — 2026-09-27

Implementation branch: `feature/review-submission-modal-20260927`.

Implemented from Phase 9 of the approved 2026-09-24 assignment architecture plan:

- The submission-card `Open submitted PDF ->` new-tab action is replaced by **Review submission**.
- A modal keeps the submitted PDF and grading workflow inside YouTeach, with the document area on the left and grading context/actions on the right.
- Ordinary assignment PDFs use the existing Google Drive file permission path and are embedded through Drive's preview URL inside the modal; no new universal server-side PDF proxy is introduced.
- Exam reviews reuse the existing `examAnnotationPanel`, original-exam source endpoint, annotation metadata, and annotated-PDF workflow inside the same Review submission modal rather than creating a second annotation stack.
- The existing manual grading panel is reused inside the modal, preserving rubric score inputs, feedback, grading history, and current Firebase write paths.
- A manual correction made after an AI grade is explicitly recorded with `teacherReviewStatus = "corrected"`; the corrected grade remains unpublished until the teacher publishes it.
- **Clear grade** now resets either a current AI or manual numeric grade while preserving the submitted PDF and appending the existing grade-history audit event.
- Publish/Unpublish continues through the existing grade-publication workflow.
- Closing the modal restores the reused grading/annotation panels to their original DOM locations.

Verification state for this checkpoint:

- Source-level Review submission contract checks are GREEN.
- `teacher-assignments.js` passes a syntax parse check after stripping browser imports.
- The branch is based on current `main` commit `e608d96ccf890f60dd7493f3f011d0b6c303d140`.
- Full `node --test tests/*.test.mjs`, Pages build, and Cloudflare deployment are still pending because the production workflow runs on a push to `main`, not on this feature branch.
- Security review rejected the first universal server-side PDF proxy approach because YouTeach does not yet have backend-validated teacher sessions. The branch therefore keeps ordinary submissions on existing Drive permissions; the existing Exam PDF.js source remains unchanged for annotation compatibility.

Next action:

1. Review the feature diff and regression compatibility.
2. Integrate through a pull request.
3. Use the resulting `main` workflow as the authoritative full regression/build/deploy verification.
