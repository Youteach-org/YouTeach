const ROOT_FOLDER_NAME = "YouTeach Assignments";
const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const RUBRIC_MARKER = "\n\n[[YOUTEACH_RUBRIC_V1:";
const RUBRIC_END = "]]";

function json(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...extraHeaders
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

function decodeRubricMetadata(value) {
  try {
    const binary = atob(String(value || ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) {
    return {};
  }
}

function splitStoredInstructions(value) {
  const raw = String(value || "");
  const markerIndex = raw.lastIndexOf(RUBRIC_MARKER);
  if (markerIndex < 0) {
    return { visibleInstructions: raw, rubric: {} };
  }

  const encodedStart = markerIndex + RUBRIC_MARKER.length;
  const endIndex = raw.indexOf(RUBRIC_END, encodedStart);
  if (endIndex < 0) {
    return { visibleInstructions: raw, rubric: {} };
  }

  return {
    visibleInstructions: raw.slice(0, markerIndex).trimEnd(),
    rubric: decodeRubricMetadata(raw.slice(encodedStart, endIndex))
  };
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
  if (!response.ok) {
    throw new Error(`Firebase write failed: ${response.status}`);
  }
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
    const error = new Error(data.error_description || data.error || "Could not authorize Google Drive.");
    error.code = "DRIVE_AUTH_FAILED";
    throw error;
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
  if (!createResponse.ok) {
    throw new Error(created.error?.message || "Could not create the Google Drive folder.");
  }

  return {
    id: created.id,
    url: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`
  };
}

async function findOrCreateTaskFolder(accessToken, taskCode, configuredRootFolderId) {
  const root = configuredRootFolderId
    ? {
        id: configuredRootFolderId,
        url: `https://drive.google.com/drive/folders/${configuredRootFolderId}`
      }
    : await findOrCreateFolder(accessToken, ROOT_FOLDER_NAME, "root");

  return findOrCreateFolder(accessToken, taskCode, root.id);
}

function normalizeEvaluationCriteria(value) {
  const raw = Array.isArray(value) ? value : Object.values(value || {});
  return raw
    .filter(Boolean)
    .map((criterion, index) => ({
      id: String(criterion.id || `criterion-${index + 1}`),
      type: criterion.type === "preset" ? "preset" : "custom",
      presetKey: String(criterion.presetKey || ""),
      title: String(criterion.title || criterion.name || "").trim(),
      description: String(criterion.description || "").trim(),
      maxPoints: Number(criterion.maxPoints || criterion.points || 0)
    }))
    .filter((criterion) => criterion.title || criterion.description || criterion.maxPoints);
}

async function ensureEvaluationRubricFile({
  accessToken,
  folderId,
  assignment,
  assignmentId,
  taskCode
}) {
  const embedded = splitStoredInstructions(assignment?.instructions);
  const directCriteria = normalizeEvaluationCriteria(assignment?.evaluationCriteria);
  const criteria = directCriteria.length
    ? directCriteria
    : normalizeEvaluationCriteria(embedded.rubric?.criteria);
  const notes = String(
    assignment?.evaluationNotes ??
    embedded.rubric?.notes ??
    ""
  ).trim();
  if (!criteria.length && !notes) return null;

  const fileName = `${taskCode}--evaluation-criteria.json`;
  const query = [
    `'${escapeDriveQuery(folderId)}' in parents`,
    `name = '${escapeDriveQuery(fileName)}'`,
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
    throw new Error(searchData.error?.message || "Could not search the evaluation rubric file.");
  }

  let file = searchData.files?.[0] || null;
  if (!file) {
    const createResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: fileName,
          mimeType: "application/json",
          parents: [folderId],
          appProperties: {
            source: "youteach",
            kind: "evaluation-rubric",
            assignmentId: String(assignmentId),
            taskCode: String(taskCode)
          }
        })
      }
    );
    const created = await createResponse.json();
    if (!createResponse.ok) {
      throw new Error(created.error?.message || "Could not create the evaluation rubric file.");
    }
    file = created;
  }

  const totalPoints = criteria.reduce(
    (sum, criterion) => sum + Math.max(0, Number(criterion.maxPoints || 0)),
    0
  );

  const rubric = {
    schemaVersion: 1,
    source: "YouTeach",
    purpose: "Evaluation criteria for ChatGPT-assisted grading",
    assignmentId: String(assignmentId),
    taskCode: String(taskCode),
    title: String(assignment?.title || "Assignment"),
    groupName: String(assignment?.groupName || "ALL"),
    instructions: String(embedded.visibleInstructions || ""),
    evaluationNotes: notes,
    distributionMode: String(
      assignment?.evaluationDistribution ||
      embedded.rubric?.distribution ||
      "manual"
    ),
    totalPoints: Number(totalPoints.toFixed(2)),
    criteria,
    updatedAt: Number(
      assignment?.evaluationUpdatedAt ||
      assignment?.updatedAt ||
      assignment?.createdAt ||
      Date.now()
    )
  };

  const uploadResponse = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify(rubric, null, 2)
    }
  );

  if (!uploadResponse.ok) {
    let message = "Could not update the evaluation rubric file.";
    try {
      const errorBody = await uploadResponse.json();
      message = errorBody.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  return {
    id: file.id,
    name: fileName,
    url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`
  };
}

async function ensureGradingResultsFile({
  accessToken,
  folderId,
  assignmentId,
  taskCode
}) {
  const fileName = `${taskCode}--grading-results.json`;
  const query = [
    `'${escapeDriveQuery(folderId)}' in parents`,
    `name = '${escapeDriveQuery(fileName)}'`,
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
    throw new Error(searchData.error?.message || "Could not search the AI grading results file.");
  }

  let file = searchData.files?.[0] || null;
  let created = false;

  if (!file) {
    const createResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: fileName,
          mimeType: "application/json",
          parents: [folderId],
          appProperties: {
            source: "youteach",
            kind: "ai-grading-results",
            assignmentId: String(assignmentId),
            taskCode: String(taskCode)
          }
        })
      }
    );

    const createdFile = await createResponse.json();
    if (!createResponse.ok || !createdFile?.id) {
      throw new Error(createdFile.error?.message || "Could not create the AI grading results file.");
    }

    file = createdFile;
    created = true;
  }

  if (created) {
    const placeholder = {
      schemaVersion: 2,
      source: "YouTeach",
      taskCode: String(taskCode),
      gradedAt: null,
      results: []
    };

    const uploadResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify(placeholder, null, 2)
      }
    );

    if (!uploadResponse.ok) {
      throw new Error("Could not initialize the AI grading results file.");
    }
  }

  return {
    id: file.id,
    name: fileName,
    url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`
  };
}

async function findExistingStudentFile(accessToken, folderId, fileName) {
  const query = [
    `'${escapeDriveQuery(folderId)}' in parents`,
    `name = '${escapeDriveQuery(fileName)}'`,
    "mimeType = 'application/pdf'",
    "trashed = false"
  ].join(" and ");

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,size,webViewLink,parents)");
  url.searchParams.set("pageSize", "10");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Could not search for an existing student PDF.");
  }
  return data.files?.[0] || null;
}

