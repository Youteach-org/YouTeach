# YouTeach continuity roadmap

Date: 2026-09-15
Repository: youteachtk/YouTeach
Status: active
Production target: Cloudflare Pages

## 1. Continuity / decision rule

From this point forward, material product decisions, architecture decisions, workflow rules, and accepted UX behavior for YouTeach must be written to GitHub so another ChatGPT instance can continue without depending on chat memory.

Canonical location:
- `docs/superpowers/specs/`

Working rule:
1. GitHub is the source of truth.
2. Implement code in GitHub first.
3. Cloudflare deploys from GitHub.
4. Update this roadmap or a dated spec whenever a material decision changes.
5. Do not rely on Vercel as the production source of truth.
6. Keep YouTeach separate from Classroom Online Games repositories; integrations use explicit contracts only.

## 2. Current architecture

- Frontend: static HTML/CSS/JS from `youteachtk/YouTeach`.
- Production hosting: Cloudflare Pages.
- Database / live state: Firebase Realtime Database.
- Assignment evidence storage: Google Drive.
- Assignment PDFs are not stored in Firebase Storage.
- Assignment upload route: Cloudflare Pages Function at `/api/drive-upload-session`.
- AI grade import route: Cloudflare Pages Function at `/api/sync-ai-grades`.

## 3. Assignment decisions already accepted

### 3.1 Task identity
- Task Code is generated automatically.
- Task type provides the prefix, e.g. CT, HW, EX, PJ, PC, RS, PT, COG.
- Group contributes a compact group key.
- Date uses DDMMYY.
- If generated code already exists, the teacher must change task-defining data.
- Before submissions exist, task-defining data may update the code.
- After the first submission exists, task-defining data and Task Code are locked.

### 3.2 Student submissions
- PDF only.
- Maximum 15 MB.
- One current PDF per student per task.
- Re-submission replaces the previous PDF.
- Undo Submission deletes the previous Drive file/evidence and allows a new submission.
- Each task uses its own Drive folder:
  `YouTeach Assignments/{TASK-CODE}/`
- Student PDF naming is based on student identity + Task Code.
- Identity is never assumed from filename alone; visible/written identity inside the PDF is checked during grading.

### 3.3 Evaluation criteria
- Every assignment rubric totals 100 points.
- Criteria can be:
  - preset;
  - custom.
- Points may be distributed equally or manually.
- Teacher-only grading notes are supported.
- Current accepted preset examples include Neatness, Originality, Analysis, Conclusions, Complete Work, and other teacher-selected criteria.
- A criterion that cannot be evaluated from available evidence must not automatically receive zero.

### 3.4 Grading
Two grading paths coexist:

#### Manual grading
- Teacher grades from the submitted-student card.
- Scores are entered per criterion.
- Total is calculated out of 100.
- Teacher feedback is stored with the submission.
- A saved manual grade can be cleared without deleting the student's submitted file.
- **Clear grade** is available directly from the submitted-student card and from the Manual Grading panel when the current grade mode is manual.
- Clearing a manual grade unpublishes it and returns that submission to pending grading so it can be graded again manually or by AI.

#### AI grading
- AI Grading opens ChatGPT for the selected Task Code.
- ChatGPT reads the task rubric JSON and submitted PDFs from the task Drive folder.
- ChatGPT evaluates the exact configured criteria.
- Identity is marked verified, manual-review, or mismatch.
- Non-evaluable criteria use `not-gradable` and `score: null`; no invented score.
- ChatGPT creates/replaces:
  `{TASK-CODE}--grading-results.json`
- YouTeach imports that file with Sync AI Grades.

Canonical AI grading workflow:
- choosing AI Grading starts AI evaluation for the selected assignment;
- once the AI result is available, the grade is applied to YouTeach internally and appears on the teacher submission cards;
- AI grades are **unpublished by default** and are not visible to the student yet;
- the teacher is notified that AI grading is complete and can review each result;
- if the teacher disagrees, opening the student card and saving a manual grade replaces the internal AI grade for that submission;
- publication is a separate teacher decision; only published grades appear on the student side;
- the previous Keep Manual / Compare / Replace selector is deprecated by this workflow and should be removed from the normal grading path;
- importing/applying AI results never deletes the `{TASK-CODE}--grading-results.json` source file in Drive.

A manual grade must never be silently overwritten by a later AI rerun unless the teacher explicitly starts a regrade for that changed/new submission.

### 3.5 Grading order / visual states
- Ungraded student submissions appear first.
- Graded student submissions use a distinct visual state and move to the end.
- If AI reviewed a submission but a criterion still requires manual review, it remains in the pending section.
- Fully evaluated assignments can also use a distinct state and move later in the assignment browser; this behavior is retained.



### Create Assignment canonical form — 2026-09-20

