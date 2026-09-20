# YouTeach authentication hardening implementation plan

Date: 2026-09-19
Branch: feature/auth-hardening-20260919

## Goal

Move student and teacher credentials out of client-readable Firebase records and replace browser-authoritative login with server-issued, expiring signed sessions. Keep legacy student credentials only as a temporary server-side migration source.

## Tasks

1. Add a server-only credential-store module backed by the Cloudflare KV binding `YOUTEACH_AUTH`.
2. Add password hashing/verification with PBKDF2-SHA256, random salts, versioned records, and normalized login indexes.
3. Replace student browser-side credential verification with `/api/student-session`.
4. Support dual-read migration: if no KV credential exists, verify the legacy Firebase password server-side, write the hash to KV, then remove the public password field for that migrated account.
5. Add `/api/student-password`; require a valid signed student session and current-password verification before rotating credentials.
6. Replace shipped teacher/admin credentials with `/api/teacher-session` and a signed teacher session.
7. Move student enrollment/import credential creation to `/api/student-enrollment`, protected by a signed teacher session.
8. Add a one-time admin/bootstrap path protected by a server secret so teacher/admin credentials can be provisioned without committing passwords.
9. Add a controlled student credential migration endpoint that never logs plaintext credentials.
10. Add setup documentation for the KV binding and secrets. Do not enable official COG grades until the binding, migration and field validation are complete.

## Verification

- Unit tests for credential hashing, lookup and rotation.
- Static boundary tests proving browser JavaScript contains no teacher/admin literal passwords and no direct student password reads/writes.
- Runtime contract tests for student and teacher session APIs.
- Full existing YouTeach test suite.
- No production deployment from this branch.
