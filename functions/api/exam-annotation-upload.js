const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const MAX_ANNOTATED_PDF_BYTES = 25 * 1024 * 1024;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function safeSegment(value, fallback = "item") {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || fallback;
}

async function firebaseGet(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

async function firebasePatch(path, value) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value || {})
  });
  if (!response.ok) throw new Error(`Firebase write failed: ${response.status}`);
  return response.json().catch(() => null);
}

async function getAccessToken(env) {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    const error = new Error("Google Drive is not configured on the server.");
    error.code = "DRIVE_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Could not authorize Google Drive.");
  }
  return data.access_token;
}

function isExamAssignment(assignment) {
  const code = String(assignment?.assignmentTypeCode || "").trim().toUpperCase();
  return code === "EX" || String(assignment?.code || "").toUpperCase().startsWith("EX-");
}

function gradedFileName(originalName) {
  const clean = String(originalName || "exam.pdf");
  const base = clean.toLowerCase().endsWith(".pdf") ? clean.slice(0, -4) : clean;
  return `${safeSegment(base, "exam")}--graded.pdf`;
}

async function beginResumableUpload({
  accessToken,
  fileId,
  fileName,
  folderId,
  fileSize,
  assignmentId,
  studentKey
}) {
  const baseUrl = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}`
    : "https://www.googleapis.com/upload/drive/v3/files";
  const url = new URL(baseUrl);
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink,parents,modifiedTime");

  const metadata = {
    name: fileName,
    mimeType: "application/pdf",
    appProperties: {
      source: "youteach",
      kind: "annotated-exam",
      assignmentId: String(assignmentId),
      studentKey: String(studentKey)
    }
  };
  if (!fileId) metadata.parents = [folderId];

  const response = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/pdf",
      "X-Upload-Content-Length": String(fileSize)
    },
    body: JSON.stringify(metadata)
  });

  if (fileId && response.status === 404) {
    return beginResumableUpload({
      accessToken,
      fileId: "",
      fileName,
      folderId,
      fileSize,
      assignmentId,
      studentKey
    });
  }

  if (!response.ok) {
    let message = "Could not start annotated exam upload.";
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  const sessionUrl = response.headers.get("location");
  if (!sessionUrl) throw new Error("Google Drive did not return an upload session.");
  return sessionUrl;
}

async function completeUpload(sessionUrl, bytes) {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: bytes
  });

  if (!response.ok) {
    let message = `Annotated exam upload failed (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  const data = await response.json();
  if (!data?.id) throw new Error("Google Drive did not return the annotated file ID.");
  return data;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const assignmentId = String(request.headers.get("x-assignment-id") || "").trim();
    const studentKey = String(request.headers.get("x-student-key") || "").trim();
    const fileSize = Number(request.headers.get("x-file-size") || 0);

    if (!assignmentId || !studentKey) {
      return json(400, { ok: false, error: "Missing assignment or student." });
    }

    const bytes = await request.arrayBuffer();
    const actualSize = bytes.byteLength;
    if (!actualSize || actualSize !== fileSize || actualSize > MAX_ANNOTATED_PDF_BYTES) {
      return json(400, { ok: false, error: "Annotated PDF must be 25 MB or smaller and match the declared size." });
    }

    const [assignment, submission] = await Promise.all([
      firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`),
      firebaseGet(`assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`)
    ]);

    if (!assignment || !submission?.driveFileId) {
      return json(404, { ok: false, error: "Exam submission not found." });
    }

    if (!isExamAssignment(assignment)) {
      return json(400, { ok: false, error: "This assignment is not an Exam." });
    }

    const folderId = String(submission.driveFolderId || "").trim();
    if (!folderId) {
      return json(400, { ok: false, error: "The exam submission has no Drive folder." });
    }

    const accessToken = await getAccessToken(env);
    const fileName = gradedFileName(submission.driveFileName);
    const sessionUrl = await beginResumableUpload({
      accessToken,
      fileId: String(submission.examAnnotatedDriveFileId || ""),
      fileName,
      folderId,
      fileSize: actualSize,
      assignmentId,
      studentKey
    });

    const driveFile = await completeUpload(sessionUrl, bytes);
    const now = Date.now();
    const driveFileUrl = driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`;

    await firebasePatch(
      `assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`,
      {
        examAnnotatedDriveFileId: driveFile.id,
        examAnnotatedDriveFileName: driveFile.name || fileName,
        examAnnotatedDriveFileUrl: driveFileUrl,
        examAnnotatedAt: now,
        examAnnotatedSourceDriveFileId: String(submission.driveFileId || ""),
        updatedAt: now
      }
    );

    return json(200, {
      ok: true,
      driveFileId: driveFile.id,
      driveFileName: driveFile.name || fileName,
      driveFileUrl,
      annotatedAt: now
    });
  } catch (error) {
    console.error(error);
    return json(error?.code === "DRIVE_NOT_CONFIGURED" ? 503 : 500, {
      ok: false,
      error: error?.message || "Could not save the annotated exam."
    });
  }
}