async function ensureFileInFolder(accessToken, fileId, folderId) {
  if (!fileId) return;

  const metaResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaResponse.ok) return;

  const meta = await metaResponse.json();
  const parents = Array.isArray(meta.parents) ? meta.parents : [];
  if (parents.includes(folderId)) return;

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
  );
  url.searchParams.set("addParents", folderId);
  if (parents.length) url.searchParams.set("removeParents", parents.join(","));
  url.searchParams.set("fields", "id,parents");

  const moveResponse = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!moveResponse.ok) {
    let message = "Could not move the PDF into the task folder.";
    try {
      const body = await moveResponse.json();
      message = body.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }
}

async function completeResumableUpload(sessionUrl, bytes) {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: bytes
  });

  if (!response.ok) {
    let message = `Google Drive upload failed (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  const data = await response.json();
  if (!data?.id) throw new Error("Google Drive did not return the uploaded file ID.");
  return data;
}

async function deleteDriveFile(accessToken, fileId) {
  if (!fileId) return;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok && response.status !== 404) {
    let message = "Could not remove the submitted PDF from Google Drive.";
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }
}

async function beginResumableUpload({
  accessToken,
  fileId,
  fileName,
  folderId,
  fileSize,
  assignmentId,
  studentKey,
  taskCode
}) {
  const fields = "id,name,mimeType,size,webViewLink,parents,modifiedTime";
  const baseUrl = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}`
    : "https://www.googleapis.com/upload/drive/v3/files";
  const url = new URL(baseUrl);
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("fields", fields);

  const metadata = {
    name: fileName,
    mimeType: "application/pdf",
    appProperties: {
      source: "youteach",
      assignmentId: String(assignmentId),
      studentKey: String(studentKey),
      taskCode: String(taskCode)
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
      studentKey,
      taskCode
    });
  }

  if (!response.ok) {
    let message = "Could not start the Google Drive upload.";
    try {
      const errorBody = await response.json();
      message = errorBody.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  const sessionUrl = response.headers.get("location");
  if (!sessionUrl) throw new Error("Google Drive did not return an upload session.");

  return sessionUrl;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." }, { Allow: "POST" });
  }

  try {
    const contentType = String(request.headers.get("content-type") || "").toLowerCase();
    let body = {};
    let uploadBytes = null;

    if (contentType.startsWith("application/pdf")) {
      body = {
        action: "upload",
        assignmentId: request.headers.get("x-assignment-id") || "",
        studentKey: request.headers.get("x-student-key") || "",
        externalId: request.headers.get("x-external-id") || "",
        fileSize: Number(request.headers.get("x-file-size") || 0),
        mimeType: "application/pdf"
      };
      uploadBytes = await request.arrayBuffer();
      if (!body.fileSize) body.fileSize = uploadBytes.byteLength;
    } else {
      try {
        body = await request.json();
      } catch (_) {
        body = {};
      }
    }

    const {
      action = "prepare",
      assignmentId,
      studentKey,
      externalId,
      fileSize,
      mimeType
    } = body || {};

    if (!assignmentId || !studentKey || !externalId) {
      return json(400, { ok: false, error: "Missing assignment or student identity." });
    }

    const numericSize = Number(fileSize || 0);
    if (action !== "undo" && (mimeType !== "application/pdf" || !numericSize || numericSize > MAX_PDF_BYTES)) {
      return json(400, { ok: false, error: "Only PDF files up to 15 MB are accepted." });
    }

    const [student, assignment, submission] = await Promise.all([
      firebaseGet(`students/${encodeURIComponent(studentKey)}`),
      firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`),
      firebaseGet(`assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`)
    ]);

    if (!student || !assignment) {
      return json(404, { ok: false, error: "Student or assignment not found." });
    }

    const expectedExternalId = String(student.studentNumber || student.id || "").trim();
    if (!expectedExternalId || expectedExternalId !== String(externalId).trim()) {
      return json(403, { ok: false, error: "Student identity does not match this session." });
    }

    if (action !== "undo") {
      if (!assignment.active) {
        return json(403, { ok: false, error: "This assignment is closed." });
      }

      const dueAt = Number(assignment.dueAt || 0);
      if (dueAt && Date.now() > dueAt) {
        return json(403, { ok: false, error: "The due date for this assignment has passed." });
      }
    }

    const studentGroup = String(student.groupName || "GENERAL");
    const assignmentGroup = String(assignment.groupName || "ALL");
    if (assignmentGroup !== "ALL" && assignmentGroup !== studentGroup) {
      return json(403, { ok: false, error: "This assignment is not assigned to your group." });
    }

    const accessToken = await getAccessToken(env);
    const taskCode = safeSegment(assignment.code || assignmentId, "TASK");
    const studentName = student.fullName || student.name || student.nickname || expectedExternalId;
    const fileName = `${safeSegment(studentName, "Student")}--${taskCode}.pdf`;

    const folder = await findOrCreateTaskFolder(
      accessToken,
      taskCode,
      env.GOOGLE_DRIVE_ROOT_FOLDER_ID || ""
    );

    let existingFile = null;
    if (submission?.driveFileId) {
      existingFile = { id: submission.driveFileId };
    } else {
      existingFile = await findExistingStudentFile(accessToken, folder.id, fileName);
    }

    if (action === "undo") {
      await deleteDriveFile(accessToken, existingFile?.id || "");

      const submissionPath =
        `assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`;

      await firebasePatch(submissionPath, {
        withdrawn: true,
        withdrawnAt: Date.now(),
        updatedAt: Date.now(),
        reviewStatus: "withdrawn",
        identityReviewStatus: "withdrawn",
        driveFileId: null,
        driveFileName: null,
        driveFileUrl: null,
        mimeType: null,
        size: null,
        uploadedAt: null
      });

      return json(200, {
        ok: true,
        action: "undo",
        taskCode,
        folderId: folder.id,
        folderUrl: folder.url
      });
    }

    try {
      await ensureEvaluationRubricFile({
        accessToken,
        folderId: folder.id,
        assignment,
        assignmentId,
        taskCode
      });

      await ensureGradingResultsFile({
        accessToken,
        folderId: folder.id,
        assignmentId,
        taskCode
      });
    } catch (rubricError) {
      console.warn("Could not sync grading support files to Drive:", rubricError);
    }

    if (existingFile?.id) {
      await ensureFileInFolder(accessToken, existingFile.id, folder.id);
    }

    const sessionUrl = await beginResumableUpload({
      accessToken,
      fileId: existingFile?.id || "",
      fileName,
      folderId: folder.id,
      fileSize: numericSize,
      assignmentId,
      studentKey,
      taskCode
    });

    if (action === "upload") {
      if (!uploadBytes) {
        return json(400, { ok: false, error: "Missing PDF upload data." });
      }

      if (submission?.examAnnotatedDriveFileId) {
        try {
          await deleteDriveFile(accessToken, submission.examAnnotatedDriveFileId);
        } catch (annotationDeleteError) {
          console.warn("Could not remove stale annotated exam copy:", annotationDeleteError);
        }
      }

      const driveFile = await completeResumableUpload(sessionUrl, uploadBytes);
      const now = Date.now();
      const driveFileName = driveFile.name || fileName;
      const driveFileUrl =
        driveFile.webViewLink ||
        `https://drive.google.com/file/d/${driveFile.id}/view`;

      const submissionPath =
        `assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`;

      await firebasePatch(submissionPath, {
        studentKey,
        studentName: student.fullName || student.name || student.nickname || "Student",
        nickname: student.nickname || "",
        studentNumber: student.studentNumber || student.id || "",
        groupName: student.groupName || "GENERAL",
        assignmentId,
        assignmentCode: assignment.code || "",
        assignmentTitle: assignment.title || "Assignment",
        submittedAt: Number(submission?.submittedAt || now),
        updatedAt: now,
        withdrawn: false,
        withdrawnAt: null,
        reviewStatus: "pending",
        identityReviewStatus: "pending",
        driveFileId: driveFile.id,
        driveFileName,
        driveFileUrl,
        driveFolderId: folder.id,
        driveFolderUrl: folder.url,
        mimeType: "application/pdf",
        size: Number(driveFile.size || numericSize || 0),
        uploadedAt: now,
        examAnnotations: null,
        examAnnotationPointsTotal: null,
        examAnnotationsUpdatedAt: null,
        examAnnotationsUpdatedBy: null,
        examAnnotationStatus: null,
        examAnnotationSavedAt: null,
        examAnnotationSavedBy: null,
        examAnnotatedDriveFileId: null,
        examAnnotatedDriveFileName: null,
        examAnnotatedDriveFileUrl: null,
        examAnnotatedAt: null,
        examAnnotatedSourceDriveFileId: null
      });

      return json(200, {
        ok: true,
        action: "upload",
        driveFileId: driveFile.id,
        driveFileName,
        driveFileUrl,
        driveFolderId: folder.id,
        driveFolderUrl: folder.url,
        mimeType: "application/pdf",
        size: Number(driveFile.size || numericSize || 0),
        uploadedAt: now,
        taskCode
      });
    }

    return json(200, {
      ok: true,
      action: "prepare",
      sessionUrl,
      fileName,
      folderId: folder.id,
      folderUrl: folder.url,
      taskCode
    });
  } catch (error) {
    console.error(error);
    const status = error?.code === "DRIVE_NOT_CONFIGURED" ? 503 : 500;
    return json(status, {
      ok: false,
      error: error?.message || "Could not process the assignment file."
    });
  }
}