This section's earlier exclusion of library/template selection from Create Assignment is superseded by the **Assignment Library toggle decision — 2026-09-20** below. The assignment-instance fields remain the canonical creation form.

The normal **Create Assignment** form must prioritize the assigned instance itself, in this order:

1. Assignment Type.
2. Assignment Name.
3. Assignment target/group context.
4. Due date and time.
5. Instructions for students.
6. Evaluation criteria.
7. Instructions for ChatGPT when reviewing/grading.
8. Type-specific controls such as Project checkpoints only when applicable.

Rules:
- **Other** is the only Assignment Type that reveals a custom type text field.
- The creation form itself remains focused on the assignment instance; reusable-source selection is handled by the explicit **From scratch / Assignment Library** toggle documented below.
- Template/library infrastructure must not appear as unrelated controls mixed into the assignment fields.
- Evaluation criteria are a required visible section of Create Assignment, not hidden behind a collapsed control.
- Criteria retain the approved model: preset + custom criteria, exactly 100 total points, equal or manual distribution.
- Instructions for ChatGPT are teacher-only grading/review instructions and remain separate from student instructions.
- If a specific working group already exists in YouTeach context, Create Assignment uses and displays that group by default and does not make the teacher select it again.
- If no specific working group exists, the Group control is available so the teacher can choose the target.
- When opened from Team Generator, the generated-team target further scopes the assignment to All Generated Teams or one generated team; All Generated Teams means only students in those generated teams.


### Create Assignment popup architecture — 2026-09-20

- **Create Assignment is a reusable popup module, not the Teacher Assignments page inside a modal.**
- Both the Teacher Assignments page and Buzzer/Team Generator open the same dedicated module.
- The popup loads `assignment-create-module.html` and contains the Create Assignment workflow plus its integrated **Assignment Library** source selector.
- It must not include Assignment Browser, assignment detail/submissions, grading panels, or the rest of `teacher-assignments.html`.
- The standalone Assignment Library panel on the normal Assignments page is removed; Assignment Library belongs inside the Create Assignment popup.
- The normal Assignments page remains behind the modal and refreshes through the existing Firebase listeners after a new assignment is created.
- Buzzer passes generated-team context into the same module; the Assignments page opens it with normal working-group context.
- Closing the popup returns the teacher to the screen from which it was opened.
- On the normal Assignments page, **Create Assignment is a direct button**. The redundant **Actions** menu/button is removed and must not be reintroduced as the primary creation entry point.


### Assignment Library toggle inside Create Assignment — 2026-09-20

This supersedes the earlier rule that Assignment Library must stay outside the Create Assignment popup.

- The Create Assignment popup starts with a two-mode toggle:
  - **From scratch**
  - **Assignment Library**
- **From scratch** shows a clean new-assignment form.
- **Assignment Library** reveals the reusable-assignment browser inside the same popup.
- Choosing a library item pre-fills reusable assignment content (type, name, student instructions, evaluation criteria, teacher-only ChatGPT instructions, and reusable type-specific content such as Project checkpoint definitions).
- Run-specific fields are never copied from the source: target/group/team recipients, Task Code, due date/time, submission state, grades, publication state, and other run/session state must be newly selected/generated.
- The library may use existing saved reusable assignment records and prior assignments as reusable sources; the teacher's intent is to base a new assignment on a previous assignment without leaving the popup.
- Switching back to **From scratch** clears library-source linkage and restores a fresh form while preserving the current working-group/team context.
- Assignment Library is no longer a standalone panel on the normal Assignments page.

## 4. Accepted Teacher Assignments UX

- Assignment cards are compact, not full-page rows.
- Desktop aims to show multiple assignment cards at once.
- Assignment browser supports compact filtering/navigation.
- Create Assignment opens from the direct **Create Assignment** button; there is no Actions menu.
- Selected assignment summary is compact.
- Criteria summary is compact and visible when an assignment is selected.
- Criteria are arranged efficiently rather than occupying large vertical panels.
- Manual grading opens from a student submission card.
- Missing submissions remain secondary/collapsible.
- The **Missing submissions** control stays collapsed by default.
- When opened, it shows compact student cards for every eligible student who has not submitted, including name/ID/group and a visible Not submitted state.
- Missing-student cards must remain completely hidden until the teacher opens the Missing submissions control.
- Student submission cards are the primary content.
- Avoid wasting vertical space.
- Hamburger menu must reserve a safe zone so it never covers page titles.

## 5. Accepted Student Assignments UX

- Compact card grid.
- Desktop target: six assignment cards per row where viewport allows.
- Responsive fallback for tablet/mobile.
- Clear submission state.
- After successful upload, normal Submit is disabled.
- Undo Submission is available.
- After undo, next action is Submit Again.
- Status text must be visibly distinguishable.

## 6. Login / responsive decisions

