# Reusable Learning Content, Exams, Analytics, and Administration

Date: 2026-09-15
Repository: youteachtk/YouTeach
Status: accepted direction / design specification

## 1. Purpose

YouTeach should evolve from a task-delivery tool into a reusable teaching system.

The same teacher may teach the same subject/course repeatedly across semesters or groups. Assignments, exams, and questions should therefore be reusable academic assets rather than disposable one-time records.

Historical use of those assets should also become a source of course intelligence: topic performance, recurring weak areas, activity effectiveness, and evidence that can later help the teacher build or refine a course program from real class statistics.

## 2. Core separation: reusable template vs assigned instance

This distinction is foundational and must be preserved across assignments and exams.

### 2.1 Reusable template
A template contains content intended to be reused.

Examples:
- assignment title;
- assignment type;
- instructions;
- grading criteria;
- teacher-only grading notes;
- subject/course;
- unit/topic/subtopic metadata;
- reusable resources;
- question selections for an exam template.

Templates do NOT contain:
- student submissions;
- student grades;
- due date tied to one class run;
- one group's participation state.

### 2.2 Assigned instance
An instance is a concrete use of a template with a class/group at a specific time.

Examples:
- Task Code;
- group;
- due date;
- open/closed state;
- student submissions;
- grading results;
- grade release;
- late-submission exceptions;
- historical statistics.

Reusing a template creates a new instance. It must never copy prior student evidence or grades.

### UI clarification — 2026-09-20

The Template vs Assigned Instance architecture remains approved, but template controls are not part of the normal Create Assignment form. The primary creation form must stay focused on the assigned instance. Library/template management is a separate workflow and must not displace assignment type, name, group/target, due date, student instructions, visible criteria, or teacher-only ChatGPT review instructions.

## 3. Assignment Library

Add a reusable Assignment Library concept.

Capabilities:
- save an assignment as a reusable template;
- create a new assigned instance from a template;
- edit a template without rewriting historical instances already used;
- archive templates without deleting history;
- filter/search by:
  - course;
  - subject;
  - unit;
  - topic;
  - type;
  - tags;
  - historical usage;
- show how many times a template has been used;
- show summary performance from past instances without exposing old student work inside a new instance.

Future optional capability:
- duplicate a template to create a variant while preserving the original.


### 3.1 Foundation implementation status — 2026-09-16

Foundation merged into `main`; management extension implemented on `feature/assignment-library-management`, pending merge:
- `assignment-library-model.js` defines the pure reusable-content boundary;
- reusable content is copied through an explicit allowlist rather than copying the whole assigned instance;
- Task Code, group, due date, active state, submissions, grades, grade-publication state, and other run-specific data are not part of template content;
- reusable Project checkpoint content keeps title/instructions/evidence types while absolute run-specific checkpoint dates are excluded;
- `buildAssignmentTemplateRecord(...)` creates a schema-versioned reusable template record;
- `buildAssignedInstanceFromTemplate(...)` creates a clean runtime assignment payload compatible with the existing `assignments` node;
- each new instance carries `templateId`, `templateVersion`, and a deep-cloned `templateSnapshot` so later template edits cannot rewrite historical instances;
- reusable templates persist under `assignmentTemplates/{templateId}` in Firebase;
- the existing Teacher Assignments page can save the selected assignment as a reusable template;
- the existing Create Assignment form can load a saved template without importing group or due date;
- creating from a loaded template writes the new `assignments/{assignmentId}` instance and template usage metadata atomically with one Firebase multi-location update;
- Project checkpoint template rows reload without old review dates so the new run requires new dates.

Management extension implemented on the feature branch:
- dedicated Assignment Library panel inside Teacher Assignments;
- text search across title/type/course/subject/unit/topic/subtopic/tags;
- filters for type, course, subject, unit, topic, tags, usage, and archive status;
- active templates can be loaded or archived;
- archived templates can be restored;
- archive/restore changes metadata only and does not rewrite historical assigned instances;
- historical usage count is visible on each template card.

Still deferred:
- editing an existing template as a first-class library workflow;
- template duplication/variants;
- aggregate performance statistics beyond the current usage counter.

Current continuation:
1. merge/field-test the management extension;
2. preserve current Teacher Assignments grading/submission workflows unchanged;
3. then continue with course/unit/topic/subtopic metadata and analytics.

## 4. Course/topic analytics foundation

Every reusable academic item should be taggable to the teacher's course structure.

Recommended hierarchy:
- Course / Subject
- Unit
- Topic
- Subtopic (optional)

Historical assigned instances should provide analyzable metrics such as:
- number assigned;
- number submitted;
- completion percentage;
- mean/median grade;
- score distribution;
- criterion-level performance;
- topic-level performance;
- missing-work frequency;
- question-level performance for exams;
- reuse frequency;
- group/cohort comparison;
- changes over time.

This data should later support a Course Intelligence section that can answer questions such as:
- Which topics are consistently weakest?
- Which topics need the most reinforcement?
- Which activity worked better for the same topic?
- Which criteria are repeatedly weak?
- Which exam questions discriminate well or poorly?
- How much practice has historically been needed for a topic?

