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

This supersedes any earlier UI wording that made templates part of the primary Create Assignment flow.

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
- Do not show **Save Template**, **Load Template**, a template selector, or **Start from scratch** inside the normal Create Assignment flow.
- Template infrastructure may remain in the data model/library for later reuse, but it must not dominate or clutter Create Assignment unless the teacher explicitly enters a template/library workflow.
- Evaluation criteria are a required visible section of Create Assignment, not hidden behind a collapsed control.
- Criteria retain the approved model: preset + custom criteria, exactly 100 total points, equal or manual distribution.
- Instructions for ChatGPT are teacher-only grading/review instructions and remain separate from student instructions.
- If a specific working group already exists in YouTeach context, Create Assignment uses and displays that group by default and does not make the teacher select it again.
- If no specific working group exists, the Group control is available so the teacher can choose the target.
- When opened from Team Generator, the generated-team target further scopes the assignment to All Generated Teams or one generated team; All Generated Teams means only students in those generated teams.


### Create Assignment popup architecture — 2026-09-20

- **Create Assignment is a reusable popup module, not the Teacher Assignments page inside a modal.**
- Both the Teacher Assignments page and Buzzer/Team Generator open the same dedicated module.
- The popup loads `assignment-create-module.html` and contains only the Create Assignment workflow.
- It must not include Assignment Browser, Assignment Library, assignment detail/submissions, grading panels, or the rest of `teacher-assignments.html`.
- The normal Assignments page remains behind the modal and refreshes through the existing Firebase listeners after a new assignment is created.
- Buzzer passes generated-team context into the same module; the Assignments page opens it with normal working-group context.
- Closing the popup returns the teacher to the screen from which it was opened.

## 4. Accepted Teacher Assignments UX

- Assignment cards are compact, not full-page rows.
- Desktop aims to show multiple assignment cards at once.
- Assignment browser supports compact filtering/navigation.
- Create Assignment is hidden until requested from Actions.
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