- Teacher and Student password fields include a show/hide password control.
- **Global YouTeach rule:** every Teacher and Student page must use the full available viewport width in tablet portrait and mobile layouts.
- Hidden/fixed/collapsed sidebars must never reserve a phantom desktop grid column on any page.
- The global responsive guard lives in `styles.css` and `shared-ui-fixes.js`; page-specific CSS must not reintroduce a reserved 260px sidebar column.
- Tablet portrait layouts should use sensible multi-column grids where space permits rather than collapsing content into narrow vertical strips.
- The hamburger safe area applies **only to the title/topbar row**, never to the full page content column.
- The hamburger sits slightly inset at the upper-left so it visually belongs to the title bar.
- Only the title/topbar receives left padding to clear the hamburger; all controls, cards, filters, tables, and content below the title return to the normal full-width content margin.
- Do not create a blank vertical column under the hamburger.
- Tables/carousels may scroll internally, but the page body should not become horizontally wider than the viewport.
- Mobile may collapse to one column where appropriate.

## 7. Immediate next milestone: close the grading loop end-to-end

Priority 1.

Test with real existing assignment submissions:

1. Select a task with submitted PDFs.
2. Run AI Grading.
3. Confirm ChatGPT reads:
   - `{TASK-CODE}--evaluation-criteria.json`
   - every submitted PDF in that folder.
4. Confirm ChatGPT writes:
   - `{TASK-CODE}--grading-results.json`
5. Run Sync AI Grades in YouTeach.
6. Verify Firebase receives:
   - criterion scores;
   - total /100 when calculable;
   - feedback;
   - identity status;
   - AI/manual mode;
   - manual-review state for non-gradable criteria.
7. Verify student submission cards:
   - pending first;
   - graded last;
   - distinct graded color;
   - correct displayed total.
8. Verify AI grades are applied internally but remain unpublished.
9. Verify teacher cards clearly show AI-graded/unpublished state.
10. Verify the teacher can replace an AI grade by entering a manual grade on the student card.
11. Verify publishing is explicit and student-side grade visibility depends only on publication status.
12. Confirm no PDF, rubric, grading-results JSON, or prior historical grade record is deleted unintentionally.

Acceptance: one complete real task can be graded by AI, applied to YouTeach automatically/with no conflict-choice ambiguity, reviewed by the teacher, optionally corrected manually, and published to the student only when the teacher decides.

## 8. Next milestone: cross-device UI validation

Priority 2.

Validate:
- desktop;
- tablet landscape;
- tablet portrait;
- phone portrait.

Pages:
- Teacher Home
- Teacher Assignments
- Student Assignments
- Teacher Login
- Student Login
- Buzzer / Student Buzzer

Acceptance:
- no narrow phantom columns;
- no title/hamburger overlap;
- no clipped controls;
- no word-by-word vertical wrapping;
- cards use available width;
- secondary controls do not dominate primary content.

## 9. Next milestone: grading results for students

Priority 3, after teacher-side grading is verified.

Accepted behavior:
- AI/manual grades can exist internally before publication.
- Student sees a grade only when the teacher publishes/releases it.
- Student can see grade /100 when released.
- Student can see criterion breakdown and teacher/AI feedback when released.
- Identity/manual-review warnings remain teacher-side unless a deliberate student-facing message is defined.
- Teacher controls publication per submission; bulk publication may be added for an assignment.
- An unpublished grade must never leak to the student side.

## 10. Next milestone: assignment lifecycle + reusable assignment library

Priority 4.

Assignments are not disposable records. Many activities are reused when a teacher teaches the same subject/course again.

Accepted direction:
- separate a reusable **Assignment Template** from a specific **Assigned Instance**;
- the template stores reusable academic content:
  - type;
  - title;
  - instructions;
  - evaluation criteria;
  - teacher grading notes;
  - subject/course association;
  - topic/unit tags;
  - reusable resources/metadata;
- the assigned instance stores run-specific data:
  - Task Code;
  - group;
  - due date;
  - active/closed state;
  - submissions;
  - grades;
  - release status;
- a teacher can create a new assignment from a saved template without carrying over old submissions or grades;
- historical assigned instances remain available for analytics and comparison.

Foundation status — 2026-09-16:
- Assignment Library foundation and Firebase integration merged into `main`;
- pure Template vs Assigned Instance model is now part of the canonical branch;
- reusable content extraction explicitly excludes group/date/submission/grade/publication state;
- new instances keep a frozen `templateSnapshot` plus `templateId` / `templateVersion`;
- Firebase persistence under `assignmentTemplates` is implemented on the feature branch;
- Teacher Assignments can save the selected activity as a template and load a template into the existing Create Assignment form;
- creating from a template atomically writes the new assigned instance plus template usage metadata;
- group/due date and Project checkpoint dates remain run-specific;
- dedicated library browse/search/filter/archive UX is merged into `main`;
- the management panel supports active/archived status, archive/restore, usage filtering, metadata filters, and loading active templates without changing historical instances.