## 5. Teacher-created course program from statistics

Long-term feature: Program Builder / Course Planner.

It should use the teacher's own historical YouTeach data to help draft a course program.

Potential inputs:
- course topics;
- past assignment/exam history;
- performance by topic;
- completion patterns;
- time/sequence metadata where available;
- teacher-selected priorities.

Potential output:
- suggested topic sequence;
- reinforcement points;
- recommended reusable assignments;
- candidate exam-bank items;
- suggested pacing based on historical class data.

Important:
- this is assistance, not automatic curriculum replacement;
- the teacher remains the final editor;
- recommendations should distinguish measured historical evidence from AI inference.

## 6. Exam Bank — approved scope 2026-09-16

The previously proposed internal Question Bank, Exam Creator, Exam Template/Instance workflow, and Answer Sheet Creator are **not part of the approved scope**.

The approved exam feature is a simple **Exam Bank** whose purpose is to preserve and retrieve existing exam files.

### 6.1 Core behavior

- Exams are added **manually only**.
- One uploaded file equals one independent Exam Bank entry.
- YouTeach stores the **original file unchanged**.
- YouTeach does **not** parse the file into questions or sections.
- YouTeach does **not** extract or maintain a reusable internal Question Bank.
- YouTeach does **not** generate, rearrange, combine, or rewrite exams.
- YouTeach does **not** provide an internal Exam Creator.
- YouTeach does **not** provide internal AI for exam creation.
- YouTeach does **not** provide an internal "use as base for a new exam" workflow.
- The Exam Bank is a repository for upload, classification, search/filter, retrieval, and download.

### 6.2 Metadata

Each manually uploaded Exam Bank entry stores:
- title;
- subject/course;
- unit/topic;
- exam type;
- date;
- version (for example A/B when applicable);
- free-form tags;
- original file reference;
- created/updated timestamps as required by implementation.

File-format details and secondary UX choices remain implementation details and are not product requirements yet.

### 6.3 External AI boundary

Any AI that reads prior exams, rearranges content, or creates a new exam is **external to YouTeach's Exam Bank**.

The Exam Bank's responsibility is only to preserve and expose the manually uploaded source files and their metadata. Any future external-AI integration must be designed separately and must not cause the Exam Bank itself to infer, parse, transform, or silently generate exam content.

### 6.4 Provisional code status

Provisional Question Bank, Exam Creator, exam-schema, and Answer Sheet Creator code created before this decision is **not an approved product requirement** and must not be extended on the assumption that it represents the desired workflow.

A later implementation plan may remove, disable, or replace that provisional UI/code after the approved Exam Bank design is finalized.

## 10. Administration

Create a separate role-aware **Administration** section.

Admin should have system-wide visibility that normal Teacher pages do not.

### 10.1 Admin overview
Admin can inspect:
- teacher/admin accounts;
- students;
- groups;
- courses/subjects;
- reusable Assignment Templates;
- Assignment Instances;
- submissions;
- grading state;
- Exam Bank entries and files;
- grade-release state;
- archive state;
- integration/storage health;
- audit/history where available.

### 10.2 Admin capabilities
Planned:
- global search;
- filter across teachers/groups/courses;
- manage roles/accounts;
- archive/recover content;
- inspect data consistency;
- investigate orphaned submissions/files;
- inspect integration status;
- view system-level counts/statistics;
- view sensitive change history.

### 10.3 Safety / governance
- destructive operations require explicit confirmation;
- sensitive changes should be auditable;
- Teacher and Admin permissions must be distinct;
- normal teachers should not automatically receive global visibility.

## 11. Suggested navigation direction

Teacher:
- Home
- Students
- Groups / Import
- Assignments
- Assignment Library
- Exam Bank
- Points / Export
- History

Admin:
- Admin Dashboard
- Accounts / Roles
- Students
- Groups
- Courses
- Assignment Library / Instances
- Exam Bank
- Submissions / Grades
- System / Integrations
- Audit

Exact navigation labels remain subject to UX refinement.

## 12. Implementation order

Do not implement all modules at once.

Recommended sequence:
1. finish AI grading round-trip;
2. stabilize responsive layouts;
3. add Assignment Template / Instance data model;
4. add reusable Assignment Library;
5. add topic/course metadata;
6. establish analytics event/data schema;
7. build the manual Exam Bank;
8. build Administration;
9. build advanced course intelligence / Program Builder.

## 13. Continuity rule

This specification is part of the canonical project record.

Future ChatGPT instances should preserve these distinctions:
- Template != Instance
- the approved exam feature is the manual Exam Bank, not an internal Question Bank or Exam Creator
- one manually uploaded exam file equals one Exam Bank entry
- Exam Bank files remain original and unparsed
- external AI exam creation/rearrangement is outside the Exam Bank scope
- historical student data never copies into reused content
- analytics accumulate from historical instances
- Admin is a separate role-aware section
