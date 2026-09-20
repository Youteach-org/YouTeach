# YouTeach ↔ Classroom Online Games secure integration — current-state handoff

Date: 2026-09-20  
Status: active integration work  
Source of truth: GitHub, not chat memory

## Purpose

This file is the current handoff for the YouTeach ↔ Classroom Online Games secure assignment/results work.

A future ChatGPT/Codex/Superpowers instance should be able to continue from this file without access to the conversation that produced it.

## Repositories and active PRs

### YouTeach
- Repository: `youteachtk/YouTeach`
- Active branch: `feature/cog-youteach-secure-current-20260920`
- PR: #11 — secure COG assignments + hardened auth on current `main`
- Base: `main`
- Production deploy remains GitHub -> Cloudflare Pages.

### Classroom Online Games
- Repository: `youteachtk/Classroom-Online-Games`
- Active branch: `feature/cog-youteach-secure-current-20260919`
- PR: #41 — secure YouTeach official COG integration on current `main`
- Base: `main`

Do not merge either PR merely because the code checks are green. Production auth infrastructure is still gated below.

## What is already implemented

### Secure YouTeach student/teacher identity
On the YouTeach integration branch:
- server-issued signed student sessions;
- server-issued signed teacher/admin sessions;
- PBKDF2-SHA256 password hashing;
- server-only credential-store abstraction using Cloudflare KV binding `YOUTEACH_AUTH`;
- student login endpoint;
- teacher login endpoint;
- student password-change endpoint;
- teacher-protected student enrollment/import endpoint;
- bootstrap/admin credential provisioning endpoint;
- migration-status endpoint;
- controlled bulk student credential migration endpoint;
- client pages changed so authentication is no longer meant to rely on plaintext Firebase passwords or browser-auth flags after cutover.

### Secure COG assignment launch
Implemented across the two integration branches:
- YouTeach validates signed student identity and canonical assignment;
- YouTeach issues signed assignment launch context;
- Verb Runner resolves that context back against YouTeach;
- assigned game mode and difficulty are locked for the run;
- assignment context is not treated as a public Firebase authorization boundary;
- legacy free-mode/normal launch remains separate.

### Official COG result flow
Implemented on integration branches:
- `Send to teacher`;
- server-authoritative result submission;
- result/status/undo endpoints;
- private receipt storage;
- result validation against assignment launch contract;
- proportional assignment-point conversion;
- student result state;
- teacher-side official result display;
- resubmission / Undo Submission handling.

Official results must remain disabled until the production authentication cutover gate is satisfied.

## Verification status

At the last verified integration point:
- YouTeach auth-hardening suite: green;
- YouTeach COG-official-results suite: green;
- YouTeach full regression/build/preview smoke: green before the later infrastructure experiments;
- Classroom Online Games secure-integration verification: green;
- Classroom Online Games Cloudflare Pages workflow: green.

Later RED→GREEN work added a controlled bulk student migration endpoint and a non-destructive preview mode. The auth and COG suites passed after that implementation.

Do not claim a current head is green without checking the current GitHub Actions runs first; newer commits may have been added after this handoff.

## Authentication migration decisions

### Credential storage
Target credential storage is Cloudflare Workers KV, binding name:

`YOUTEACH_AUTH`

The intended configuration uses two distinct KV namespaces:
- one for production;
- one for preview/testing.

Preview credentials must never be allowed to contaminate production credentials.

### Production feature gates
Official production activation is staged.

First:
`YOUTEACH_AUTH_HARDENED=true`

Only after authentication cutover is validated:
`YOUTEACH_COG_OFFICIAL_RESULTS_ENABLED=true`

Do not enable official COG results before auth hardening is proven in production.

### Bulk migration behavior
The controlled student migration endpoint supports:
- destructive production migration: securely store credential in KV first, then remove the public Firebase password field;
- non-destructive preview copy: copy credential into preview KV while leaving Firebase password fields untouched.

The order is security-critical:
1. create/verify secure KV credential;
2. only then remove the legacy public password field.

Never delete a legacy password first.

## Current infrastructure blocker

The GitHub Actions Cloudflare token can deploy Pages but, at the last attempt, Cloudflare returned HTTP 401 when the workflow tried to list/create Workers KV namespaces.

