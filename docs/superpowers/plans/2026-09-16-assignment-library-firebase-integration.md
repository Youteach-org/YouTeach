> **UX supersession — 2026-09-20 (latest):** The reusable-template data model remains valid, but the latest accepted UI places **Assignment Library inside the Create Assignment popup** behind a **From scratch / Assignment Library** toggle. The standalone Assignment Library panel on the normal Assignments page is superseded. The popup may reuse both saved library/template records and previous assignment instances as reusable sources, while group/team target, Task Code, due date, submissions, grades, and publication state remain new run-specific data. This supersedes the earlier 2026-09-20 note below that kept library workflows outside the primary popup.

# Assignment Library Firebase Integration Plan

> **UX supersession — 2026-09-20:** The template data model and Firebase integration remain valid, but the visible template selector/Load Template/Save Template controls are no longer part of the primary Create Assignment UI. Create Assignment now follows the canonical form recorded in `docs/superpowers/specs/2026-09-15-youteach-continuity-roadmap.md`: type, name, contextual target/group, due date/time, student instructions, visible evaluation criteria, and teacher-only ChatGPT review instructions. Template/library workflows must remain separate unless explicitly reopened by a later decision.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist reusable assignment templates in Firebase and let the existing Teacher Assignments form save and reuse them without introducing a separate library page.

**Architecture:** Keep `assignments` as the assigned-instance store and add `assignmentTemplates` as the reusable source store. The current Create Assignment form gains a minimal template selector/loader; saving a selected assignment creates a template record, and creating from a loaded template writes a clean instance plus template usage metadata atomically.

**Tech Stack:** Static HTML/ES modules, Firebase Realtime Database 10.12.2, Node built-in tests.

**Spec:** `docs/superpowers/specs/2026-09-15-reusable-content-exams-analytics-admin.md`

## Global Constraints

- No separate Assignment Library page/layout in this slice.
- Never copy submissions, grades, publication state, group, or due date into a template.
- New assigned instances remain in `assignments`.
- Reusable templates live under `assignmentTemplates/{templateId}`.
- Historical instances keep `templateId`, `templateVersion`, and a frozen effective-content snapshot.
- Template usage increments only when the assigned instance write succeeds.

---

### Task 1: Lock the Firebase/UI contract with a failing integration test

**Files:**
- Create: `tests/assignment-library-integration.test.mjs`

**Required assertions:**
- Teacher Assignments imports the model builders.
- HTML contains `saveSelectedTemplateBtn`, `assignmentTemplateSource`, and `loadAssignmentTemplateBtn`.
- Teacher JS subscribes to `assignmentTemplates`.
- Teacher JS has save/load template handlers.
- Creating from a loaded template writes `templateId`, `templateVersion`, `templateSnapshot`.
- Template usage and assignment creation are committed through one root Firebase `update`.

Run `node --test tests/assignment-library-integration.test.mjs` and verify RED before implementation.

### Task 2: Persist and load templates through the existing Create Assignment form

**Files:**
- Modify: `teacher-assignments.html`
- Modify: `teacher-assignments.js`

**Behavior:**
- Add a compact template selector at the top of the existing create form.
- Add “Save selected as template” to the existing Actions menu.
- Saving uses `buildAssignmentTemplateRecord` and writes to `assignmentTemplates/{pushKey}`.
- Loading a template fills reusable academic fields only; group and due date remain run-specific.
- Project checkpoint rows load without dates so new review dates must be chosen for the new run.
- Creating after loading a template uses the current form content as the frozen instance snapshot while preserving source `templateId` and `templateVersion`.
- Use a root multi-location Firebase update so assignment creation and usage-count increment succeed together.

### Task 3: Verify regressions and document status

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-reusable-content-exams-analytics-admin.md`
- Modify: `docs/superpowers/specs/2026-09-15-youteach-continuity-roadmap.md`

**Verification:**
- `node --test tests/assignment-library-model.test.mjs tests/assignment-library-integration.test.mjs`
- structural regression checks for grading/project features;
- `node --check assignment-library-model.js`.

Document Firebase/UI integration as implemented on the feature branch, with archive/search/filter/statistics still deferred.


## Execution record — 2026-09-16

- Integration contract was committed first and verified RED: 5/5 source-contract checks failed before implementation.
- Minimal Teacher Assignments integration was then added on the feature branch.
- GREEN verification: 5/5 source-contract checks pass.
- Firebase templates use `assignmentTemplates`; normal runs stay in `assignments`.
- Creating from a template uses one root multi-location `update` for the assigned instance plus `usageCount` / `lastUsedAt`.
- No separate Assignment Library page was introduced.


### GitHub Actions verification

- Workflow run: `35144825718`
- Commit verified: `96a6804092ff93a4fae88f8b4883fab7d1529b62`
- `node --test tests/*.test.mjs`: success
- `sh build-pages.sh`: success
- The verification workflow is temporary and is removed before integration to `main`.