Remaining lifecycle decisions / implementation:
- archive old assigned instances without deleting reusable templates;
- duplicate/reuse an assignment template for a new group/date;
- reopen vs permanently close an assigned instance;
- whether closed tasks accept teacher-authorized late submission;
- grade release status;
- optional due-date exception per student;
- grading history / audit trail if a grade changes.

### 10.1 Course intelligence from reusable assignments

Long-term goal:
YouTeach should use accumulated assignment/exam history to help characterize a course and support creation of a teacher's own program based on real class statistics.

The data model should support:
- subject/course;
- unit;
- topic;
- subtopic where useful;
- assignment/exam type;
- criteria used;
- participation/completion;
- score distributions;
- common weak areas;
- historical performance by topic;
- reuse frequency;
- group/cohort comparisons over time.

This analytics layer should make it possible later to:
- identify topics that consistently need reinforcement;
- identify content that students master quickly;
- estimate how much class/practice time a topic tends to require;
- compare activities used for the same topic;
- suggest future sequencing based on the teacher's own historical data;
- help draft a course program/syllabus using the teacher's actual teaching history and statistics.

Important:
- analytics must preserve the distinction between reusable templates and historical assigned instances;
- historical student evidence/grades are not copied into a new assignment when reusing a template;
- course-program recommendations are a later feature and must be derived from teacher-owned historical data, not generic assumptions.

## 11. Exam Bank

Priority 5 after the current assignment grading loop, responsive validation, and core assignment lifecycle are stable.

The approved exam-library feature is a **manual Exam Bank**.

Approved behavior:
- exams are added manually only;
- one uploaded file equals one independent Exam Bank entry;
- preserve the original file unchanged;
- metadata includes title, subject/course, unit/topic, exam type, date, version, and free-form tags;
- support upload, classification, search/filter, retrieval, and download;
- do not parse files into questions/sections;
- do not maintain an internal Question Bank;
- do not provide an internal Exam Creator;
- do not provide internal AI generation/rearrangement;
- do not provide an internal "use as base for a new exam" workflow.

Any AI that reads prior exams, rearranges them, or creates a new exam is external to the Exam Bank and must be designed separately.

## 12. Administration section

Priority 6.

Create a dedicated **Administration** section with system-wide visibility.

Admin should be able to see, at minimum:
- teachers/accounts/roles;
- students;
- groups;
- courses/subjects;
- assignment templates;
- assigned instances;
- submissions and grading status;
- Exam Bank entries/files;
- storage/integration status;
- relevant activity/audit information.

Admin permissions must be broader than Teacher permissions, but destructive actions should be explicit and auditable.

Administration should eventually support:
- account/role management;
- global search;
- cross-group visibility;
- archive/recovery workflows;
- data consistency checks;
- integration health (Firebase, Drive, Cloudflare-related app status where practical);
- audit/history for sensitive changes.

The Administration UX must not be mixed into normal Teacher pages; it is a separate role-aware section.

## 13. Next milestone: authentication hardening

Priority 7.

Current teacher login still contains simple built-in credentials. Before wider real-world deployment, replace this with a proper authentication/authorization model while preserving teacher/admin roles.

Requirements to decide:
- Firebase Auth vs another provider;
- teacher account provisioning;
- password reset;
- admin account management;
- session duration;
- permission model.

## 14. Cloudflare / deployment cleanup

After the Cloudflare production path is confirmed stable:
- remove obsolete Vercel-only deployment assumptions;
- keep only compatibility files that still serve a documented purpose;
- document required Cloudflare secrets;
- verify no hard-coded production links still point to Vercel;
- keep GitHub -> Cloudflare as the canonical deployment path.

## 15. COG / Verb Runner integration boundary

YouTeach remains the source of student identity/credentials/session context.
Classroom Online Games remains a separate repository.

Continue integration through explicit launch/session contracts rather than merging repositories.

Pending follow-up:
- validate credentialed Verb Runner launch end-to-end;
- verify Teacher Monitor sees free-mode students as well as session students;
- preserve nickname/identity uniqueness.

## 16. Current next action

Do not add another large feature first.

Current implementation status:
- AI grading -> teacher review -> explicit publish is implemented on `main`, pending field validation;
- published grades/student details are implemented;
- grading history/audit is implemented;
- Project checkpoints/evidence are implemented;
- exam PDF annotation is implemented;
- the provisional internal Question Bank / Exam Creator / Answer Sheet Creator are unapproved and must not be extended.

Next action:
**field-validate the implemented grading/publication workflow on real tasks and fix any production issues found.**

