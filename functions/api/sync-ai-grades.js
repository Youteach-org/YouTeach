const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const ROOT_FOLDER_NAME = "YouTeach Assignments";
const RUBRIC_MARKER = "\n\n[[YOUTEACH_RUBRIC_V1:";
const RUBRIC_END = "]]";

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function escapeDriveQuery(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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
  if (markerIndex < 0) return { visibleInstructions: raw, rubric: {} };

  const encodedStart = markerIndex + RUBRIC_MARKER.length;
  const endIndex = raw.indexOf(RUBRIC_END, encodedStart);
  if (endIndex < 0) return { visibleInstructions: raw, rubric: {} };

  return {
    visibleInstructions: raw.slice(0, markerIndex).trimEnd(),
    rubric: decodeRubricMetadata(raw.slice(encodedStart, endIndex))
  };
}

function normalizeCriteria(value) {
  const raw = Array.isArray(value) ? value : Object.values(value || {});
  return raw
    .filter(Boolean)
    .map((criterion, index) => ({
      id: String(criterion.id || `criterion-${index + 1}`),
      title: String(criterion.title || criterion.name || "").trim(),
      maxPoints: Number(criterion.maxPoints || criterion.points || 0)
    }))
    .filter((criterion) => criterion.title && Number.isFinite(criterion.maxPoints) && criterion.maxPoints > 0);
}

