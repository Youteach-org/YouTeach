const ROOT_FOLDER_NAME = "YouTeach Assignments";
const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const MAX_PROJECT_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_PROJECT_VIDEO_BYTES = 50 * 1024 * 1024;

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

function escapeDriveQuery(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function evidenceTypeFrom(contentType, fileName) {
  const type = String(contentType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";

  const documentMimeTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain"
  ]);

  if (
    documentMimeTypes.has(type) ||
    /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt)$/.test(name)
  ) {
    return "document";
  }

  return "";
}

function checkpointList(assignment) {
  return Object.entries(assignment?.projectCheckpoints || {}).map(([id, checkpoint]) => ({
    id,
    ...(checkpoint || {}),
    requiredEvidenceTypes: Array.isArray(checkpoint?.requiredEvidenceTypes)
      ? checkpoint.requiredEvidenceTypes.map((value) => String(value))
      : Object.keys(checkpoint?.requiredEvidenceTypes || {}).filter((key) => checkpoint.requiredEvidenceTypes[key])
  }));
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
    const error = new Error("Google Drive upload is not configured on the server.");
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

async function findOrCreateFolder(accessToken, name, parentId = "root") {
  const query = [
    `'${escapeDriveQuery(parentId)}' in parents`,
    `name = '${escapeDriveQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false"
  ].join(" and ");

  const searchUrl = new URL("https://www.googleapis.com/drive/v3/files");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("fields", "files(id,name,webViewLink)");
  searchUrl.searchParams.set("pageSize", "10");

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const searchData = await searchResponse.json();
  if (!searchResponse.ok) {
    throw new Error(searchData.error?.message || "Could not search Google Drive folders.");
  }

  const existing = searchData.files?.[0];
  if (existing) {
    return {
      id: existing.id,
      url: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`
    };
  }

  const createResponse = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      })
    }
  );

  const created = await createResponse.json();
  if (!createResponse.ok || !created?.id) {
    throw new Error(created?.error?.message || "Could not create Google Drive folder.");
  }

  return {
    id: created.id,
    url: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`
  };
}

async function taskFolder(accessToken, taskCode, configuredRootFolderId) {
  const root = configuredRootFolderId
    ? {
        id: configuredRootFolderId,
        url: `https://drive.google.com/drive/folders/${configuredRootFolderId}`
      }
    : await findOrCreateFolder(accessToken, ROOT_FOLDER_NAME, "root");

  return findOrCreateFolder(accessToken, taskCode, root.id);
}

