# Secure COG assignment launch contract

Date: 2026-09-19

## Scope

This specification extends the YouTeach ↔ Classroom Online Games boundary for evaluable assignments.

YouTeach remains the source of student identity, assignment targeting, due dates, assignment points, minimum-performance policy, and official submission state.

Classroom Online Games remains a separate repository and owns gameplay.

## Security boundary

Firebase Realtime Database paths used by current Classroom Online Games gameplay are not an authorization boundary. In particular, Verb Runner launch/gameplay state may be publicly readable/writable under the current game rules.

Therefore:

- no official YouTeach grade may be accepted solely because a browser wrote a score or result into Firebase;
- no public Firebase launch token may by itself authorize an official submission;
- YouTeach must validate the student and assignment on the server before issuing a launch;
- official result submission will require a later server-validated receipt flow.

## Student authentication for COG launch

YouTeach will issue a short-lived signed student session after successful password authentication.

The browser may store that signed session credential, but cannot mint or alter it.

COG launch requests must present the signed YouTeach student session. The server re-validates:

- session signature and expiry;
- student identity;
- assignment existence;
- assignment type = COG;
- assigned group;
- certified game;
- assigned mode and difficulty.

If the signed student session is missing or expired, the student must sign in again.

The signing secret must live in the Cloudflare Pages environment as `YOUTEACH_SESSION_SECRET`. It must never be committed to GitHub.

## Practice launch contract

The current phase is practice-only.

YouTeach may write an ephemeral Verb Runner launch record containing:

- student key;
- game id;
- assignment id and code;
- COG mode;
- COG difficulty;
- optional minimum percent;
- assignment point value;
- contract version;
- `purpose: "assignment-practice"`;
- `officialSubmissionAllowed: false`;
- created/expiry timestamps;
- one-time-use state.

Verb Runner must consume the token once and lock the assigned race/mode and difficulty for that launched run.

The game must not treat the token or its Firebase result as an official YouTeach submission.

## Mode mapping for Verb Runner

- `verb` → Verb Runner / level 1
- `sentence` → Sentence Runner / level 2
- `time-clues` → Time Clues / level 3
- `perfect-race` → Perfect Running / level 4
- `final-race` → Final Race / level 5

Difficulty ids remain `easy`, `medium`, and `hard`.

## Persistence

Only identity fields may persist as the student's remembered YouTeach identity inside Verb Runner.

Assignment launch context must not persist into later free-mode runs.

## Authentication hardening prerequisite for official grading

The signed YouTeach session prevents a browser from inventing or altering its own session payload, but it does not by itself solve the legacy credential-storage model.

The current legacy student records may expose password fields through client-readable Firebase data because the old browser login read the student collection directly.

Therefore, before any COG result can become an official grade:

- student credential material must no longer be readable from public/client Firebase paths;
- the server-side login verifier must use a credential source that the browser cannot enumerate;
- production Firebase rules and the credential migration must be validated;
- official COG receipt validation must depend on that hardened identity boundary.

Until those conditions are met, the signed session may be used for practice launch continuity but is not sufficient authority for an official grade.

## Official submission — intentionally pending

A later phase will add:

1. a server-authoritative result/receipt endpoint;
2. result validation against the issued assignment launch contract;
3. Send to teacher;
4. receipt persistence and verification;
5. proportional point conversion;
6. resubmission/Undo Submission handling;
7. teacher-side official result display.

Until that phase is complete, COG assignment launches remain practice-only and must not create official grades.