function assignmentCriteria(assignment) {
  const embedded = splitStoredInstructions(assignment?.instructions).rubric || {};
  const direct = normalizeCriteria(assignment?.evaluationCriteria);
  return direct.length ? direct : normalizeCriteria(embedded.criteria);
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

async function findFolder(accessToken, name, parentId) {
  const query = [
    `'${escapeDriveQuery(parentId)}' in parents`,
    `name = '${escapeDriveQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false"
  ].join(" and ");

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,webViewLink)");
  url.searchParams.set("pageSize", "10");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Could not search Google Drive folders.");
  return data.files?.[0] || null;
}

async function findTaskFolder(accessToken, taskCode, configuredRootFolderId) {
  let rootId = String(configuredRootFolderId || "").trim();

  if (!rootId) {
    const rootFolder = await findFolder(accessToken, ROOT_FOLDER_NAME, "root");
    if (!rootFolder) throw new Error("YouTeach Assignments folder was not found.");
    rootId = rootFolder.id;
  }

  const taskFolder = await findFolder(accessToken, taskCode, rootId);
  if (!taskFolder) throw new Error(`Task folder ${taskCode} was not found in Google Drive.`);
  return taskFolder;
}

async function findJsonFile(accessToken, folderId, fileName) {
  const query = [
    `'${escapeDriveQuery(folderId)}' in parents`,
    `name = '${escapeDriveQuery(fileName)}'`,
    "trashed = false"
  ].join(" and ");

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)");
  url.searchParams.set("pageSize", "10");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Could not search AI grading results.");
  return data.files?.[0] || null;
}

async function downloadJson(accessToken, fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) throw new Error("Could not read the AI grading results file.");
  try {
    return await response.json();
  } catch (_) {
    throw new Error("The AI grading results file is not valid JSON.");
  }
}

function submissionLookup(submissions) {
  const entries = Object.entries(submissions || {}).filter(([, submission]) => submission?.driveFileId);
  const byFile = new Map();
  const byStudentNumber = new Map();
  const byName = new Map();

  for (const [studentKey, submission] of entries) {
    const fileName = normalizeText(submission.driveFileName);
    const number = normalizeText(submission.studentNumber);
    const name = normalizeText(submission.studentName);

    if (fileName) byFile.set(fileName, [studentKey, submission]);
    if (number) byStudentNumber.set(number, [studentKey, submission]);
    if (name) byName.set(name, [studentKey, submission]);
  }

  return { entries, byFile, byStudentNumber, byName };
}

function matchSubmission(result, lookup) {
  const fileName = normalizeText(result?.driveFileName || result?.fileName);
  if (fileName && lookup.byFile.has(fileName)) return lookup.byFile.get(fileName);

  const number = normalizeText(result?.studentNumber || result?.expectedStudentNumber);
  if (number && lookup.byStudentNumber.has(number)) return lookup.byStudentNumber.get(number);

  const name = normalizeText(result?.expectedStudentName || result?.studentName);
  if (name && lookup.byName.has(name)) return lookup.byName.get(name);

  return null;
}

function normalizeIdentityStatus(value) {
  const raw = normalizeText(value).replace(/[_\s]+/g, "-");
  if (["verified", "match", "matched"].includes(raw)) return "verified";
  if (["mismatch", "identity-mismatch"].includes(raw)) return "mismatch";
  return "manual-review";
}

function normalizeAiGrade(result, criteria) {
  const rawScores = result?.criterionScores || result?.criteria || {};
  const scoreById = {};
  const statusById = {};
  const noteById = {};
  let allGradable = true;
  let numericTotal = 0;

  for (const criterion of criteria) {
    let raw = null;

    if (Array.isArray(rawScores)) {
      raw = rawScores.find((item) =>
        String(item?.criterionId || item?.id || "") === criterion.id ||
        normalizeText(item?.title) === normalizeText(criterion.title)
      );
    } else {
      raw = rawScores[criterion.id];
      if (raw === undefined) {
        const matchingKey = Object.keys(rawScores).find((key) =>
          normalizeText(key) === normalizeText(criterion.title)
        );
        if (matchingKey) raw = rawScores[matchingKey];
      }
    }

    let score;
    let status = "graded";
    let note = "";

    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      score = raw.score;
      status = normalizeText(raw.status).replace(/[_\s]+/g, "-") || "graded";
      note = String(raw.note || raw.feedback || "");
    } else {
      score = raw;
    }

    if (status === "not-gradable" || status === "not_gradable" || score === null || score === undefined || score === "") {
      allGradable = false;
      scoreById[criterion.id] = null;
      statusById[criterion.id] = "not-gradable";
      if (note) noteById[criterion.id] = note;
      continue;
    }

    const numeric = Number(score);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > criterion.maxPoints + 0.001) {
      throw new Error(`Invalid score for criterion "${criterion.title}".`);
    }

    scoreById[criterion.id] = Number(numeric.toFixed(2));
    statusById[criterion.id] = "graded";
    if (note) noteById[criterion.id] = note;
    numericTotal += numeric;
  }

  const totalScore = allGradable ? Number(numericTotal.toFixed(2)) : null;
  if (totalScore !== null && totalScore > 100.01) {
    throw new Error("AI grade total cannot exceed 100.");
  }

  return {
    mode: "ai",
    criterionScores: scoreById,
    criterionStatus: statusById,
    criterionNotes: noteById,
    totalScore,
    rubricTotal: Number(criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0).toFixed(2)),
    feedback: String(result?.feedback || ""),
    notes: String(result?.notes || result?.observations || ""),
    identityStatus: normalizeIdentityStatus(result?.identityStatus),
    gradedAt: Number(result?.gradedAt || Date.now()),
    gradedBy: "ChatGPT"
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const assignmentId = String(body?.assignmentId || "").trim();
    const conflictMode = ["keep-manual", "replace-manual", "compare"].includes(body?.conflictMode)
      ? body.conflictMode
      : "keep-manual";

    if (!assignmentId) return json(400, { ok: false, error: "Missing assignment ID." });

    const [assignment, submissions] = await Promise.all([
      firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`),
      firebaseGet(`assignmentSubmissions/${encodeURIComponent(assignmentId)}`)
    ]);

    if (!assignment) return json(404, { ok: false, error: "Assignment not found." });

    const taskCode = String(assignment.code || "").trim();
    if (!taskCode) return json(400, { ok: false, error: "Assignment has no Task Code." });

    const criteria = assignmentCriteria(assignment);
    if (!criteria.length) {
      return json(400, { ok: false, error: "This assignment has no evaluation criteria." });
    }

    const accessToken = await getAccessToken(env);
    const folder = await findTaskFolder(
      accessToken,
      taskCode,
      env.GOOGLE_DRIVE_ROOT_FOLDER_ID || ""
    );

    const resultsFileName = `${taskCode}--grading-results.json`;
    const resultsFile = await findJsonFile(accessToken, folder.id, resultsFileName);
    if (!resultsFile) {
      return json(404, {
        ok: false,
        error: `${resultsFileName} was not found. Run AI Grading first.`
      });
    }

    const gradingDocument = await downloadJson(accessToken, resultsFile.id);
    if (String(gradingDocument?.taskCode || "").trim() !== taskCode) {
      return json(400, { ok: false, error: "AI grading file Task Code does not match this assignment." });
    }

    const rawResults = Array.isArray(gradingDocument?.results)
      ? gradingDocument.results
      : (Array.isArray(gradingDocument?.students) ? gradingDocument.students : []);

    if (!rawResults.length) {
      return json(400, { ok: false, error: "AI grading file contains no student results." });
    }

    const lookup = submissionLookup(submissions || {});
    const summary = {
      imported: 0,
      compared: 0,
      skippedManual: 0,
      unmatched: [],
      errors: []
    };

    for (const result of rawResults) {
      const matched = matchSubmission(result, lookup);
      if (!matched) {
        summary.unmatched.push(
          String(result?.driveFileName || result?.expectedStudentName || result?.studentName || "Unknown student")
        );
        continue;
      }

      const [studentKey, submission] = matched;

      try {
        const aiGrade = normalizeAiGrade(result, criteria);
        const hasManualGrade = submission?.grading?.mode === "manual";
        const currentIdentity = String(submission?.identityReviewStatus || "pending");

        const identityUpdate =
          ["", "pending", "withdrawn"].includes(currentIdentity)
            ? aiGrade.identityStatus
            : currentIdentity;

        if (hasManualGrade && conflictMode === "keep-manual") {
          await firebasePatch(
            `assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`,
            {
              aiGradingCandidate: aiGrade,
              aiGradingCandidateState: "kept-manual",
              identityReviewStatus: identityUpdate,
              aiGradingSyncedAt: Date.now()
            }
          );
          summary.skippedManual += 1;
          continue;
        }

        if (hasManualGrade && conflictMode === "compare") {
          await firebasePatch(
            `assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`,
            {
              aiGradingCandidate: aiGrade,
              aiGradingCandidateState: "compare",
              identityReviewStatus: identityUpdate,
              aiGradingSyncedAt: Date.now()
            }
          );
          summary.compared += 1;
          continue;
        }

        await firebasePatch(
          `assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`,
          {
            grading: aiGrade,
            aiGradingCandidate: null,
            aiGradingCandidateState: null,
            identityReviewStatus: identityUpdate,
            reviewStatus: aiGrade.totalScore === null ? "manual-review" : "graded",
            aiGradingSyncedAt: Date.now(),
            updatedAt: Date.now()
          }
        );
        summary.imported += 1;
      } catch (error) {
        summary.errors.push({
          student: String(result?.expectedStudentName || result?.studentName || result?.driveFileName || "Unknown student"),
          error: error?.message || "Invalid AI grading result."
        });
      }
    }

    return json(200, {
      ok: true,
      taskCode,
      resultsFileName,
      resultsFileId: resultsFile.id,
      conflictMode,
      ...summary
    });
  } catch (error) {
    console.error(error);
    const status = error?.code === "DRIVE_NOT_CONFIGURED" ? 503 : 500;
    return json(status, {
      ok: false,
      error: error?.message || "Could not sync AI grades."
    });
  }
}