async function beginUpload({
  accessToken,
  fileName,
  contentType,
  fileSize,
  folderId,
  assignmentId,
  studentKey,
  checkpointId,
  evidenceType
}) {
  const url = new URL("https://www.googleapis.com/upload/drive/v3/files");
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink,parents,modifiedTime");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": String(fileSize)
    },
    body: JSON.stringify({
      name: fileName,
      mimeType: contentType,
      parents: [folderId],
      appProperties: {
        source: "youteach",
        kind: "project-evidence",
        assignmentId: String(assignmentId),
        studentKey: String(studentKey),
        checkpointId: String(checkpointId),
        evidenceType: String(evidenceType)
      }
    })
  });

  if (!response.ok) {
    let message = "Could not start the Google Drive evidence upload.";
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

async function completeUpload(sessionUrl, bytes, contentType) {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes
  });

  if (!response.ok) {
    let message = `Google Drive evidence upload failed (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  const data = await response.json();
  if (!data?.id) throw new Error("Google Drive did not return the uploaded evidence file ID.");
  return data;
}

function makeEvidenceId(now) {
  const random = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `evidence-${now}-${random}`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." });
  }

  try {
    const assignmentId = String(request.headers.get("x-assignment-id") || "").trim();
    const studentKey = String(request.headers.get("x-student-key") || "").trim();
    const externalId = String(request.headers.get("x-external-id") || "").trim();
    const checkpointId = String(request.headers.get("x-checkpoint-id") || "").trim();
    const originalFileName = decodeURIComponent(
      String(request.headers.get("x-file-name") || "evidence").trim()
    );
    const declaredSize = Number(request.headers.get("x-file-size") || 0);
    const declaredEvidenceType = String(request.headers.get("x-evidence-type") || "").trim();
    const contentType = String(request.headers.get("content-type") || "application/octet-stream").toLowerCase();

    if (!assignmentId || !studentKey || !externalId || !checkpointId) {
      return json(400, { ok: false, error: "Missing assignment, student, or checkpoint identity." });
    }

    const bytes = await request.arrayBuffer();
    const fileSize = declaredSize || bytes.byteLength;
    if (!fileSize || fileSize !== bytes.byteLength) {
      return json(400, { ok: false, error: "Evidence file size does not match the uploaded data." });
    }

    const evidenceType = evidenceTypeFrom(contentType, originalFileName);
    if (!evidenceType || (declaredEvidenceType && declaredEvidenceType !== evidenceType)) {
      return json(400, { ok: false, error: "Unsupported or mismatched project evidence type." });
    }

    const maxBytes = evidenceType === "video"
      ? MAX_PROJECT_VIDEO_BYTES
      : MAX_PROJECT_DOCUMENT_BYTES;
    if (fileSize > maxBytes) {
      return json(400, {
        ok: false,
        error: evidenceType === "video"
          ? "Video evidence must be 50 MB or smaller."
          : "Photo/document evidence must be 20 MB or smaller."
      });
    }

    const [student, assignment] = await Promise.all([
      firebaseGet(`students/${encodeURIComponent(studentKey)}`),
      firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`)
    ]);

    if (!student || !assignment) {
      return json(404, { ok: false, error: "Student or assignment not found." });
    }

    const expectedExternalId = String(student.studentNumber || student.id || "").trim();
    if (!expectedExternalId || expectedExternalId !== externalId) {
      return json(403, { ok: false, error: "Student identity does not match this session." });
    }

    const typeCode = String(assignment.assignmentTypeCode || "").trim().toUpperCase();
    const looksLikeProject = typeCode === "PJ" || String(assignment.code || "").toUpperCase().startsWith("PJ-");
    if (!looksLikeProject) {
      return json(400, { ok: false, error: "This assignment is not a Project." });
    }

    if (!assignment.active) {
      return json(403, { ok: false, error: "This assignment is closed." });
    }

    const studentGroup = String(student.groupName || "GENERAL");
    const assignmentGroup = String(assignment.groupName || "ALL");
    if (assignmentGroup !== "ALL" && assignmentGroup !== studentGroup) {
      return json(403, { ok: false, error: "This assignment is not assigned to your group." });
    }

    const checkpoint = checkpointList(assignment).find((item) => item.id === checkpointId);
    if (!checkpoint) {
      return json(404, { ok: false, error: "Project checkpoint not found." });
    }

    const checkpointDueAt = Number(checkpoint.dueAt || 0);
    if (checkpointDueAt && Date.now() > checkpointDueAt) {
      return json(403, { ok: false, error: "This checkpoint is closed." });
    }

    const allowedTypes = new Set(checkpoint.requiredEvidenceTypes || []);
    if (!allowedTypes.has(evidenceType)) {
      return json(400, { ok: false, error: `This checkpoint does not accept ${evidenceType} evidence.` });
    }

    const finalDueAt = Number(assignment.dueAt || 0);
    if (finalDueAt && Date.now() > finalDueAt) {
      return json(403, { ok: false, error: "The final project due date has passed." });
    }

    const accessToken = await getAccessToken(env);
    const taskCode = safeSegment(assignment.code || assignmentId, "PROJECT");
    const task = await taskFolder(
      accessToken,
      taskCode,
      env.GOOGLE_DRIVE_ROOT_FOLDER_ID || ""
    );

    const studentName = student.fullName || student.name || student.nickname || expectedExternalId;
    const studentFolder = await findOrCreateFolder(
      accessToken,
      safeSegment(studentName, "Student"),
      task.id
    );
    const checkpointFolder = await findOrCreateFolder(
      accessToken,
      `${safeSegment(checkpoint.title, "Checkpoint")}--${safeSegment(checkpointId, "checkpoint")}`,
      studentFolder.id
    );

    const now = Date.now();
    const driveFileName = `${now}--${safeSegment(originalFileName, "evidence")}`;
    const sessionUrl = await beginUpload({
      accessToken,
      fileName: driveFileName,
      contentType,
      fileSize,
      folderId: checkpointFolder.id,
      assignmentId,
      studentKey,
      checkpointId,
      evidenceType
    });

    const driveFile = await completeUpload(sessionUrl, bytes, contentType);
    const driveFileUrl = driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`;
    const evidenceId = makeEvidenceId(now);

    await firebasePatch(
      `assignmentProjectEvidence/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}/${encodeURIComponent(checkpointId)}/${encodeURIComponent(evidenceId)}`,
      {
        evidenceId,
        assignmentId,
        studentKey,
        checkpointId,
        checkpointTitle: String(checkpoint.title || "Checkpoint"),
        evidenceType,
        originalFileName,
        driveFileId: driveFile.id,
        driveFileName: driveFile.name || driveFileName,
        driveFileUrl,
        driveFolderId: checkpointFolder.id,
        driveFolderUrl: checkpointFolder.url,
        mimeType: contentType,
        size: Number(driveFile.size || fileSize || 0),
        uploadedAt: now,
        updatedAt: now,
        reviewStatus: "pending",
        teacherNote: ""
      }
    );

    return json(200, {
      ok: true,
      evidenceId,
      assignmentId,
      checkpointId,
      evidenceType,
      originalFileName,
      driveFileId: driveFile.id,
      driveFileName: driveFile.name || driveFileName,
      driveFileUrl,
      driveFolderId: checkpointFolder.id,
      driveFolderUrl: checkpointFolder.url,
      mimeType: contentType,
      size: Number(driveFile.size || fileSize || 0),
      uploadedAt: now
    });
  } catch (error) {
    console.error(error);
    const status = error?.code === "DRIVE_NOT_CONFIGURED" ? 503 : 500;
    return json(status, {
      ok: false,
      error: error?.message || "Could not upload project evidence."
    });
  }
}
