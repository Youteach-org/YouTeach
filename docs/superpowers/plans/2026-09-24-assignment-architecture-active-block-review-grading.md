# Implementation plan: Assignment architecture, group active block, and in-page grading

Date: 2026-09-24  
Repository: `Youteach-org/YouTeach`  
Branch used to record this plan: `feature/assignment-architecture-20260924`  
Canonical spec: `docs/superpowers/specs/2026-09-24-assignment-architecture-active-block-review-grading.md`

## Goal

Implement the approved 2026-09-24 redesign without breaking current assignments, grades, Project evidence, Exam annotations, COG receipts, Assignment Library reuse, or Student Summary calculations.

Do not perform a destructive migration.

## Phase 0 — Baseline and safety

Before feature code:

1. Run the existing test suite and record the baseline.
2. Confirm the current production/main commit.
3. Add targeted regression tests around:
   - assignment evaluation targets;
   - group evaluation config;
   - grading workflow;
   - Project evidence;
   - Exam annotations;
   - COG result receipts.
4. Keep the work on a feature branch until regression tests and preview checks pass.

## Phase 1 — Shared group-active-block model

### Files

- Modify `group-evaluation-model.js`
- Modify/add tests in `tests/group-evaluation.test.mjs`
- Add a focused active-block test file if cleaner.

### Work

Add shared helpers similar in responsibility to:

- `activeEvaluationBlockForGroup(group, legacySettings)`
- `validEvaluationBlockForGroup(group, preferred)`

Rules:

1. Prefer `group.activeEvaluationBlock`.
2. Fallback to valid `settings.activeBlock`.
3. Fallback to a valid configured block.
4. Never return a block outside the group's configured unit count.

Do not immediately remove the legacy global setting.

## Phase 2 — Group Management active-block popup

### Files

- Modify `group-mangement.html`
- Modify `group-mangement.js`
- Mirror only if the compatibility route `teacher-enrollment.*` still requires synchronized markup/code.
- Update `tests/group-management.test.mjs`

### UI

Add a compact selected-group action:

`Active Block: <name>`

Open a modal containing the group's configured blocks, Save, and Cancel.

### Firebase

Persist:

`groups/<groupName>/activeEvaluationBlock`

Do not store this only in sessionStorage.

### Validation

- active selection survives reload;
- changing working group shows that group's own active block;
- invalid stored block is corrected safely if block count is reduced.

## Phase 3 — Assignments default filter

### Files

- Modify `teacher-assignments.js`
- Modify `teacher-assignments.html`
- Add/update Assignments UI tests.

### Work

Current filter includes:

`<option value="ALL">All blocks</option>`

Change initialization so:

- current working group -> selected value = group's active block;
- no specific group -> safe existing behavior;
- `ALL` remains available;
- a manual browser-filter choice does not update the group active block;
- switching working group re-resolves the default.

## Phase 4 — Create Assignment active-block default

### Files

- Modify `assignment-create-module.js`
- Update tests for assignment creation.

### Work

Replace direct dependency on global `settingsCache.activeBlock` with the shared group-aware helper.

The teacher may override the assignment block without changing the group's active block.

## Phase 5 — Evaluation Category system-family metadata

### Files

- Modify `group-evaluation-model.js`
- Modify `group-mangement.js` / UI as required
- Modify evaluation-template serialization
- Update tests.

### Data

Each group evaluation criterion gains:

`systemCategory: EXAM | TASK | PARTICIPATION | ATTENDANCE | OTHER`

Visible criterion names remain unrestricted.

### Migration

For existing criteria:

- infer a system family only when deterministic from existing names/type defaults;
- otherwise use `OTHER` or mark the criterion for teacher confirmation;
- never rename a teacher's visible criterion automatically.

Reusable evaluation templates must carry `systemCategory`.

## Phase 6 — Assignment activity/grading metadata

### Files

- Modify `assignment-evaluation-target.js`
- Modify `assignment-create-module.js`
- Modify `assignment-library-model.js`
- Modify relevant tests.

### Additive fields

Add:

- `systemCategory`
- `activitySubtype`
- `activitySubtypeLabel`
- `gradingScheme`
- `gradingWorkflow`

Retain:

- `assignmentTypeCode`
- `assignmentType`
- `evaluationTarget`
- compatibility fields.

### Legacy mapping tests

Cover:

- EX -> EXAM / GENERIC_EXAM
- CT -> TASK / CLASSWORK
- HW -> TASK / HOMEWORK
- PJ -> TASK / PROJECT
- PC -> TASK / PRACTICE
- RS -> TASK / RESEARCH
- PT -> TASK / PRESENTATION
- COG -> PARTICIPATION / COG

## Phase 7 — Redesign Create Assignment hierarchy

### Files

- Modify `assignment-create-module.html`
- Modify `assignment-create-module.js`
- Modify shared styles as needed.

### Order

1. Block / Unit.
2. Evaluation Category.
3. Activity Type.
4. Assignment Name.
5. target/team/due date.
6. student instructions.
7. grading configuration.
8. scheme-specific controls.
9. teacher-only review/AI instructions.
10. subtype-specific controls.

### Important

Do not expose all legacy types as top-level category peers.

Activity Type choices are filtered by the selected criterion's `systemCategory`.

## Phase 8 — Redesign Assignment Browser grouping

### Files

- Modify `teacher-assignments.js`
- Modify `teacher-assignments.html`
- styles/tests.

### Work

Within the selected Block / Unit:

- primary grouping = configured Evaluation Category;
- card metadata = Activity Type/subtype;
- legacy unresolved assignments = `Needs category review`.

Keep existing compact card behavior and submission ordering.

## Phase 9 — Universal Review submission modal

### Files

Likely:

- Modify `teacher-assignments.html`
- Modify `teacher-assignments.js`
- refactor/reuse Exam PDF viewer code
- add/generalize authenticated PDF source API
- add tests.

### Replace

Current:

`Open submitted PDF ->` with `target="_blank"`

With:

`Review submission`

### Modal

- PDF.js viewer inside YouTeach;
- student and assignment context;
- current grade and AI/manual source;
- criteria/scheme grading UI;
- feedback;
- Save manual grade;
- Clear grade;
- Publish/Unpublish;
- grading history/status.

For Exams, integrate/reuse the existing annotation tools rather than creating a second viewer.

### Grade correction rule

Saving a manual correction after an AI grade:

- writes a manual grading record;
- records correction/review status;
- sets publication false until explicit re-publish;
- remains protected from later stale AI sync by existing manual-grade precedence logic.

## Phase 10 — Audit all global active-block consumers

Search all reads/writes of:

- `settings.activeBlock`
- `settingsCache.activeBlock`
- `activeBlockCache`

Likely pages include:

- Teacher Home;
- Points;
- Student Summary;
- Student;
- Buzzer;
- report/export flows.

Move them to group-aware resolution where a group context exists.

During transition, legacy global data remains a fallback.

## Phase 11 — Assignment Library compatibility

Verify:

- reusable activity subtype and grading defaults are copied;
- group target, criterion target, block, Task Code, due date, submissions and grades are not copied;
- compatible categories can be suggested by `systemCategory`;
- ambiguous category mapping requires teacher selection.

## Phase 12 — Verification

Run:

1. full test suite;
2. syntax checks;
3. Pages build;
4. Cloudflare preview deploy;
5. Ghost Test Lab smoke tests.

Manual smoke-test matrix:

- group A active Block 1 / group B active Block 2;
- Assignments filter follows each group;
- All blocks is temporary browser filter only;
- create assignment defaults correctly;
- create Written Exam;
- create Homework;
- create Project and upload checkpoint evidence;
- create/launch COG assignment and verify result receipt;
- AI grade -> open Review submission -> manual correction -> publish;
- Exam PDF -> annotations in same review workflow;
- Student Summary receives the grade in the configured criterion.

## Phase 13 — Documentation / handoff

After each material implementation checkpoint:

- update the canonical spec if behavior changed;
- update `docs/superpowers/README.md` checkpoint;
- record branch/commit/test/deploy state;
- never rely on chat history as the only handoff.

## Implementation order rationale

The data model and active-block helper come first because the UI must not invent temporary state.

The universal Review submission modal comes after metadata/category work so it can display the canonical category, subtype, and grading configuration rather than adding another transitional grading UI.
