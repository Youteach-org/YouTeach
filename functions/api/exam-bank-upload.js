const ROOT_FOLDER_NAME = "YouTeach Exam Bank";
const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const MAX_EXAM_BYTES = 30 * 1024 * 1024;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function clean(value) {
  return String(value ?? "").trim();
}

function decodeHeader(request, name) {
  const raw = clean(request.headers.get(name));
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch (_) {
    return raw;
  }
}

function safeSegment(value, fallback = "exam") {
  const cleanValue = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleanValue || fallback;
}

function escapeDriveQuery(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeTags(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map(clean).filter(Boolean))];
    }
  } catch (_) {}
  return [...new Set(String(value || "").split(",").map(clean).filter(Boolean))];
}

function supportedExamFile(contentType, fileName) {
  const type = clean(contentType).toLowerCase();
  const name = clean(fileName).toLowerCase();
  const allowedTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "application/rtf",
    "text/rtf",
    "text/plain"
  ]);
  return allowedTypes.has(type) || /\.(pdf|doc|docx|odt|rtf|txt)$/.test(name);
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

async function beginUpload({ accessToken, entryId, fileName, contentType, fileSize, folderId }) {
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
        kind: "exam-bank-original",
        examBankEntryId: entryId
      }
    })
  });

  if (!response.ok) {
    let message = "Could not start the Google Drive exam upload.";
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
    let message = `Google Drive exam upload failed (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  const file = await response.json();
  if (!file?.id) throw new Error("Google Drive did not return the uploaded exam file ID.");
  return file;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." });
  }

  try {
    const entryId = decodeHeader(request, "x-exam-entry-id");
    const title = decodeHeader(request, "x-exam-title");
    const subject = decodeHeader(request, "x-exam-subject");
    const unit = decodeHeader(request, "x-exam-unit");
    const topic = decodeHeader(request, "x-exam-topic");
    const examType = decodeHeader(request, "x-exam-type");
    const examDate = decodeHeader(request, "x-exam-date");
    const version = decodeHeader(request, "x-exam-version");
    const tags = normalizeTags(decodeHeader(request, "x-exam-tags"));
    const actor = decodeHeader(request, "x-teacher-name");
    const originalFileName = decodeHeader(request, "x-file-name");
    const declaredSize = Number(request.headers.get("x-file-size") || 0);
    const contentType = clean(request.headers.get("content-type") || "application/octet-stream").toLowerCase();

    if (!entryId || !title || !originalFileName) {
      return json(400, { ok: false, error: "Exam ID, title, and original file are required." });
    }

    const bytes = await request.arrayBuffer();
    const fileSize = declaredSize || bytes.byteLength;
    if (!fileSize || fileSize !== bytes.byteLength) {
      return json(400, { ok: false, error: "Exam file size does not match the uploaded data." });
    }
    if (fileSize > MAX_EXAM_BYTES) {
      return json(400, { ok: false, error: "Exam files must be 30 MB or smaller." });
    }
    if (!supportedExamFile(contentType, originalFileName)) {
      return json(400, { ok: false, error: "Unsupported exam file type." });
    }

    const accessToken = await getAccessToken(env);
    const root = env.GOOGLE_DRIVE_EXAM_BANK_FOLDER_ID
      ? {
          id: env.GOOGLE_DRIVE_EXAM_BANK_FOLDER_ID,
          url: `https://drive.google.com/drive/folders/${env.GOOGLE_DRIVE_EXAM_BANK_FOLDER_ID}`
        }
      : await findOrCreateFolder(accessToken, ROOT_FOLDER_NAME, "root");

    const sessionUrl = await beginUpload({
      accessToken,
      entryId,
      fileName: originalFileName,
      contentType,
      fileSize,
      folderId: root.id
    });

    const driveFile = await completeUpload(sessionUrl, bytes, contentType);
    const now = Date.now();
    const entry = {
      id: entryId,
      schemaVersion: 1,
      title,
      subject,
      unit,
      topic,
      examType,
      examDate,
      version,
      tags,
      originalFileName,
      driveFileId: driveFile.id,
      driveFileName: driveFile.name || originalFileName,
      driveFileUrl: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`,
      driveFolderId: root.id,
      driveFolderUrl: root.url,
      mimeType: driveFile.mimeType || contentType,
      size: Number(driveFile.size || fileSize),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor
    };

    await firebasePatch(
      `examBank/${encodeURIComponent(entryId)}`,
      entry
    );

    return json(200, { ok: true, entry });
  } catch (error) {
    console.error(error);
    const status = error?.code === "DRIVE_NOT_CONFIGURED" ? 503 : 500;
    return json(status, {
      ok: false,
      error: error?.message || "Could not upload the exam."
    });
  }
}
