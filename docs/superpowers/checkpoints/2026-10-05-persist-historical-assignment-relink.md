# 2026-10-05 — Persist historical Assignment relinks

## Symptom

The teacher could click **Link to <working group>** for an Assignment stored under an old group, confirm the action, and still see the old relationship afterward.

## Root cause

The relink action bundled the critical `groupName` change together with optional audit/review fields in one Firebase `update()`. If any optional field was rejected by the active Firebase validation surface, Firebase rejected the whole multi-field write.

## Fix

1. Persist only `assignments/<id>/groupName` first.
2. Read `assignments/<id>/groupName` back from Firebase and verify that it exactly matches the working group.
3. Update the local Assignment cache immediately after verified persistence so the UI reacts without waiting for the realtime echo.
4. Save audit/review metadata in a separate best-effort write. Audit failure can no longer roll back or block the group relink.
5. Show a temporary **Linking…** state on the clicked button.
6. If persistence or verification fails, show an explicit error instead of silently appearing to work.
7. Re-run Assignment evaluation-target migration after the group relink.

## Verification

Feature-branch workflow run **#824** passed:
- regression tests;
- Pages build;
- Cloudflare preview deployment;
- Cloudflare state inspection.
