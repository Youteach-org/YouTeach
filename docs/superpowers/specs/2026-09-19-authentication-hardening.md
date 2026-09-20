# YouTeach authentication hardening plan

Date: 2026-09-19

## Why this is a separate workstream

The COG assignment practice-launch work must not silently expand into a full authentication rewrite.

COG practice may continue behind its signed-session boundary, but **official COG submission/grades remain blocked until this plan is completed and field-validated**.

This work must be implemented in a separate branch/PR from COG assignment integration.

## Confirmed legacy risks

### Student credentials

Current student credential handling is client-readable and client-writable:

- `student-auth.js` historically reads the `students` collection and compares `student.password` in browser code;
- `student-settings.js` reads the student's stored password from Firebase to verify the current password, then writes the replacement password directly back to `students/{studentKey}/password`;
- `teacher-enrollment.js` creates students with `password: "1234"`;
- `migrateExistingStudentsForTeacher()` writes `student.password || "1234"` back into every migrated student record.

A signed browser session improves integrity after login, but it does not make a publicly readable password field secret.

### Teacher/admin credentials

Current teacher authentication is also browser-authoritative:

- `teacher-login.js` contains literal credentials for `teacher` and `admin` in shipped JavaScript;
- successful login writes role/name/auth flags into `sessionStorage`;
- `teacher-auth.js` treats `sessionStorage.getItem("youteachTeacherAuth") === "true"` as sufficient authorization.

Therefore a browser can inspect the shipped credentials and can also forge the local teacher-auth flag.

This is not an acceptable authorization boundary for server-side official grading, credential migration, administration, or other privileged writes.

## Required target state

Authentication must become server-authoritative.

The target design must satisfy all of the following:

1. no student or teacher password/credential secret is stored in client-readable Firebase records;
2. passwords are never committed to GitHub or embedded in shipped JavaScript;
3. login verification happens only in a server-side Function or managed identity provider;
4. the browser receives only a signed, expiring session credential;
5. privileged server endpoints verify the signed session and required role on every request;
6. student password changes require a valid signed student session plus current-password verification server-side;
7. student creation/import creates credentials through a server-authoritative path;
8. teacher/admin roles cannot be asserted by editing `sessionStorage` or `localStorage`;
9. Firebase/database rules are reviewed so removing passwords does not leave another client-writable privilege path;
10. authentication state and COG official-result receipts use compatible server-authoritative identity.

## Migration constraints

The migration must not lock out existing students or silently reset custom passwords.

Do not delete legacy credential fields until:

- the replacement verifier/store is live;
- every existing student credential has been migrated or explicitly reset;
- login has been tested for default and custom-password accounts;
- Student Settings writes through the replacement path;
- Teacher Enrollment/import creates credentials through the replacement path;
- rollback behavior is understood and tested.

Never export, log, commit, or place existing plaintext passwords in an artifact.

## Recommended implementation sequence

### Phase A — choose and provision server-only identity storage

Use a credential store that browser code cannot enumerate or write directly.

Before implementation, validate the selected production mechanism and its Cloudflare/Firebase integration. The app currently has no server-only credential-store binding declared in `wrangler.toml`, so this is an explicit infrastructure decision rather than an assumed capability.

### Phase B — student auth dual-read transition

Implement a server login path that can temporarily verify both:

- the new server-only credential representation; and
- unmigrated legacy credentials.

After a successful legacy login, migrate that student's credential using the server-only mechanism when safe.

This dual-read period is transitional only.

### Phase C — complete student migration

Provide an authenticated/admin-controlled migration path that:

- counts students before/after;
- migrates every remaining credential;
- reports records that could not be migrated;
- does not expose credential values in logs;
- removes plaintext password fields only after successful replacement.

### Phase D — enrollment and password settings

Change:

- manual enrollment;
- CSV import;
- pasted-list import;
- student password change

so password material goes directly to a server-authoritative endpoint and is never written into the public `students` record.

Remove the legacy code that repopulates `password: "1234"`.

### Phase E — teacher/admin authentication

Replace the shipped `USERS` array and local `sessionStorage` authorization with server-issued sessions and server-validated roles.

Teacher/admin privileged endpoints must reject forged local flags.

### Phase F — database/rules audit

Record the actual production Realtime Database rules in version-controlled infrastructure or documentation and verify:

- which student fields are client-readable;
- which student fields are client-writable;
- which teacher/admin paths require server authority;
- COG gameplay paths remain non-authoritative for grades.

### Phase G — enable official COG receipts

Only after Phases A–F are complete and validated may the COG assignment project enable:

- `Send to teacher`;
- server-authoritative result receipts;
- official score persistence;
- QR/receipt verification;
- proportional grade publication.

## Required tests

At minimum:

- student login succeeds with valid migrated credentials;
- invalid password fails without revealing account existence unnecessarily;
- expired/tampered student session fails;
- password change invalidates or rotates sessions as designed;
- enrollment/import never writes plaintext password into `students`;
- legacy migration preserves default and custom passwords;
- teacher/admin login contains no shipped literal credentials;
- forged browser storage does not authorize privileged endpoints;
- COG official-result endpoint rejects a practice-only session/result;
- database reads cannot retrieve password material after migration.

## Current status — updated 2026-09-20

Implementation now exists on the active integration branch `feature/cog-youteach-secure-current-20260920` and PR #11.

Implemented on that branch:
- Cloudflare KV-backed credential-store abstraction using binding `YOUTEACH_AUTH`;
- PBKDF2-SHA256 password hashing;
- signed student sessions;
- signed teacher/admin sessions;
- student login endpoint;
- teacher login endpoint;
- password-change endpoint;
- teacher-authorized student enrollment/import endpoint;
- bootstrap credential provisioning endpoint;
- migration-status endpoint;
- controlled bulk student migration endpoint;
- non-destructive preview migration mode;
- auth regression tests.

The target infrastructure decision is Cloudflare Workers KV with separate preview and production namespaces.

Current infrastructure blocker:
- the existing GitHub Cloudflare API token can deploy Pages;
- the latest provisioning attempt received HTTP 401 when accessing Workers KV;
- the token therefore needs `Account -> Workers KV Storage -> Edit` before the auth-infrastructure workflow can create/list namespaces.

A manual-only provisioning workflow is present at:
`.github/workflows/auth-infra-provision.yml`

Do not enable production auth cutover or official COG results until:
1. preview KV is provisioned;
2. teacher auth is validated in preview;
3. at least one Ghost student completes a real Student-login test;
4. the complete YouTeach -> COG -> Send to teacher -> Undo/resubmit loop is verified;
5. production KV and teacher/admin credentials are provisioned;
6. controlled real-student migration reports no pending credentials and no public password fields.

The active handoff is:
`docs/superpowers/handoffs/2026-09-20-cog-auth-current-state.md`

That handoff supersedes this document for current execution state while the integration remains open.