After that, continue in this order:
1. cross-device UI verification and fixes;
2. Assignment Template / Assigned Instance lifecycle;
3. reusable Assignment Library;
4. Course -> Unit -> Topic -> Subtopic metadata;
5. course/topic analytics foundation;
6. manual Exam Bank;
7. Administration section;
8. authentication hardening;
9. Cloudflare/deployment cleanup;
10. Course Intelligence / Program Builder when enough historical data exists.

The next **large product feature** after validation/responsive work is the Assignment Template / Assigned Instance lifecycle and Assignment Library.


## Teacher Buzzer auditory alert — 2026-09-20

Accepted behavior:
- the Teacher Buzzer emits a short two-tone audible alert whenever a new `session/current/buzzer/currentBuzz` appears;
- the alert is driven by the live Firebase buzz state, not by teacher-side buttons;
- the first Firebase snapshot after page load does not replay an old buzz;
- clearing `currentBuzz` arms the alert for the next student press;
- browsers may require one teacher interaction with the page before programmatic audio is allowed, so the audio context is primed on the first pointer or keyboard interaction.


## Buzzer active-team exhaustion — 2026-09-20

Accepted behavior:
- `Mark Wrong / Next` locks the team that answered incorrectly;
- after locking that team, the Teacher Buzzer evaluates only teams that currently have at least one active student in the session group;
- if every active team is locked, the round closes automatically because no eligible team remains to answer;
- inactive/offline teams must not keep a round artificially open;
- opening a new round clears all round lockouts as before.


## Reusable Assignments module from Team Generator — 2026-09-20

Accepted behavior:
- Team Source shows a live count matching Present Students Only or All Students in Group.
- Team generation happens before activity assignment.
- Buzzer does not display Assignment Type, Other Type, Target Team, or scheduling fields before teams exist.
- After teams are generated, an **Assignments** control opens the shared Assignments workspace in a modal.
- The normal Assignments page can open the same module.
- Create Assignment is type-first; Other alone reveals custom type input.
- The former Start from scratch template option is removed; templates are optional and filtered by type.
- Team-context Assignments can target All Generated Teams or one generated team.
- All Generated Teams means only students inside the generated teams, never the whole enrollment by implication.
- Assigned instances store exact recipient student keys and generated-team metadata.
- Student UI and server upload/evidence validation enforce exact recipients.
- Classroom Online Games remains one Assignment Type and does not regain a standalone Buzzer button.


## Buzzer and Create Assignment layout decisions — 2026-09-20

Create Assignment:
- The custom **Specify other type** control must not be visible or occupy layout space unless Assignment Type = **Other**.
- The student-instructions field is the dominant text field in Create Assignment because it contains the teacher's instructions to students about what to do and submit.
- Student instructions span the available form width and use substantially more vertical space than ordinary fields.
- Teacher-only ChatGPT review instructions remain separate.

Buzzer:
- **Buzzer Control** is a full-width section immediately below the title/context bar and above **Teams and Members**.
- Do not keep Buzzer Control in a narrow right column that leaves unused space below it.
- **Teams and Members** uses a responsive card grid.
- The team that currently owns the first/current buzz is ordered first and therefore occupies the upper-left grid position; the remaining teams follow in the grid.
- **Working Group** belongs inside the **Team Source** section, not in a separate generator card/column.
- **Reset Session** is visually distinct as a destructive/reset action rather than sharing the normal button appearance.


### Create Assignment toggle visual state and Assignments resilience — 2026-09-20

- The **From scratch / Assignment Library** toggle must show the selected mode with a clearly different active color; the inactive mode uses a neutral appearance.
- Removing or relocating Assignment Library UI must never leave required DOM references that crash the normal Assignments page.
- Legacy template/library compatibility code on the normal Assignments page must be null-safe or backed only by hidden compatibility elements; it must never be required for visible rendering.


## Group evaluation model and Students grade dashboard — 2026-09-20

> **SUPERSEDED later on 2026-09-20:** Do not implement the fixed Tasks / Exams / Participation / Attendance model below. It is retained only as history. The canonical model is **Dynamic group evaluation criteria and reusable templates — 2026-09-20**.

This supersedes the fixed three-column raw-points interpretation on the Teacher **Students** page.

### Group creation / configuration
- A group is not complete with only a name and student roster. Each group also owns its evaluation configuration.
- The teacher sets the number of evaluation blocks/units for the group. The UI uses **Block 1...Block N** for compatibility with the existing grade/points data model.
- The teacher sets four grading weights:
  - **Tasks**
  - **Exams**
  - **Participation**
  - **Attendance**
- The four weights must total exactly **100%** before a new group can be created or an evaluation setup can be saved.
- Existing groups created before this model remain valid, but are marked **Evaluation setup required** until weights are configured.
- Existing group evaluation settings must be editable from **Group Management** without recreating the group or students.

