# Handoff — Live COG Session Bridge final integration checkpoint

Date: 2026-09-23

## Repositories

- YouTeach: `Youteach-org/YouTeach`
  - integration branch: `live-cog-20260922`
  - verified implementation checkpoint: `832c389dbd95422f511552a3f1c931f13609c281`
  - verification run: `35828301309` — **230/230 GREEN**, server/client syntax GREEN, Pages build GREEN
  - browser E2E run: `35828301497` — **GREEN**
- Classroom Online Games: `Youteach-org/Classroom-Online-Games`
  - integration branch: `live-cog-20260922`
  - verified implementation checkpoint: `a3f2d9e24d948c305346397b86460bbb34e05e71`
  - verification run: `35828254105` — runner-probe, syntax, shared bridge, Verb Runner, 100 Students Said, Support Meter, OSASCOMP and build all GREEN
  - preview deploy run: `35828254080` — GREEN

## Verified end-to-end behavior

The browser smoke on YouTeach run `35828301497` verified the complete Verb Runner bridge:

1. teacher login;
2. active working group `FANTASMA`;
3. Smart Teams from all 20 existing Ghost memberships;
4. COG assignment creation from the shared Assignments flow;
5. signed teacher launch to the matching COG preview;
6. Verb Runner live session registration into `session/current.connectedGame`;
7. `GHOST20 / FAKE-20` login through Student Buzzer;
8. dynamic JOIN GAME visibility only after live session start;
9. canonical YouTeach identity in COG;
10. student heartbeat;
11. idempotent result receipt and duplicate retry;
12. Teacher Assignments displays game result history rather than PDF/automatic grade;
13. explicit END ACTIVITY closes the live session.

Support Meter, OSASCOMP, and 100 Students Said remain verified by their dedicated automated suites and the shared bridge contract. The 90-second stale-presence and 60-minute zero-presence expiry rules are verified by automated policy tests.

## Current architecture

- Firebase Realtime Database remains the canonical YouTeach live-state architecture.
- Do **not** revive the abandoned KV/session-store design.
- A live COG launch originates from a `COG` assignment created from the shared Assignments flow.
- Student eligibility uses current multi-group membership; the active Buzzer group may be a secondary membership.
- The signed student bridge carries the active Buzzer group without rewriting the student's primary `groupName`.
- Verified game receipts are stored at:
  `assignmentSubmissions/{assignmentId}/{studentKey}/cogResults/{resultId}`
- Receipt retries are idempotent by result id.
- COG receipts are results/history, not PDF submissions and not automatic assignment grades.
- Root browser `.mjs` files required by the live bridge must be included in the Pages build.
- Cross-repository preview testing uses the same short branch name in both repositories so Cloudflare aliases align.

## Task status

- Task 15 — cross-repository contract: COMPLETE.
- Task 16 — browser E2E: COMPLETE.
- Task 17 — final documentation / PR / production merge and production verification: READY.

## Next action

Create PRs from `live-cog-20260922` to `main` in both repositories. Confirm required checks on the exact PR heads. Merge only after those checks remain GREEN, then verify the production Cloudflare deploys for the resulting `main` commits.
