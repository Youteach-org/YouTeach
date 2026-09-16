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
- Task type provides the prefix, e.g. CT, HW, EX, PJ, PC, RS, PT.
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

## 11. Exam ecosystem: question bank, Exam Creator, Answer Sheet Creator

Priority 5 after the current assignment grading loop and core lifecycle are stable.

The existing **Exam** assignment type becomes the entry point for a reusable assessment ecosystem.

### 11.1 Question Bank

Exam questions should be stored as reusable bank items rather than existing only inside one exam.

Each question bank item should be able to store:
- subject/course;
- unit/topic/subtopic;
- question type;
- prompt;
- answer options where applicable;
- correct answer / answer key;
- points or weighting metadata;
- difficulty metadata where teacher-defined;
- source/notes when the teacher chooses to store them;
- status such as active/archived;
- usage history;
- performance statistics when the question has been used.

Question types should be extensible and include at least the types already used by the teacher, such as:
- multiple choice;
- true/false;
- matching/correspondence;
- open response.

### 11.2 Exam Creator

Create a new main section named **Exam Creator**.

Exam Creator should:
- build a new exam from Question Bank items;
- filter questions by course, unit, topic, type, and other supported metadata;
- allow manual selection and later intelligent/statistical selection;
- support reusable exam templates;
- support generating new exam instances from an existing template;
- support Versions A/B and other versions later;
- preserve the teacher's selected order and section structure;
- create an answer key tied to the exact exam version;
- eventually support analysis of question performance after grading.

An exam template must be separate from an exam administration/assigned instance, for the same reason Assignment Templates are separate from student submissions.

### 11.3 Answer Sheet Creator

Create a companion main section named **Answer Sheet Creator**.

Answer Sheet Creator should:
- generate a student answer sheet from the exact structure of a selected exam/version;
- generate a teacher answer key;
- stay synchronized with question numbering and sections;
- support the teacher's established answer-sheet formatting rules;
- support different response areas depending on question type;
- allow regeneration if an exam is changed before it is locked/used.

Long-term direction:
- Exam Creator + Answer Sheet Creator should reuse the same exam schema, not maintain two independent copies of question numbering/answers.

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
- exam templates;
- question banks;
- exam instances;
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

Next action is:
**run and fix the complete AI grading round-trip on one real task until it works end-to-end.**

After that:
1. finish the simplified AI-grade -> teacher review -> publish workflow;
2. strengthen AI grading prompts and grading ledger/idempotency;
3. add student-side expanded assignment details and published grades;
4. cross-device UI verification;
5. add Project progress checkpoints with photo/video/document evidence;
6. assignment lifecycle + reusable Assignment Library;
7. course/topic analytics foundation;
8. Question Bank foundation;
9. Exam Creator + annotated grading outputs;
10. Answer Sheet Creator;
11. Administration section;
12. authentication hardening;
13. deployment cleanup.