Canonical group fields:
```text
groups/{groupName}/evaluationUnitCount
groups/{groupName}/evaluationWeights/tasks
groups/{groupName}/evaluationWeights/exams
groups/{groupName}/evaluationWeights/participation
groups/{groupName}/evaluationWeights/attendance
```

### Students page
- **Students** becomes the primary group grade overview, not a raw activity-points table.
- The number of block columns is dynamic and comes from the selected group's `evaluationUnitCount`; do not hard-code three blocks.
- Each block cell shows the student's **current accumulated grade for that block (0–100)** according to the selected group's evaluation weights.
- The page also shows the selected group's evaluation setup so the teacher can see how the grade is composed.
- If the selected group has no evaluation setup, block grades show an explicit **Setup required** state rather than pretending raw points are a final grade.

### Category calculation / backward compatibility
- Modern Assignment grades use published or teacher-visible `grading.totalScore` values on a 0–100 scale:
  - `EX` assignments feed the **Exams** category.
  - other graded assignment types feed the **Tasks** category.
- New assignments persist the active evaluation block at creation so their grades can be attributed to the correct block.
- For existing historical data, legacy block stores remain valid fallbacks:
  - `taskPoints[Block N]` -> Tasks contribution
  - `examPoints[Block N]` (written + oral + verbs) -> Exams contribution
  - `blockPoints[Block N]` -> Participation contribution
  - `attendancePoints[Block N]` -> Attendance contribution
- If modern graded assignments exist for a Tasks or Exams category in a block, their average 0–100 score is multiplied by that category's configured weight. Otherwise the legacy category points are used as a direct contribution, capped at that category's configured weight.
- Participation and Attendance legacy points are direct weighted contributions, capped at their configured category weights.
- Current block grade is the sum of category contributions and is capped at 100.


## Dynamic group evaluation criteria and reusable templates — 2026-09-20

This **supersedes** the earlier fixed-category model that assumed every group used Tasks, Exams, Participation, and Attendance.

### Dynamic criteria
- Evaluation criteria are defined **per group**. There is no universal fixed list.
- A group evaluation setup contains:
  - number of evaluation blocks/units;
  - an ordered list of criteria;
  - each criterion has a stable id, teacher-defined name, percentage weight, and grade source.
- Teachers may add, remove, rename, reorder, and replace criteria when a course changes.
- Criterion weights must total exactly **100%** before saving.
- Existing students remain attached to the group when criteria are edited/replaced.

Canonical fields:
```text
groups/{groupName}/evaluationUnitCount
groups/{groupName}/evaluationCriteria/{criterionId}/id
groups/{groupName}/evaluationCriteria/{criterionId}/name
groups/{groupName}/evaluationCriteria/{criterionId}/weight
groups/{groupName}/evaluationCriteria/{criterionId}/source
groups/{groupName}/evaluationCriteria/{criterionId}/order
```

Supported source identifiers are implementation mappings, not user-visible mandatory criteria:
- `writtenExam` -> legacy/imported written exam score
- `oralExam` -> legacy/imported oral exam score
- `verbsExam` -> legacy/imported verbs exam score
- `tasks` -> task/assignment grades and legacy task points
- `participation` -> participation/activity points
- `attendance` -> attendance points
- `assignments` -> assignments explicitly tagged to this criterion
- `manual` -> criterion exists but requires teacher-entered/imported grade data

### Evaluation templates
- Group evaluation setups can be saved as reusable templates independently of student rosters.
- Create Group provides a template selector plus **Use Template**; choosing a template preloads blocks/units and all criterion definitions.
- **SUPERSEDED:** there is no separate Save as Template action. Saving a valid group evaluation setup automatically ensures an independent reusable template exists.
- A teacher can finish a course, replace the old criteria for the same group, or reuse the old setup when creating a new group.
- Templates never copy students, grades, attendance, assignments, or other historical student data.

Canonical template path:
```text
groupEvaluationTemplates/{templateId}
  name
  evaluationUnitCount
  evaluationCriteria
  createdAt
  updatedAt
  createdBy
```

### Students page
- Students renders criteria from the selected group's configuration; labels and percentages are never hard-coded.
- Each block grade is the weighted sum of the group's configured criteria.
- The cell breakdown uses the teacher-defined criterion names.
- If the group has no configured criteria totaling 100%, Students shows **Evaluation setup required**.

### Institution-specific evaluation setups
YouTeach remains universal and does **not** hard-code CLE, a school, a course, or any fixed evaluation rubric.

For the current CLE Otoño 2026 course, the teacher may create and save a personal reusable evaluation template with:
- Examen escrito — 35%
- Examen oral / práctica oral — 40%
- Tareas — 10%
- Examen de verbos — 15%