Required token capability:
- Account -> Workers KV Storage -> Edit

A manual-only workflow exists on the integration branch:

`.github/workflows/auth-infra-provision.yml`

It is intentionally not auto-triggered now. It should be run only after the Cloudflare token has the required KV permission.

Do not work around this by committing KV secrets, namespace credentials, plaintext passwords, or Cloudflare secrets to GitHub.

## Teacher/admin credentials

Legacy teacher/admin credentials currently exist in old shipped client code on production `main`.

The hardened target must move teacher/admin credentials to the server-only KV store and remove shipped literal credentials from the production client.

Do not copy or expose plaintext teacher/admin credentials in:
- GitHub documentation;
- issue comments;
- workflow logs;
- artifacts;
- chat-visible handoff text.

Provision them only through the protected bootstrap path or another server-safe method.

## Ghost Test Lab — critical distinction

The Ghost Test Lab is a teacher-side simulator. It is not equivalent to 20 real student login sessions.

Canonical Ghost identity on current `main`:
- group: `FANTASMA`;
- external IDs / student numbers: `GHOST01` through `GHOST20`;
- nicknames: `FAKE-01` through `FAKE-20`.

The Ghost Test Lab:
- discovers existing FANTASMA accounts;
- does not create duplicate test students;
- can mark simulated presence online/offline;
- can simulate buzzer presses;
- can submit generated test PDFs through the real assignment upload flow;
- can withdraw those submissions;
- reflects real grading/publication state.

Those simulator actions do not require 20 separate student logins.

### How Ghosts should be used for auth/COG validation

Use two complementary test paths:

1. **Mass simulation path**
   - Teacher uses Ghost Test Lab.
   - Many Ghost accounts can exercise presence, buzzer, assignment submission and grading flows.
   - This does not prove student authentication.

2. **Real-login path**
   - Use at least one Ghost account, preferably `GHOST01`, through the normal Student login.
   - That login must be verified by the hardened server-side auth path.
   - Then test:
     YouTeach task -> COG/Verb Runner -> assigned mode/difficulty -> complete run -> Send to teacher -> official result -> teacher display -> Undo Submission -> resubmit.

Do not interpret Ghost Test Lab success as proof that student login/auth is correct.

## Decision: do not migrate real students yet

Before touching real student credentials:
1. get preview KV working;
2. provision isolated preview credentials;
3. verify teacher login in preview;
4. verify at least one Ghost real student login in preview;
5. verify the full YouTeach -> COG -> result -> Undo -> resubmit cycle;
6. verify Ghost Test Lab still works for mass simulation;
7. only then prepare production credential migration.

Do not delete or mass-migrate real student Firebase password fields during preview testing.

## Recommended production rollout order

After preview validation:

1. Provision production KV and teacher/admin credentials.
2. Confirm production teacher/admin login against server auth.
3. Run controlled student credential migration.
4. Check migration status until:
   - pending = 0;
   - public credential fields = 0;
   - readyForCredentialCutover = true.
5. Enable `YOUTEACH_AUTH_HARDENED=true`.
6. Re-test teacher login, student login, enrollment/import and password change.
7. Merge/deploy the Classroom Online Games secure integration.
8. Merge/deploy the YouTeach secure integration.
9. Run Ghost real-login + Ghost Test Lab regression.
10. Enable `YOUTEACH_COG_OFFICIAL_RESULTS_ENABLED=true`.
11. Run a final official-result test before using the feature with real students.

## Merge rule

Do not merge because a previous chat said "ready".

Before each merge:
- inspect current PR head;
- inspect current `main`;
- confirm PR is mergeable;
- run/read fresh CI on that exact head;
- verify the Cloudflare environment/bindings required by that head;
- verify the paired repository is compatible.

## Continuity rule

Every material decision made while continuing this work must be written back to GitHub before ending the work session.

If a new instance is asked "continue YouTeach/COG", it should:
1. read `docs/superpowers/README.md`;
2. read this handoff;
3. read the auth, secure COG, and Ghost specs;
4. inspect PR #11 and PR #41;
5. inspect the latest Actions runs;
6. continue from the first unresolved gate above rather than recreating already-completed work.
