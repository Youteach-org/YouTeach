# YouTeach Assignment architecture: active block, evaluation categories, and in-page grading

Date: 2026-09-24  
Repository: `Youteach-org/YouTeach`  
Status: **APPROVED PRODUCT / ARCHITECTURE DECISION**  
Scope: Group Management, Teacher Assignments, Create Assignment, grading/review, Assignment Library compatibility.

## 1. Purpose

This spec records the accepted redesign requested on 2026-09-24.

The redesign has three goals:

1. Make the current working Block / Unit persistent and group-specific.
2. Replace the flat Assignment Type model in the teacher UX with a hierarchy based on the evaluation criteria configured for the group.
3. Keep PDF review and manual/AI grade correction inside YouTeach instead of opening the submitted PDF in a separate browser tab.

The implementation must preserve existing assignments, submissions, grades, COG receipts, Exam annotations, Project evidence, Assignment Library records, and Student Summary calculations.

## 2. Non-negotiable compatibility rules

- Existing `assignmentTypeCode` values remain readable and supported.
- Existing `evaluationTarget`, `evaluationTargets/<group>`, `evaluationBlock`, `groupEvaluationCriterionId`, and `groupEvaluationCriterionName` remain supported during migration.
- Existing Task Codes are not rewritten.
- Existing submissions, Drive file IDs/URLs, grading history, publication state, Project evidence, Exam annotations, and COG results are not migrated destructively.
- Existing assignments can be enriched lazily with the new metadata when edited or when a safe deterministic migration is possible.
- When a legacy mapping is ambiguous, mark it for review instead of guessing.
- GitHub is the source of truth; Cloudflare deploys from GitHub.

## 3. Canonical hierarchy

The teacher-facing hierarchy is:

**Block / Unit -> Evaluation Category -> Activity Type -> Grading configuration -> Assignment instance**

These concepts must no longer be treated as one flat Assignment Type list.

### 3.1 Evaluation Category = the group criterion

The primary category shown in Assignments is the evaluation criterion configured for that group.

Examples:

- Exams — 40%
- Tasks — 35%
- Participation — 15%
- Projects — 30%
- Clinical Practice — 25%

The teacher may name an evaluation category freely.

Each criterion keeps a stable criterion ID and gains an underlying system family:

`systemCategory`

Approved system families:

- `EXAM`
- `TASK`
- `PARTICIPATION`
- `ATTENDANCE`
- `OTHER`

The visible name is teacher-controlled. The system family is internal behavior metadata.

Example:

```json
{
  "id": "criterion-practical-work",
  "name": "Practical Work",
  "weight": 25,
  "systemCategory": "TASK"
}
```

`ATTENDANCE` is primarily a grade-category family and does not need to create Assignment instances unless a future explicit workflow requires that.

`OTHER` is the compatibility/custom fallback.

## 4. Activity Type / subtype

The Activity Type describes what the assignment actually is. It does not determine where the grade contributes.

### 4.1 EXAM defaults

Suggested built-in subtypes:

- Generic Exam
- Written Exam
- Oral Exam
- Verbs Exam
- Online Exam

Custom exam subtype names are allowed.

### 4.2 TASK defaults

Suggested built-in subtypes:

- Classwork
- Homework
- Project
- Practice / Lab
- Research
- Presentation
- Portfolio
- Other Task

Custom task subtype names are allowed.

### 4.3 PARTICIPATION defaults

Suggested built-in subtypes:

- Classroom Participation
- Discussion
- Teamwork
- Classroom Online Game (COG)
- Other Participation

Custom participation subtype names are allowed.

## 5. Grading configuration is separate from Activity Type

Activity Type must not hard-code one grading method.

The new model separates:

### 5.1 Grading scheme

The score structure:

- `RUBRIC`
- `POINTS`
- `PERCENTAGE`
- `CHECKLIST`
- `ANSWER_KEY`
- `ORAL_RUBRIC`

Additional schemes may be added later without creating new top-level evaluation categories.

### 5.2 Grading workflow

How the score is produced/reviewed:

- `MANUAL`
- `AI_ASSISTED`
- `AUTOMATIC`
- `HYBRID`

Examples:

- Written Exam -> ANSWER_KEY + HYBRID
- Oral Exam -> ORAL_RUBRIC + MANUAL or AI_ASSISTED
- Homework -> RUBRIC + AI_ASSISTED
- Practice / Lab -> CHECKLIST + MANUAL
- Project -> RUBRIC + MANUAL or AI_ASSISTED
- COG -> POINTS/AUTOMATIC for game result ingestion when explicitly configured; current COG receipts remain non-grade results unless the assignment grading configuration opts in.

## 6. New assignment metadata

Do not remove the legacy fields. New assignments should gain explicit metadata similar to:

```json
{
  "assignmentTypeCode": "PJ",
  "systemCategory": "TASK",
  "activitySubtype": "PROJECT",
  "activitySubtypeLabel": "Project",
  "gradingScheme": "RUBRIC",
  "gradingWorkflow": "AI_ASSISTED",
  "evaluationTarget": {
    "groupName": "FANTASMA",
    "block": "Block 2",
    "criterionId": "tasks",
    "criterionName": "Tasks",
    "systemCategory": "TASK"
  }
}
```

For custom visible subtype names, store the custom label separately from the stable internal subtype/fallback value.

The canonical question answered by each field is:

- `evaluationTarget.criterionId`: where does this grade contribute?
- `systemCategory`: what broad system behavior family applies?
- `activitySubtype`: what kind of activity is this?
- `gradingScheme`: how is the score structured?
- `gradingWorkflow`: who/what produces and reviews the score?
- `assignmentTypeCode`: legacy compatibility / Task Code prefix.

## 7. Legacy mapping

Initial deterministic mapping:

| Legacy code | System family | Activity subtype |
| --- | --- | --- |
| `EX` | `EXAM` | `GENERIC_EXAM` |
| `CT` | `TASK` | `CLASSWORK` |
| `HW` | `TASK` | `HOMEWORK` |
| `PJ` | `TASK` | `PROJECT` |
| `PC` | `TASK` | `PRACTICE` |
| `RS` | `TASK` | `RESEARCH` |
| `PT` | `TASK` | `PRESENTATION` |
| `COG` | `PARTICIPATION` | `COG` |

This mapping supplies behavior hints only. The actual grade destination continues to be the selected group criterion in `evaluationTarget`.

A group can therefore have a visible criterion named `Projects` whose `systemCategory` is `TASK`, while another group can place Projects inside a visible `Tasks` criterion. Both are valid.

## 8. Persistent active Block / Unit

### 8.1 Current problem

The existing application has `settings.activeBlock`, which is global. Group evaluation configuration already has a group-specific block count.

A single global block is insufficient when different groups are working in different blocks.

### 8.2 New canonical source

The group owns its active evaluation block:

`groups/<groupName>/activeEvaluationBlock`

Example:

```json
{
  "groups": {
    "FANTASMA": {
      "activeEvaluationBlock": "Block 2"
    }
  }
}
```

### 8.3 Backward compatibility

During migration:

1. Read `groups/<groupName>/activeEvaluationBlock` first.
2. If missing and `settings.activeBlock` is valid for that group, use it as fallback.
3. Otherwise use the first valid configured block.
4. Once the teacher explicitly saves an active block for the group, the group value is canonical.
5. Existing pages that still read `settings.activeBlock` must be migrated to a shared group-aware helper before the legacy global value is retired.

Do not create a second unrelated concept such as `currentAssignmentBlock`.

### 8.4 Group Management UX

For the selected managed group, Group Management shows a compact action such as:

**Active Block: Block 2**

Selecting it opens a popup.

Popup requirements:

- group name;
- current active block;
- one choice for each configured Block / Unit;
- Save;
- Cancel.

Saving persists the value to that group and it remains active until explicitly changed.

If the configured number of blocks changes and the stored active block is no longer valid, resolve it to a valid configured block and persist the correction.

## 9. Assignments block filter

The Assignments page currently defaults to `All blocks`.

New behavior:

- when a working group is active, the default browser filter is that group's `activeEvaluationBlock`;
- `All blocks` remains available as an explicit user selection;
- choosing `All blocks` in Assignments does not change the group's active block;
- switching working group re-resolves the block filter against the newly selected group's active block;
- if the teacher manually chooses another valid block in the browser during the current view, that is only a browser filter and does not silently change Group Management's active block.

Create Assignment also defaults its Block / Unit field to the group's active block, but the teacher may override it for that assignment without changing the group's active block.

## 10. Assignments browser visual hierarchy

The normal Assignments page should present assignments under the currently filtered Block / Unit using the group evaluation categories as primary sections.

Example:

```text
Block 2

Exams · 40%
  Written Exam · First Partial
  Oral Exam · Unit 4 Conversation

Tasks · 35%
  Homework · Cardiovascular Worksheet
  Project · First Aid Presentation
  Classwork · Case Study

Participation · 15%
  COG · Support Meter
```

Assignments whose legacy target cannot yet be resolved safely appear in a clearly marked `Needs category review` section rather than being silently assigned to a criterion.

## 11. Create Assignment redesign

The first decision is no longer a flat list of Exam / Homework / Project / Practice / Research / Presentation / COG as peer categories.

Recommended flow for a specific working group:

1. Block / Unit — defaults to active block.
2. Evaluation Category — configured criterion for the group.
3. Activity Type — options filtered by the category's `systemCategory`.
4. Assignment Name.
5. Due date/time and target/team scope.
6. Instructions.
7. Grading configuration.
8. Criteria/rubric/checklist/answer-key controls required by the selected scheme.
9. Teacher-only AI/review instructions.
10. Type-specific controls, such as Project checkpoints.