Those values live in teacher/group/template data, not as a built-in application preset. Another teacher sees and creates only the criteria relevant to their own groups.

### End-of-block report
- **Students** provides a **Block Report** action for the selected group.
- The report generates one column per configured group criterion, then **TOTAL**, plus an optional student signature column.
- Each criterion may define a short report label (for example a teacher may use E, PR.O, V, T); labels are data, not hard-coded UI.
- Organization, department, period, course/program, parallel groups, report title, and whether to include signatures are editable report settings saved per group.
- **SUPERSEDED:** report settings do not travel with a rubric template; templates are criteria-only.
- The report is printable / Save-to-PDF friendly and uses the same grade calculation as Students.
- Institution-specific report layouts are represented as data/settings; the calculation engine remains universal.


## Group Management redesign — 2026-09-20

This supersedes the old **Group Management** page structure.

### Naming and layout
- The teacher page is called **Group Management** everywhere in the teacher UI. The legacy URL `teacher-enrollment.html` may remain for compatibility; visible labels must say **Group Management**, not the old "Groups / Import".
- **Create / Edit Group** is a full-width card at the top.
- The standalone **Delete Group** card is removed.
- The standalone **Add Student** card is removed.
- Directly below Create / Edit Group is a full-width **Enrolled Students** section.
- The **Groups** list remains at the bottom and is the place to select/manage/delete a group.

### Group selection and evaluation setup
- Clicking the **group name** in the Groups list selects that group for management and loads its settings into the single Create/Edit Group card.
- There must not be a repeated **Set Evaluation** button on every group row.
- The evaluation editor appears in the single management card for the currently selected group.
- **Use Template** must include:
  1. explicitly saved evaluation templates; and
  2. any existing group whose evaluation criteria are valid (100%), so a configured group can immediately serve as a reusable template.
- Using another group as a template copies only reusable group setup (block/unit count, evaluation criteria, and reusable report settings), never students, grades, attendance, assignments, or enrollment requests.

### Enrolled Students
- The section is a vertical list of full-width student/request cards.
- Each card shows status, student/request name, nickname, External ID when available, and group.
- External ID is optional at enrollment and remains editable later from the student record.
- The list supports the standard master checkbox for select/deselect all visible cards.
- Controls include:
  - **Create Enrollment Link**
  - **Add Student**
  - **Approve**
  - **Deny**
  - **Expel**
- **Add Student** opens a popup/modal containing the existing manual fields (Full name, Nickname, optional External ID); it does not occupy a permanent card.
- Double-clicking an enrolled student opens that student's existing teacher-view student record.
- Approve applies only to pending requests; Deny applies only to pending requests; Expel applies only to enrolled students.

### Enrollment links and approval
- A teacher can create/rotate an enrollment link for the selected group.
- The public link includes a group identifier and opaque enrollment token.
- A student following the link submits a **pending enrollment request**, not a Student record.
- The request asks for Full Name, Nickname, and optional External ID.
- A pending request becomes a real `students/{studentKey}` record only after teacher approval.
- Denying a request records the denial/removes it from the active pending list without creating a student.
- Enrollment request state lives separately from the canonical enrolled-student records.

Canonical paths:
```text
groups/{groupName}/enrollment/token
groups/{groupName}/enrollment/enabled
groups/{groupName}/enrollment/updatedAt
groupEnrollmentRequests/{groupName}/{requestId}
```

### Delete Group with automatic backup
- Delete is available from the Groups list, not from a standalone card.
- Deletion requires an explicit confirmation containing the exact group name.
- Before any destructive database write, the browser automatically downloads a reconstruction-oriented JSON backup.
- The backup includes, when present:
  - group configuration and report settings;
  - students in the group, including grade/point fields;
  - pending/denied enrollment request records;
  - assignments targeted to the group;
  - assignment submissions for those assignments and/or those students;
  - attendance records for those students;
  - point-history records attributable to those students/group;
  - backup schema/version and export timestamp.
- Only after the backup download has been initiated does YouTeach remove the group and its group-owned/student-owned live records.
- The backup is meant to make later reconstruction possible; it is not merely a visual report.


### Group Management compact-selection UX — 2026-09-20 (latest)

This supersedes any earlier Group Management wording that implied repeated row-level action buttons or a permanently visible template selector.

- **One function = one contextual control area.** Do not repeat Delete, Set/Edit Evaluation, Approve, Deny, Expel, or similar actions on every row.
- The **Groups** table is selection-first:
  - clicking a group selects it and loads the single management context;
  - clicking the already-selected group again toggles/collapses its **Enrolled Students** list;
  - the selected row shows a chevron/collapse affordance;
  - group actions such as **Delete Group** appear once in a contextual selected-group action bar, never once per group row.
