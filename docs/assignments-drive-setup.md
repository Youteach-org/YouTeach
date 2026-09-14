# YouTeach Assignments — Google Drive setup

Assignment evidence is stored in Google Drive. Firebase Realtime Database stores only lightweight metadata.

## Storage layout

Root folder:
- Name: `YouTeach Assignments`
- Folder ID: `1ramZnVilxmPcU4I38PvFsNuVHTetjw9A`

Each task gets one subfolder named with its task code, for example `EPID-01`.

Each student has one PDF per task. The server-controlled filename is:

`Student-Full-Name--TASK-CODE.pdf`

Submitting again updates the same Drive file instead of creating another copy.

## Required server secrets

The upload endpoint uses Google OAuth on the server. Configure these as server-side secrets in the active hosting provider:

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`

Optional:
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` — recommended value: `1ramZnVilxmPcU4I38PvFsNuVHTetjw9A`

Do not commit OAuth secrets or refresh tokens to GitHub.

## Cloudflare Pages migration

YouTeach is a static HTML/JS site plus one server endpoint. The Cloudflare version keeps the public API route unchanged.

Cloudflare Pages settings:
- Production branch: `main`
- Build command: `sh build-pages.sh`
- Build output directory: `dist`
- Root directory: repository root

The Cloudflare Pages Function is:
- Source: `functions/api/drive-upload-session.js`
- Public route: `/api/drive-upload-session`

Add the required Google Drive values under the Pages project's runtime Variables and Secrets for Production. Add them to Preview too if preview deployments need assignment uploads.

Keep the current Vercel deployment active until the Cloudflare `pages.dev` deployment has been tested end-to-end.

## Upload flow

1. Student selects one PDF (max 15 MB).
2. YouTeach asks `/api/drive-upload-session` for a Drive resumable upload session.
3. The server validates the student and assignment against Firebase metadata.
4. The browser uploads the PDF directly to Google Drive using the resumable session URL.
5. YouTeach stores only Drive file metadata and the review state in Firebase.
6. Identity review remains `pending` until the submitted PDF is checked.

No assignment PDF bytes are stored in Firebase Storage.