If the chosen Evaluation Category has `systemCategory = OTHER`, allow the teacher to choose a compatible built-in Activity Type or a custom subtype.

## 12. Assignment Library

Reusable content remains separate from assigned/historical instances.

Reusable fields may include:

- Activity Type/subtype;
- grading scheme/workflow defaults;
- instructions;
- rubric/checklist/answer-key definition;
- type-specific reusable content.

Run-specific fields remain excluded:

- group;
- evaluation criterion target;
- Block / Unit;
- Task Code;
- due date/time;
- recipients;
- submissions;
- grades;
- publication state.

When reusing a library item in a new group:

- filter/suggest compatible Evaluation Categories by `systemCategory`;
- auto-select only when there is exactly one unambiguous compatible criterion;
- otherwise require teacher selection.

## 13. Submitted PDF review inside YouTeach

The current `Open submitted PDF ->` link opens a separate browser tab. Replace the normal teacher workflow with:

**Review submission**

This opens a large in-page modal.

### 13.1 Modal layout

Desktop/tablet target:

- left side: PDF viewer;
- right side: grading/review controls.

Mobile may stack these sections.

The modal includes:

- student identity;
- assignment name / Task Code;
- Block / Unit;
- Evaluation Category;
- current grading source/mode;
- current AI grade when present;
- rubric/criteria or the applicable grading scheme UI;
- feedback;
- Save manual grade;
- Clear grade when applicable;
- Publish / Unpublish;
- grading history/status.

### 13.2 Manual correction of AI grade

If an AI grade exists, opening Review submission must display it.

The teacher can edit/replace it manually in the same modal.

Saving a manual correction retains the existing canonical protection:

- manual result becomes the current grade;
- `grading.mode = "manual"`;
- teacher review status records the correction;
- the changed grade is unpublished until the teacher explicitly publishes it;
- later AI synchronization must not silently overwrite the newer manual correction.

### 13.3 PDF source

Do not depend on navigating the teacher to the raw Drive URL.

Prefer a shared authenticated teacher PDF source that can render a normal submission with PDF.js inside YouTeach.

The existing Exam PDF source/annotation implementation should be reused or generalized rather than duplicated.

Exam assignments additionally expose the approved annotation tools in the same Review submission experience.

## 14. Existing special workflows

### Exams

- Existing `EX` detection remains compatible.
- Exam annotation data and annotated PDF publication remain intact.
- Written/Oral/Verbs/Online are Activity subtypes, not new grade categories by themselves.

### Projects

- Existing Project evidence/checkpoints remain available for subtype `PROJECT`.
- A Project can contribute to any compatible group criterion chosen by the teacher.

### COG

- Existing COG live-session contract and result receipts remain intact.
- COG is an Activity subtype under the `PARTICIPATION` family by default.
- A COG result does not become an automatic grade unless the assignment grading configuration explicitly enables that behavior.

## 15. Migration strategy

Migration must be additive and staged.

1. Add shared helpers/models and tests.
2. Add group-specific active block with fallback to global `settings.activeBlock`.
3. Default Assignments and Create Assignment to the group active block.
4. Add `systemCategory` to group evaluation criteria.
5. Add new Assignment activity/grading metadata while retaining legacy fields.
6. Redesign Create Assignment and Assignment Browser.
7. Add unified Review submission modal.
8. Migrate other global-active-block consumers to group-aware resolution.
9. Only after all consumers are migrated may the global `settings.activeBlock` be considered for retirement.

No destructive bulk rewrite is required.

## 16. Regression requirements

Tests must cover at minimum:

- group A and group B can have different active blocks;
- Assignments defaults to the current group's active block;
- All blocks remains selectable without changing the active block;
- Create Assignment defaults to active block but can override it;
- existing legacy assignments continue to calculate grades;
- legacy codes map to the expected system family/subtype;
- custom visible criterion names preserve stable criterion IDs/system families;
- Assignment Library does not copy run-specific evaluation targets;
- AI grade can be replaced manually from Review submission;
- manual correction is unpublished until explicit publication;
- later AI sync does not overwrite a newer manual grade;
- Project evidence still works;
- Exam annotation still works;
- COG result receipts still work;
- Student Summary and group-grade runtime continue to use the assignment's explicit evaluation target.

## 17. Files expected to be involved

Likely implementation surface:

- `group-evaluation-model.js`
- `assignment-evaluation-target.js`
- `assignment-create-module.js`
- `assignment-create-module.html`
- `teacher-assignments.js`
- `teacher-assignments.html`
- `group-mangement.js`
- `group-mangement.html`
- shared styles
- grading/PDF source API functions
- relevant tests under `tests/`

Other pages that still read global `settings.activeBlock` must be audited and migrated progressively.

## 18. Decision summary

The accepted conceptual rule is:

> **The group criterion determines where the grade goes. The Activity Type determines what the work is. The grading configuration determines how the score is produced. The active Block determines the default working period.**

These four responsibilities must remain separate.
