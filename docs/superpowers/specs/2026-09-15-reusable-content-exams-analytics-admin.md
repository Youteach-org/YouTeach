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

## 6. Exam Question Bank

First functional version implemented on `main` on 2026-09-16.

The existing Exam assignment type is now connected to a reusable Question Bank.

### 6.1 Bank item model

A question bank item should support:
- unique question ID;
- course/subject;
- unit;
- topic;
- subtopic;
- question type;
- prompt;
- answer options when applicable;
- correct answer / answer key;
- teacher explanation or rationale (optional);
- point value or weighting metadata;
- difficulty metadata (teacher-defined initially);
- tags;
- source/reference notes (optional);
- active/archived status;
- created/updated timestamps;
- historical usage count;
- historical performance statistics.

### 6.2 Initial supported question types

At minimum:
- multiple choice;
- true/false;
- matching/correspondence;
- open response.

Architecture must remain extensible for future types.

### 6.3 Question history

Using the same bank item in multiple exams should preserve one reusable source item plus per-exam snapshots/version references sufficient to protect historical exams from later edits.

Historical performance may include:
- percentage correct;
- blank-response rate;
- common distractor selection;
- average open-response score;
- use count;
- course/topic association.

## 7. Exam Creator

First functional version implemented on `main` on 2026-09-16.

A new main section **Exam Creator** uses the canonical `exam-schema.js` contract.

Implemented capabilities:
- create an exam template;
- pull questions from Question Bank;
- filter bank items;
- allow manual selection;
- organize questions into sections;
- preserve teacher-defined order;
- assign section/question point values;
- support versions such as A/B;
- generate an exact answer key for each version from the same version builder;
- save the result as a reusable exam template under `examTemplates`;
- create a concrete exam instance for a group/date under `examInstances`;
- create a matching YouTeach `EX` assignment linked through `examTemplateId`, `examInstanceId`, and `examVersion`;
- freeze question snapshots inside templates/instances so later Question Bank edits do not rewrite historical exam versions.

Current A/B behavior:
- Version A preserves teacher-defined section/question order.
- Version B defaults to reversing question order within each section.
- The answer key is rebuilt from the same reordered version, so numbering and correct answers cannot diverge.
- The teacher can choose Version B to keep the same order instead.

Future intelligent functions:
- suggest questions based on course/topic coverage;
- balance question types;
- balance teacher-defined difficulty;
- avoid recently reused questions if requested;
- select questions using historical item statistics.

No intelligent selection should silently modify the teacher's final exam.

## 8. Answer Sheet Creator

First functional version implemented on `main` on 2026-09-16.

The new **Answer Sheet Creator** consumes the exact template/version schema from Exam Creator.

It generates:
- student answer sheet;
- teacher answer key.

Requirements:
- numbering exactly matches selected exam version;
- response areas adapt to question type;
- section structure is preserved;
- changing the exam before lock allows regeneration;
- once an exam instance has been used, historical answer sheets/keys remain tied to that version.

The system does not maintain an independent manually duplicated answer key data source.

Current output:
- responsive browser preview;
- print-ready student answer sheet;
- print-ready teacher answer key;
- browser **Print / Save PDF** workflow;
- multiple-choice bubbles;
- True/False controls;
- matching response lines;
- configurable open-response lines.

Canonical shared module:
- `exam-schema.js` owns question normalization, template normalization, question snapshots, A/B version construction, answer-key derivation, and Exam Instance snapshots.

Firebase nodes introduced:
- `examQuestionBank`
- `examTemplates`
- `examInstances`

Current limitations / next extensions:
- generated exam question paper itself is still a browser/schema workflow rather than a dedicated downloadable DOCX/PDF renderer;
- Exam Creator does not yet perform automatic difficulty balancing or analytics-driven selection;
- Answer Sheet Creator does not yet use fixed response coordinates for automatic grading/annotation;
- future Exam Creator/Answer Sheet Creator region metadata should integrate with the implemented exam annotation workflow.

## 9. Exam reuse lifecycle

Separate:
- Question Bank item;
- Exam Template;
- Exam Instance.

Question Bank item:
reusable source question.

Exam Template:
reusable structured exam composition.

Exam Instance:
specific use with date/group/version and eventually student results.

This separation allows:
- reusing the same exam next semester;
- generating a new version;
- preserving past statistics;
- avoiding contamination between cohorts.

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
- Question Bank;
- Exam Templates;
- Exam Instances;
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
- Exam Creator
- Question Bank
- Answer Sheet Creator
- Points / Export
- History

Admin:
- Admin Dashboard
- Accounts / Roles
- Students
- Groups
- Courses
- Assignment Library / Instances
- Question Bank
- Exams
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
7. build Question Bank;
8. build Exam Creator;
9. build Answer Sheet Creator;
10. build Administration;
11. build advanced course intelligence / Program Builder.

## 13. Continuity rule

This specification is part of the canonical project record.

Future ChatGPT instances should preserve these distinctions:
- Template != Instance
- Question Bank Item != Exam Template != Exam Instance
- historical student data never copies into reused content
- analytics accumulate from historical instances
- Exam Creator and Answer Sheet Creator share one exam schema
- Admin is a separate role-aware section
