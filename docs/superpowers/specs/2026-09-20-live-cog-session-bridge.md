# Live Classroom Online Games session bridge

Date: 2026-09-20

This specification is mirrored in both `youteachtk/YouTeach` and `youteachtk/Classroom-Online-Games`. It defines the canonical live-session contract between YouTeach Buzzer and Classroom Online Games (COG).

## Purpose

A student must not browse directly from the YouTeach menu into Verb Runner or any other Classroom Online Game.

Live game access is teacher-controlled and group-scoped:

1. the teacher works from YouTeach Buzzer with a selected group and active YouTeach session;
2. the teacher opens Classroom Online Games from Buzzer using a temporary YouTeach-issued teacher credential;
3. the teacher selects a game in COG;
4. selecting/opening a game does not yet expose it to students;
5. the COG game becomes available to students only when the teacher creates/starts that game's live session;
6. only students in the Buzzer group associated with that live session see the game entry in Student Buzzer;
7. the student's YouTeach identity follows them into the game;
8. completed game results return automatically to YouTeach under that verified identity.

## Repository boundary

YouTeach and Classroom Online Games remain separate repositories and applications.

YouTeach is authoritative for:
- teacher identity;
- student identity;
- student group;
- current Buzzer group/session context;
- which live COG activity is exposed to a group;
- the YouTeach-side result record associated with a student.

COG is authoritative for:
- game selection and configuration;
- its own live game session;
- gameplay state;
- game-specific metrics and completion events.

Cross-application trust must use explicit short-lived credentials and server validation. Passwords and raw mutable identity fields must not be passed in query parameters.

## Teacher launch flow

### 1. Open COG from YouTeach Buzzer

The teacher must have:
- a valid authenticated YouTeach teacher session;
- an active YouTeach Buzzer session;
- a selected/current group.

When the teacher presses the Classroom Online Games control in Buzzer, YouTeach issues a short-lived teacher launch credential bound to:
- teacher identity;
- YouTeach session id/context;
- selected group;
- issue and expiry times;
- a random nonce;
- purpose `cog-live-teacher`.

COG resolves that credential against YouTeach. The credential does not expose a password.

### 2. Select a game

The teacher can browse/select games after COG has resolved the YouTeach teacher context.

Merely opening a game monitor or configuration page must not create a student-visible launch.

### 3. Create/start the game session

The student-visible activity begins only when the teacher explicitly creates/starts a session inside the selected game.

COG then creates a live game session id and registers that session with YouTeach. The registration includes at minimum:
- `gameId`;
- `gameName`;
- `cogSessionId`;
- `groupName`;
- `status: "active"`;
- `startedAt`;
- `teacherPresenceAt`;
- `launchMode: "live-buzzer"`.

YouTeach stores the active bridge under the current Buzzer session as `connectedGame` or an equivalent canonical live-game field.

There may be only one current student-facing connected game per Buzzer session unless a later specification explicitly allows multiple simultaneous games.

## Student Buzzer behavior

There are no permanent direct game links in the Student menu.

In particular:
- remove the permanent Verb Runner launcher from the Student sidebar;
- do not add permanent Support Meter, 100 Students Said, or other COG launchers there.

Student Buzzer observes the current YouTeach live-game bridge.

A game access card/button is shown only when all of the following are true:
- a connected game exists;
- its status is `active`;
- it belongs to the student's current group;
- the live activity has not expired.

The card should identify the active game and provide an action such as `JOIN GAME` / `RETURN TO GAME`.

If the student is in another group, no game card is shown.

If the live activity ends, the card disappears.

## Student launch and identity

Each time an eligible student enters or re-enters the active game, YouTeach issues a short-lived one-time or tightly scoped student launch credential bound to:
- `studentKey`;
- canonical student identity;
- group;
- `gameId`;
- `cogSessionId`;
- current YouTeach/Buzzer session;
- issue and expiry times;
- nonce;
- purpose `cog-live-student`.

COG resolves this credential against YouTeach and uses the returned canonical identity.

The game must display the student's YouTeach name/nickname instead of inventing an unrelated local identity.

Local runner/device ids may still exist internally for rendering or connection bookkeeping, but they do not replace the YouTeach student identity.

A student may leave the game and later re-enter while the live activity remains active. Re-entry creates/resolves a fresh credential. Re-entry must not require the teacher to recreate the COG session.