- The **Enrolled Students** list is space-efficient:
  - each student/request is a single horizontal row, comparable to one spreadsheet row;
  - columns are Status, Full Name, Nickname, External ID (plus selection control);
  - do not stack a student's name above metadata;
  - the roster is collapsible.
- Student/request actions are contextual:
  - the action bar is hidden when nothing is selected;
  - selecting pending request(s) reveals only relevant request actions such as Approve / Deny;
  - selecting enrolled student(s) reveals only relevant enrolled-student actions such as Open Record / Expel / External ID edit;
  - double-clicking an enrolled row still opens the student record.
- Group-level controls such as **Create Enrollment Link** and **Add Student** remain available for the selected group without being repeated per student.

### Evaluation template library interaction — 2026-09-20 (latest)

- **Use Template** is the only persistent template control in the group editor. There is no permanently visible template dropdown and no separate **Save as Template** button.
- Pressing **Use Template** opens a popup/modal containing previously used/saved evaluation templates.
- A template is an independent reusable evaluation-setup object. A group itself is **not** the template and the template must not retain a live association to a source group.
- When a valid evaluation setup is saved on a group, YouTeach ensures that an equivalent independent reusable template exists under `groupEvaluationTemplates`.
- Existing configured groups created before this rule may be harvested once into independent reusable templates so their prior criteria are not lost.
- **SUPERSEDED by the rubric-template rule below:** template identity is not based on unit count, percentages, report settings, or group identity.
- The template popup lists only reusable template records. Selecting a template and confirming **Use Selected Template** copies its reusable setup into the current group editor.
- Templates never copy or reference students, grades, attendance, assignments, enrollment requests, or any other group-specific live data.


### Group Management row/state correction — 2026-09-20 (latest)

This supersedes any earlier Group Management layout that still separated roster metadata, kept Select all away from the roster, exposed evaluation-source mappings in the normal criterion row, or forgot the teacher's current management context when navigating away.

- Each roster item is exactly one compact horizontal row with these visible columns:
  `checkbox | Full Name | Nickname | External ID | Group`.
- Pending versus enrolled state may be indicated by row styling/title and the contextual actions, but must not add another permanent column that expands the row.
- The **Select all** checkbox lives in the roster header's checkbox column, directly above the row checkboxes it controls.
- Student/request actions are selection-driven and hidden when nothing is selected:
  - pending request -> Approve / Deny;
  - enrolled student -> Open Record / Edit External ID / Expel;
  - applicable batch actions may appear for multi-selection.
- Navigating to another YouTeach page and returning must preserve, within the same browser tab/session:
  - selected managed group;
  - roster expanded/collapsed state;
  - evaluation editor expanded/collapsed state;
  - selected student/request rows that still exist.
- The basic criterion editor shows only `Criterion name | Abbr. | % | Remove`.
- Internal criterion grade-source mappings are implementation detail/advanced compatibility data and must not occupy the normal setup UI.
- New custom criteria default to manual storage, while assignments explicitly tagged to a criterion feed that criterion regardless of its internal legacy source mapping.
- **Use Template** opens the reusable-template popup directly. No permanent `Start with custom criteria` selector is shown.
- When templates exist, the popup selects a usable template by default so the teacher can apply it without first discovering a hidden selection prerequisite.


### Rubric-template semantics — 2026-09-21 (latest)

This is the canonical template rule and supersedes earlier wording that treated a whole configured group, its block count, report settings, or percentage distribution as the template.

- An evaluation template is a reusable **ordered set of rubric/criterion names**, independent of every group.
- Saving a valid group's evaluation criteria automatically ensures a matching template exists. There is no extra Save Template step.
- Template identity/deduplication uses the ordered normalized criterion names only. **Percentages are not part of template identity.**
- The template does retain the most recently explicitly saved percentages as editable starting values so another group can apply the template and then change those percentages.
- Abbreviations and internal source mappings may be copied as defaults, but they do not create a different template.
- Group name, roster, grades, assignments, attendance, block/unit count, enrollment state, and report settings are never part of the template and are never applied by **Use Template**.
- The automatic template name is the ordered rubric names joined together, for example:
  `Written exam · Oral exam · Verbs exam · Tasks`.
- **Use Template** shows one compact row per template. The row displays each rubric together with its copied starting percentage, for example:
  `Written exam 35% · Oral exam 40% · Verbs exam 15% · Tasks 10%`.
- Existing configured groups may be harvested into this criteria-only library for backward compatibility, but the resulting template is not linked back to that group.
- When an existing old template is encountered, YouTeach normalizes it to this criteria-only contract and removes legacy group-specific fields.
- Operational reset requested on 2026-09-21: the existing criteria on the group whose normalized name is `E6C Fall 2026` are cleared once, using a persisted maintenance marker. The group itself, its roster, and other group data remain intact. Recreated criteria are not cleared again.