Game-specific progress-resume behavior may vary by game, but access remains available for the full live-session lifetime.

## Live-session lifetime

Closing a browser tab, navigating away, a temporary network loss, or the teacher leaving the monitor does not end the activity.

Teacher and student clients maintain presence heartbeats while connected.

The live activity ends in either of two ways:

### Explicit end

The teacher deliberately chooses `END ACTIVITY` / `END SESSION` in the COG teacher interface.

Because accidental closure is disruptive, the explicit end action must require confirmation.

After confirmed explicit end:
- the COG session is marked ended/closed;
- YouTeach's connected game is marked ended or cleared;
- Student Buzzer removes the game access card for that group;
- no new student launch credentials are issued for that ended live session.

### Automatic inactivity expiry

A session must not remain live forever after everybody leaves.

A live activity automatically expires after **60 continuous minutes with no teacher presence and no student presence**.

Implementation semantics:
- when the last connected teacher/student presence disappears, record `noPresenceSince`;
- if any teacher or student returns before 60 minutes, clear/reset `noPresenceSince`;
- expire only when `noPresenceSince + 60 minutes` is reached while presence remains empty;
- browser close/disconnect itself is therefore not an immediate end.

The 60-minute value is the canonical default for this live-session bridge.

## Automatic result return

Live-session results are returned to YouTeach automatically. The student does not need a generic `Send to teacher` button for live Buzzer-launched sessions.

Each game emits a normalized result envelope when an attempt/result becomes reportable. The envelope includes:
- verified `studentKey`;
- `gameId`;
- `cogSessionId`;
- unique `attemptId` or result id;
- completion timestamp;
- game-specific result type;
- percentage when the game produces a percentage;
- points when the game produces points;
- structured game-specific statistics needed for teacher review/analytics.

YouTeach validates that:
- the student identity is valid;
- the live game session exists;
- the game id matches;
- the student belongs to the session group;
- the result id has not already been accepted.

Result writes must be idempotent so reconnects/retries cannot duplicate points or submissions.

YouTeach preserves attempt/result history. A later game-specific policy may decide whether the UI emphasizes latest attempt, best attempt, cumulative points, or another aggregate; this bridge must not silently discard prior attempts.

## Relationship to COG assignments

This live Buzzer flow is distinct from an assigned COG task.

Both may reuse secure identity, launch-token, result-validation, and receipt infrastructure, but their lifecycle is different:

- **Live Buzzer game:** teacher starts a live COG session; Student Buzzer exposes it temporarily to the selected group; results return automatically.
- **COG Assignment:** an assigned instance has its own due date, submission policy, points, minimum performance, retry/undo rules, and assignment record.

Do not make the live-session implementation depend on creating a YouTeach Assignment.

## Compatibility with existing work

Existing useful secure-integration work should be reused rather than duplicated:
- signed teacher/student session infrastructure in YouTeach;
- secure launch resolution patterns;
- server-authoritative result validation;
- Verb Runner YouTeach identity mapping;
- idempotent result/receipt concepts.

The existing permanent Student Buzzer Verb Runner launcher is provisional and contradicts this specification. It must be removed during implementation.

The existing 100 Students Said integration is partial: it currently connects to YouTeach too early, when the teacher enters the monitor. Under this specification, student exposure must begin only when the teacher actually starts the game session.

## Acceptance criteria

The implementation is accepted when all of the following are true:

1. No COG game is permanently accessible from the Student menu.
2. Teacher opens COG from an authenticated Buzzer session and COG receives the selected group through a verified teacher launch.
3. Browsing/selecting a game does not expose it to students.
4. Starting a game session makes exactly that game visible in Student Buzzer for exactly that group.
5. Students in other groups do not see the activity.
6. Entering/re-entering the game shows the verified YouTeach student identity.
7. Closing teacher/student browser tabs does not immediately remove the game.
8. The teacher can explicitly end the activity with confirmation.
9. After explicit end, the Student Buzzer game access disappears.
10. With no teacher and no students present, the session expires only after 60 continuous minutes of zero presence.
11. Any teacher/student return during that hour resets the inactivity countdown.
12. Completed live-game results return automatically to YouTeach and are attached to the correct student/session.
13. Retries/reconnects cannot duplicate an accepted result.
14. Existing COG Assignment behavior remains a separate lifecycle.
