import { db } from "./firebase.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, getStudentSessionToken, clearStudentSession, saveLeaveLog } from "./student-auth.js";
import { getCertifiedCogGame } from "./cog-activity-catalog.mjs";
import {
  uploadAssignmentPdf,
  undoAssignmentPdf,
  validateAssignmentPdf,
  uploadProjectEvidence,
  validateProjectEvidence
} from "./assignment-storage.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey, externalId } = session;
const sessionToken = session.sessionToken || getStudentSessionToken() || "";
const RUBRIC_MARKER = "\n\n[[YOUTEACH_RUBRIC_V1:";
const RUBRIC_END = "]]";
const assignmentList = document.getElementById("assignmentList");
const studentIdentity = document.getElementById("studentIdentity");
const studentAssignmentIdentity = document.getElementById("studentAssignmentIdentity");
const logoutBtn = document.getElementById("logoutBtn");

let currentStudent = null;
let assignmentsCache = {};
let submissionCache = {};
let cogResultCache = {};
let projectEvidenceCache = {};
let renderingToken = 0;
let expandedAssignmentId = "";
const submissionUnsubscribers = new Map();
const evidenceUnsubscribers = new Map();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function formatDate(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "No due date";
  return new Date(value).toLocaleString();
}

function formatCompactDate(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "No due date";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function visibleAssignmentInstructions(value) {
  const raw = String(value || "");
  const markerIndex = raw.lastIndexOf(RUBRIC_MARKER);
  return (markerIndex >= 0 ? raw.slice(0, markerIndex) : raw).trim();
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

function decodeRubricMetadata(value) {
  try {
    const binary = atob(String(value || ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) {
    return {};
  }
}

function assignmentRubricCriteria(assignment) {
  const raw = String(assignment?.instructions || "");
  const markerIndex = raw.lastIndexOf(RUBRIC_MARKER);
  if (markerIndex < 0) return [];

  const encodedStart = markerIndex + RUBRIC_MARKER.length;
  const endIndex = raw.indexOf(RUBRIC_END, encodedStart);
  if (endIndex < 0) return [];

  const rubric = decodeRubricMetadata(raw.slice(encodedStart, endIndex));
  const criteria = Array.isArray(rubric?.criteria) ? rubric.criteria : Object.values(rubric?.criteria || {});
  return criteria.filter(Boolean);
}

function assignmentTypeCodeFor(assignment) {
  const embedded = splitStoredInstructions(assignment?.instructions).rubric || {};
  return String(
    assignment?.assignmentTypeCode ||
    embedded.assignmentTypeCode ||
    ""
  ).trim().toUpperCase();
}

function isProjectAssignment(assignment) {
  return assignmentTypeCodeFor(assignment) === "PJ" ||
    String(assignment?.code || "").toUpperCase().startsWith("PJ-");
}

function isExamAssignment(assignment) {
  return assignmentTypeCodeFor(assignment) === "EX" ||
    String(assignment?.code || "").toUpperCase().startsWith("EX-");
}

function isCogAssignment(assignment) {
  return assignmentTypeCodeFor(assignment) === "COG" ||
    Boolean(assignment?.cogActivity?.gameId);
}

async function createCogAssignmentPracticeToken(assignmentId) {
  if (!sessionToken) {
    throw new Error("Your YouTeach session needs to be refreshed. Sign in again before opening this COG activity.");
  }

  const response = await fetch("/api/cog-assignment-launch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ assignmentId })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !result.launchUrl) {
    throw new Error(result.error || "Could not open the COG activity.");
  }

  return String(result.launchUrl);
}

function cogAssignmentHtml(assignmentId, assignment) {
  const submission = cogResultCache[assignmentId] || null;
  const config = assignment?.cogActivity || {};
  const game = getCertifiedCogGame(config.gameId);
  const mode = game?.modes?.find((item) => item.id === config.modeId);
  const difficulty = game?.difficulties?.find((item) => item.id === config.difficultyId);
  const minimum = config.minimumPercent == null || config.minimumPercent === ""
    ? "No minimum"
    : `Minimum ${Number(config.minimumPercent)}%`;
  const points = Number(assignment?.pointValue ?? config.pointValue ?? 100);
  const officialSubmission = submission?.submissionType === "cog" ? submission : null;
  const activeOfficial = Boolean(
    officialSubmission &&
    officialSubmission.receiptStatus === "active" &&
    !officialSubmission.withdrawn
  );
  const awaitingResubmission = Boolean(
    officialSubmission &&
    (officialSubmission.submissionStatus === "awaiting-resubmission" || officialSubmission.withdrawn)
  );
  const resultHtml = activeOfficial
    ? `<div class="published-grade">
         <div class="published-grade-total">Official COG score: ${escapeHtml(officialSubmission.officialScorePercent)}%</div>
         <div class="cog-assignment-note">${escapeHtml(officialSubmission.earnedPoints)} / ${escapeHtml(officialSubmission.pointValue)} pts · receipt verified by YouTeach</div>
       </div>`
    : (awaitingResubmission
      ? '<div class="assignment-status warning">Submission undone · reopen the activity to submit a replacement.</div>'
      : '');

  return `
    <div class="cog-assignment-box">
      <strong>COG activity</strong>
      <div class="cog-assignment-config">
        <span>${escapeHtml(game?.name || config.gameId || "COG")}</span>
        <span>${escapeHtml(mode?.name || config.modeId || "Mode")}</span>
        <span>${escapeHtml(difficulty?.name || config.difficultyId || "Difficulty")}</span>
        <span>${escapeHtml(minimum)}</span>
        <span>${escapeHtml(points)} pts</span>
      </div>
      <div class="cog-assignment-note">
        Your assigned race and difficulty are locked by YouTeach. When official submission is enabled, the completed game will show Send to teacher.
      </div>
      ${resultHtml}
      <button class="cog-open-btn" type="button" data-open-cog-assignment="${escapeHtml(assignmentId)}">
        ${activeOfficial ? "Open activity again" : "Open COG activity"}
      </button>
      ${activeOfficial && assignment?.undoSubmissionEnabled !== false
        ? `<button class="undo-submission-btn" type="button" data-undo-cog-assignment="${escapeHtml(assignmentId)}">Undo Submission</button>`
        : ""
      }
      <div id="progress-${escapeHtml(assignmentId)}" class="progress-text"></div>
    </div>
  `;
}

function normalizeProjectCheckpoints(assignment) {
  return Object.entries(assignment?.projectCheckpoints || {})
    .map(([id, checkpoint]) => ({
      id,
      title: String(checkpoint?.title || "Checkpoint"),
      dueAt: Number(checkpoint?.dueAt || 0),
      instructions: String(checkpoint?.instructions || ""),
      requiredEvidenceTypes: Array.isArray(checkpoint?.requiredEvidenceTypes)
        ? checkpoint.requiredEvidenceTypes.map((value) => String(value))
        : Object.keys(checkpoint?.requiredEvidenceTypes || {}).filter((key) => checkpoint.requiredEvidenceTypes[key])
    }))
    .sort((a, b) => Number(a.dueAt || 0) - Number(b.dueAt || 0));
}

function evidenceTypeLabel(type) {
  if (type === "image") return "Photo";
  if (type === "video") return "Video";
  if (type === "document") return "Document";
  return "Evidence";
}

function checkpointAccept(types) {
  const accept = [];
  const set = new Set(types || []);
  if (set.has("image")) accept.push("image/*");
  if (set.has("video")) accept.push("video/*");
  if (set.has("document")) {
    accept.push(
      "application/pdf",
      ".doc",
      ".docx",
      ".ppt",
      ".pptx",
      ".xls",
      ".xlsx",
      ".txt"
    );
  }
  return accept.join(",");
}

function projectEvidenceEntries(assignmentId, checkpointId) {
  return Object.entries(projectEvidenceCache?.[assignmentId]?.[checkpointId] || {})
    .map(([id, evidence]) => ({ id, ...(evidence || {}) }))
    .sort((a, b) => Number(a.uploadedAt || 0) - Number(b.uploadedAt || 0));
}

function checkpointClosed(assignment, checkpoint) {
  if (isClosed(assignment)) return true;
  const dueAt = Number(checkpoint?.dueAt || 0);
  return dueAt > 0 && Date.now() > dueAt;
}

function projectProgressHtml(assignmentId, assignment, expanded) {
  if (!isProjectAssignment(assignment)) return "";

  const checkpoints = normalizeProjectCheckpoints(assignment);
  if (!checkpoints.length) {
    return expanded
      ? '<div class="project-progress-empty">No project checkpoints have been configured.</div>'
      : "";
  }

  const completed = checkpoints.filter((checkpoint) =>
    projectEvidenceEntries(assignmentId, checkpoint.id).length > 0
  ).length;

  if (!expanded) {
    return `<div class="project-progress-summary">Project progress · ${completed}/${checkpoints.length} checkpoints with evidence</div>`;
  }

  return `
    <section class="student-project-progress">
      <div class="student-project-progress-head">
        <strong>Project progress checkpoints</strong>
        <span>${completed}/${checkpoints.length} with evidence</span>
      </div>
      <div class="student-project-checkpoints">
        ${checkpoints.map((checkpoint) => {
          const evidence = projectEvidenceEntries(assignmentId, checkpoint.id);
          const closed = checkpointClosed(assignment, checkpoint);
          const typeText = checkpoint.requiredEvidenceTypes.map(evidenceTypeLabel).join(", ");
          return `
            <article class="student-project-checkpoint">
              <div class="student-project-checkpoint-head">
                <div>
                  <strong>${escapeHtml(checkpoint.title)}</strong>
                  <span>Due ${escapeHtml(formatDate(checkpoint.dueAt))} · ${escapeHtml(typeText)}</span>
                </div>
                <span class="checkpoint-state ${closed ? "closed" : "open"}">${closed ? "Closed" : "Open"}</span>
              </div>
              ${checkpoint.instructions ? `<div class="student-project-checkpoint-instructions">${escapeHtml(checkpoint.instructions)}</div>` : ""}
              <div class="student-project-evidence-list">
                ${evidence.length
                  ? evidence.map((item, index) => `
                      <div class="student-project-evidence">
                        <a href="${escapeHtml(item.driveFileUrl || "#")}" target="_blank" rel="noopener">
                          ${escapeHtml(item.originalFileName || `Evidence ${index + 1}`)}
                        </a>
                        <span>${escapeHtml(evidenceTypeLabel(item.evidenceType))} · ${item.reviewStatus === "reviewed" ? "Reviewed" : "Pending review"}</span>
                        ${item.teacherNote ? `<small>Teacher: ${escapeHtml(item.teacherNote)}</small>` : ""}
                      </div>
                    `).join("")
                  : '<div class="student-project-evidence-empty">No evidence uploaded yet.</div>'
                }
              </div>
              <div class="student-project-upload">
                <input
                  id="project-file-${assignmentId}-${checkpoint.id}"
                  type="file"
                  accept="${escapeHtml(checkpointAccept(checkpoint.requiredEvidenceTypes))}"
                  data-project-evidence-file
                  data-assignment-id="${escapeHtml(assignmentId)}"
                  data-checkpoint-id="${escapeHtml(checkpoint.id)}"
                  ${closed ? "disabled" : ""}
                >
                <label
                  class="file-picker-label ${closed ? "disabled" : ""}"
                  for="project-file-${assignmentId}-${checkpoint.id}"
                >Choose evidence</label>
                <span class="file-name" id="project-file-name-${assignmentId}-${checkpoint.id}">No file</span>
                <button
                  type="button"
                  data-upload-project-evidence
                  data-assignment-id="${escapeHtml(assignmentId)}"
                  data-checkpoint-id="${escapeHtml(checkpoint.id)}"
                  ${closed ? "disabled" : ""}
                >Upload evidence</button>
                <div class="progress-text" id="project-progress-${assignmentId}-${checkpoint.id}"></div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function gradingTotalForSubmission(submission) {
  const raw = submission?.grading?.totalScore;
  if (raw === null || raw === undefined || raw === "") return null;
  const total = Number(raw);
  return Number.isFinite(total) ? total : null;
}

function publishedGradeHtml(assignmentId, assignment, submission, expanded) {
  const total = gradingTotalForSubmission(submission);
  if (!submission?.gradePublished || total === null) return "";

  const criteria = assignmentRubricCriteria(assignment);
  const scores = submission?.grading?.criterionScores || {};
  const feedback = String(submission?.grading?.feedback || "").trim();

  return `
    <div class="published-grade ${expanded ? "expanded" : ""}">
      <div class="published-grade-total">Grade: ${escapeHtml(Number(total.toFixed(2)))} / 100</div>
      ${expanded && criteria.length ? `
        <div class="published-grade-breakdown">
          ${criteria.map((criterion, index) => {
            const id = String(criterion?.id || `criterion-${index + 1}`);
            const title = String(criterion?.title || criterion?.name || `Criterion ${index + 1}`);
            const max = Number(criterion?.maxPoints || criterion?.points || 0);
            const rawScore = scores?.[id];
            const score = Number(rawScore);
            return `
              <div class="published-grade-row">
                <span>${escapeHtml(title)}</span>
                <strong>${Number.isFinite(score) ? escapeHtml(Number(score.toFixed(2))) : "—"} / ${escapeHtml(max)}</strong>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}
      ${expanded && feedback ? `<div class="published-grade-feedback"><strong>Feedback:</strong> ${escapeHtml(feedback)}</div>` : ""}
      ${expanded && isExamAssignment(assignment) && submission?.examAnnotatedDriveFileId
        ? `<button
             type="button"
             class="open-graded-exam-btn"
             data-open-graded-exam="${escapeHtml(assignmentId)}"
           >Open graded exam PDF</button>`
        : ""
      }
    </div>
  `;
}

function assignmentApplies(assignment) {
  if (!currentStudent || !assignment) return false;

  const rawRecipients = assignment?.recipientStudentKeys;
  const recipientKeys = Array.isArray(rawRecipients)
    ? rawRecipients.map((value) => String(value || "")).filter(Boolean)
    : (rawRecipients && typeof rawRecipients === "object"
      ? Object.values(rawRecipients).map((value) => String(value || "")).filter(Boolean)
      : []);

  if (recipientKeys.length) {
    return recipientKeys.includes(String(studentKey));
  }

  const target = String(assignment.groupName || "ALL");
  const group = String(currentStudent.groupName || "GENERAL");
  return target === "ALL" || target === group;
}

function isClosed(assignment) {
  if (!assignment?.active) return true;
  const dueAt = Number(assignment.dueAt || 0);
  return dueAt > 0 && Date.now() > dueAt;
}

async function loadOwnSubmissions(assignments, token) {
  const next = {};
  for (const [assignmentId] of assignments) {
    const snap = await get(ref(db, `assignmentSubmissions/${assignmentId}/${studentKey}`));
    next[assignmentId] = snap.val() || null;
    if (token !== renderingToken) return;
  }
  submissionCache = next;
}

async function loadOwnCogResults(assignments, token) {
  const next = {};
  for (const [assignmentId, assignment] of assignments) {
    if (!isCogAssignment(assignment)) continue;
    try {
      const response = await fetch(`/api/cog-result-status?assignmentId=${encodeURIComponent(assignmentId)}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      next[assignmentId] = response.ok && data.ok ? (data.submission || null) : null;
    } catch (error) {
      console.warn("Could not load official COG result:", error);
      next[assignmentId] = null;
    }
    if (token !== renderingToken) return;
  }
  cogResultCache = next;
}

function wireOwnSubmissionListeners() {
  if (!currentStudent) return;

  const applicableIds = new Set(
    Object.entries(assignmentsCache || {})
      .filter(([, assignment]) => assignmentApplies(assignment))
      .map(([assignmentId]) => assignmentId)
  );

  for (const [assignmentId, unsubscribe] of submissionUnsubscribers.entries()) {
    if (!applicableIds.has(assignmentId)) {
      unsubscribe();
      submissionUnsubscribers.delete(assignmentId);
      delete submissionCache[assignmentId];
    }
  }

  for (const assignmentId of applicableIds) {
    if (submissionUnsubscribers.has(assignmentId)) continue;

    const unsubscribe = onValue(
      ref(db, `assignmentSubmissions/${assignmentId}/${studentKey}`),
      (snapshot) => {
        submissionCache[assignmentId] = snapshot.val() || null;
        renderAssignments();
      }
    );

    submissionUnsubscribers.set(assignmentId, unsubscribe);
  }
}

function wireOwnEvidenceListeners() {
  if (!currentStudent) return;

  const projectIds = new Set(
    Object.entries(assignmentsCache || {})
      .filter(([, assignment]) => assignmentApplies(assignment) && isProjectAssignment(assignment))
      .map(([assignmentId]) => assignmentId)
  );

  for (const [assignmentId, unsubscribe] of evidenceUnsubscribers.entries()) {
    if (!projectIds.has(assignmentId)) {
      unsubscribe();
      evidenceUnsubscribers.delete(assignmentId);
      delete projectEvidenceCache[assignmentId];
    }
  }

  for (const assignmentId of projectIds) {
    if (evidenceUnsubscribers.has(assignmentId)) continue;

    const unsubscribe = onValue(
      ref(db, `assignmentProjectEvidence/${assignmentId}/${studentKey}`),
      (snapshot) => {
        projectEvidenceCache[assignmentId] = snapshot.val() || {};
        renderAssignments();
      }
    );

    evidenceUnsubscribers.set(assignmentId, unsubscribe);
  }
}

function submissionRow(submission) {
  if (!submission?.driveFileId) return "";

  const total = gradingTotalForSubmission(submission);
  const hasGrade = total !== null;
  const reviewLabel = submission?.gradePublished && hasGrade
    ? "grade released"
    : (hasGrade ? "reviewed · grade not released" : "pending review");

  return `
    <div class="submission-row">
      <span>${escapeHtml(submission.driveFileName || "Submitted PDF")}</span>
      <span>${Math.max(1, Math.round(Number(submission.size || 0) / 1024))} KB · ${escapeHtml(reviewLabel)}</span>
    </div>
  `;
}

function hasSubmittedBefore(submission) {
  return Boolean(submission?.submittedAt || submission?.withdrawnAt);
}

function renderAssignments() {
  if (!currentStudent) return;

  const entries = Object.entries(assignmentsCache || {})
    .filter(([, assignment]) => assignmentApplies(assignment))
    .sort((a, b) => Number(b[1]?.createdAt || 0) - Number(a[1]?.createdAt || 0));

  if (!entries.length) {
    assignmentList.innerHTML = '<div class="empty-state">No assignments are available for your group.</div>';
    return;
  }

  assignmentList.innerHTML = entries.map(([assignmentId, assignment]) => {
    const submission = submissionCache[assignmentId];
    const cogSubmission = cogResultCache[assignmentId] || null;
    const cogAssignment = isCogAssignment(assignment);

    if (cogAssignment) {
      const closed = isClosed(assignment);
      const expanded = expandedAssignmentId === assignmentId;
      const instructions = visibleAssignmentInstructions(assignment.instructions) ||
        "Complete the assigned COG activity.";

      return `
        <article class="assignment-card ${expanded ? "expanded" : ""}" data-assignment-expand="${assignmentId}">
          <div class="assignment-code">${escapeHtml(assignment.code || "")}</div>
          <h3 title="${escapeHtml(assignment.title || "Assignment")}">${escapeHtml(assignment.title || "Assignment")}</h3>

          <div class="assignment-meta">
            <span class="assignment-chip">Due ${escapeHtml(formatCompactDate(assignment.dueAt))}</span>
            <span class="assignment-chip">${closed ? "Closed for official submission" : "Open"}</span>
          </div>

          <div class="assignment-instructions" title="${escapeHtml(instructions)}">${escapeHtml(instructions)}</div>

          <div class="assignment-status ${cogSubmission?.receiptStatus === "active" ? "ok" : "pending"}" id="status-${assignmentId}">
            ${cogSubmission?.receiptStatus === "active"
              ? `Official result submitted · ${escapeHtml(cogSubmission.officialScorePercent)}%`
              : "COG activity · ready to open"}
          </div>

          ${cogAssignmentHtml(assignmentId, assignment)}
        </article>
      `;
    }

    const hasPdf = Boolean(submission?.driveFileId);
    const submittedBefore = hasSubmittedBefore(submission);
    const closed = isClosed(assignment);
    const expanded = expandedAssignmentId === assignmentId;
    const publishedTotal = gradingTotalForSubmission(submission);
    const hasInternalGrade = publishedTotal !== null;
    const statusText = hasPdf
      ? (submission?.gradePublished && hasInternalGrade
        ? `Grade released · ${Number(publishedTotal.toFixed(2))} / 100`
        : (hasInternalGrade ? "Reviewed · grade not released yet" : "Submitted · pending review"))
      : (submittedBefore ? "Submission undone · ready to submit again" : "Not submitted yet");
    const statusClass = hasPdf ? "ok" : (submittedBefore ? "warning" : "pending");

    return `
      <article class="assignment-card ${expanded ? "expanded" : ""}" data-assignment-expand="${assignmentId}">
        <div class="assignment-code">${escapeHtml(assignment.code || "")}</div>
        <h3 title="${escapeHtml(assignment.title || "Assignment")}">${escapeHtml(assignment.title || "Assignment")}</h3>

        <div class="assignment-meta">
          <span class="assignment-chip">Due ${escapeHtml(formatCompactDate(assignment.dueAt))}</span>
          <span class="assignment-chip">${closed ? "Closed" : "Open"}</span>
        </div>

        <div class="assignment-instructions" title="${escapeHtml(
          visibleAssignmentInstructions(assignment.instructions) || "Upload your completed work as one PDF file."
        )}">${escapeHtml(
          visibleAssignmentInstructions(assignment.instructions) || "Upload your completed work as one PDF file."
        )}</div>

        ${projectProgressHtml(assignmentId, assignment, expanded)}

        ${publishedGradeHtml(assignmentId, assignment, submission, expanded)}

        ${submissionRow(submission)}

        <div class="assignment-status ${statusClass}" id="status-${assignmentId}">
          ${statusText}
        </div>

        <div class="upload-box">
          <strong>${hasPdf ? "PDF submitted" : (submittedBefore ? "Submit replacement" : "Attach PDF")}</strong>

          ${!hasPdf ? `
            <div class="file-picker">
              <input
                id="file-${assignmentId}"
                type="file"
                accept="application/pdf,.pdf"
                ${closed ? "disabled" : ""}
              >
              <label
                class="file-picker-label ${closed ? "disabled" : ""}"
                for="file-${assignmentId}"
              >Choose PDF</label>
              <span class="file-name" id="file-name-${assignmentId}">No file</span>
            </div>

            <button
              class="upload-btn"
              data-upload-assignment="${assignmentId}"
              ${closed ? "disabled" : ""}
            >${submittedBefore ? "Submit Again" : "Submit PDF"}</button>
          ` : ""}

          ${hasPdf ? `
            <button
              class="undo-submission-btn"
              data-undo-assignment="${assignmentId}"
              ${closed ? "disabled" : ""}
            >Undo Submission</button>
          ` : ""}

          <div id="progress-${assignmentId}" class="progress-text"></div>
        </div>
      </article>
    `;
  }).join("");
}

async function refreshAssignments() {
  const token = ++renderingToken;
  const applicable = Object.entries(assignmentsCache || {}).filter(([, assignment]) => assignmentApplies(assignment));
  await Promise.all([
    loadOwnSubmissions(applicable, token),
    loadOwnCogResults(applicable, token)
  ]);
  if (token === renderingToken) renderAssignments();
}

async function handleUpload(assignmentId) {
  const assignment = assignmentsCache[assignmentId];
  const input = document.getElementById(`file-${assignmentId}`);
  const button = document.querySelector(`[data-upload-assignment="${assignmentId}"]`);
  const status = document.getElementById(`status-${assignmentId}`);
  const progress = document.getElementById(`progress-${assignmentId}`);

  if (!assignment || !input || !button || !currentStudent) return;
  if (isClosed(assignment)) {
    status.textContent = "This assignment is closed.";
    status.className = "assignment-status bad";
    return;
  }

  const file = input.files?.[0];
  if (!file) {
    status.textContent = "Attach a PDF first.";
    status.className = "assignment-status bad";
    return;
  }

  try {
    validateAssignmentPdf(file);
  } catch (error) {
    status.textContent = error.message;
    status.className = "assignment-status bad";
    return;
  }

  button.disabled = true;
  status.textContent = "Preparing Google Drive upload...";
  status.className = "assignment-status";

  try {
    const uploaded = await uploadAssignmentPdf({
      assignmentId,
      studentKey,
      externalId,
      file,
      onProgress: (ratio) => {
        progress.textContent = ratio >= 1
          ? "Upload complete."
          : `Uploading to Google Drive... ${Math.round(ratio * 100)}%`;
      }
    });

    input.value = "";
    status.textContent = "PDF submitted. Identity is pending review.";
    status.className = "assignment-status ok";
    await refreshAssignments();
  } catch (error) {
    console.error(error);
    progress.textContent = "";
    status.textContent = error?.message || "Could not upload the PDF.";
    status.className = "assignment-status bad";
  } finally {
    button.disabled = false;
  }
}

async function handleProjectEvidenceUpload(assignmentId, checkpointId) {
  const assignment = assignmentsCache[assignmentId];
  const checkpoint = normalizeProjectCheckpoints(assignment).find((item) => item.id === checkpointId);
  const input = document.getElementById(`project-file-${assignmentId}-${checkpointId}`);
  const button = document.querySelector(
    `[data-upload-project-evidence][data-assignment-id="${CSS.escape(assignmentId)}"][data-checkpoint-id="${CSS.escape(checkpointId)}"]`
  );
  const progress = document.getElementById(`project-progress-${assignmentId}-${checkpointId}`);

  if (!assignment || !checkpoint || !input || !button || !currentStudent) return;
  if (checkpointClosed(assignment, checkpoint)) {
    if (progress) progress.textContent = "This checkpoint is closed.";
    return;
  }

  const file = input.files?.[0];
  if (!file) {
    if (progress) progress.textContent = "Choose an evidence file first.";
    return;
  }

  try {
    validateProjectEvidence(file, checkpoint.requiredEvidenceTypes);
  } catch (error) {
    if (progress) progress.textContent = error.message;
    return;
  }

  button.disabled = true;
  if (progress) progress.textContent = "Uploading evidence...";

  try {
    await uploadProjectEvidence({
      assignmentId,
      studentKey,
      externalId,
      checkpointId,
      file,
      allowedTypes: checkpoint.requiredEvidenceTypes,
      onProgress: (ratio) => {
        if (!progress) return;
        progress.textContent = ratio >= 1
          ? "Evidence uploaded."
          : `Uploading evidence... ${Math.round(ratio * 100)}%`;
      }
    });
    input.value = "";
    const fileName = document.getElementById(`project-file-name-${assignmentId}-${checkpointId}`);
    if (fileName) fileName.textContent = "No file";
  } catch (error) {
    console.error(error);
    if (progress) progress.textContent = error?.message || "Could not upload project evidence.";
  } finally {
    button.disabled = false;
  }
}

async function handleUndoSubmission(assignmentId) {
  const assignment = assignmentsCache[assignmentId];
  const button = document.querySelector(`[data-undo-assignment="${assignmentId}"]`);
  const status = document.getElementById(`status-${assignmentId}`);
  const progress = document.getElementById(`progress-${assignmentId}`);

  if (!assignment || !button || !currentStudent) return;
  if (isClosed(assignment)) {
    status.textContent = "This assignment is closed.";
    status.className = "assignment-status bad";
    return;
  }

  button.disabled = true;
  progress.textContent = "Undoing submission...";

  try {
    await undoAssignmentPdf({
      assignmentId,
      studentKey,
      externalId
    });

    progress.textContent = "";
    status.textContent = "Submission undone. You can submit again.";
    status.className = "assignment-status warning";
    await refreshAssignments();
  } catch (error) {
    console.error(error);
    progress.textContent = "";
    status.textContent = error?.message || "Could not undo the submission.";
    status.className = "assignment-status bad";
    button.disabled = false;
  }
}

async function handleCogUndoSubmission(assignmentId) {
  const assignment = assignmentsCache[assignmentId];
  const button = document.querySelector(`[data-undo-cog-assignment="${CSS.escape(assignmentId)}"]`);
  const status = document.getElementById(`status-${assignmentId}`);
  const progress = document.getElementById(`progress-${assignmentId}`);
  if (!assignment || !button) return;

  if (isClosed(assignment)) {
    if (status) {
      status.textContent = "This assignment is closed.";
      status.className = "assignment-status bad";
    }
    return;
  }

  button.disabled = true;
  if (progress) progress.textContent = "Undoing official COG submission...";
  try {
    const response = await fetch("/api/cog-result-undo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ assignmentId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      throw new Error(data.error || "Could not undo the COG submission.");
    }
    if (progress) progress.textContent = "";
    await refreshAssignments();
  } catch (error) {
    console.error(error);
    if (progress) progress.textContent = error?.message || "Could not undo the COG submission.";
    button.disabled = false;
  }
}

assignmentList.addEventListener("change", (event) => {
  const projectInput = event.target.closest("[data-project-evidence-file]");
  if (projectInput) {
    const assignmentId = String(projectInput.dataset.assignmentId || "");
    const checkpointId = String(projectInput.dataset.checkpointId || "");
    const fileName = document.getElementById(`project-file-name-${assignmentId}-${checkpointId}`);
    if (fileName) fileName.textContent = projectInput.files?.[0]?.name || "No file";
    return;
  }

  const input = event.target.closest('input[type="file"][id^="file-"]');
  if (!input) return;
  const assignmentId = input.id.replace(/^file-/, "");
  const fileName = document.getElementById(`file-name-${assignmentId}`);
  if (fileName) fileName.textContent = input.files?.[0]?.name || "No file";
});

assignmentList.addEventListener("click", (event) => {
  const cogUndoButton = event.target.closest("[data-undo-cog-assignment]");
  if (cogUndoButton) {
    handleCogUndoSubmission(String(cogUndoButton.dataset.undoCogAssignment || ""));
    return;
  }

  const cogButton = event.target.closest("[data-open-cog-assignment]");
  if (cogButton) {
    const assignmentId = String(cogButton.dataset.openCogAssignment || "");
    const progress = document.getElementById(`progress-${assignmentId}`);
    if (!assignmentId) return;

    cogButton.disabled = true;
    if (progress) progress.textContent = "Opening assigned COG activity...";

    createCogAssignmentPracticeToken(assignmentId)
      .then((launchUrl) => {
        window.location.href = launchUrl;
      })
      .catch((error) => {
        console.error(error);
        if (progress) progress.textContent = error?.message || "Could not open the COG activity.";
        cogButton.disabled = false;
      });
    return;
  }

  const gradedExamButton = event.target.closest("[data-open-graded-exam]");
  if (gradedExamButton) {
    const assignmentId = gradedExamButton.dataset.openGradedExam;
    gradedExamButton.disabled = true;
    fetch("/api/exam-annotated-pdf-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId, studentKey, externalId })
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Could not open the graded exam.");
        }
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch((error) => {
        console.error(error);
        alert(error?.message || "Could not open the graded exam.");
      })
      .finally(() => {
        gradedExamButton.disabled = false;
      });
    return;
  }

  const projectUploadButton = event.target.closest("[data-upload-project-evidence]");
  if (projectUploadButton) {
    handleProjectEvidenceUpload(
      projectUploadButton.dataset.assignmentId,
      projectUploadButton.dataset.checkpointId
    );
    return;
  }

  const uploadButton = event.target.closest("[data-upload-assignment]");
  if (uploadButton) {
    handleUpload(uploadButton.dataset.uploadAssignment);
    return;
  }

  const undoButton = event.target.closest("[data-undo-assignment]");
  if (undoButton) {
    handleUndoSubmission(undoButton.dataset.undoAssignment);
    return;
  }

  if (event.target.closest("a,button,input,label,textarea,select")) return;

  const card = event.target.closest("[data-assignment-expand]");
  if (!card) return;

  expandedAssignmentId =
    expandedAssignmentId === card.dataset.assignmentExpand
      ? ""
      : card.dataset.assignmentExpand;
  renderAssignments();
});

logoutBtn.addEventListener("click", async () => {
  const reason = prompt("Reason for leaving (optional):", "") || "";
  await saveLeaveLog(studentKey, reason);
  clearStudentSession();
  window.location.href = "index.html";
});

onValue(ref(db, `students/${studentKey}`), async (snapshot) => {
  currentStudent = snapshot.val();
  if (!currentStudent) {
    clearStudentSession();
    window.location.href = "student.html";
    return;
  }

  const displayName = currentStudent.fullName || currentStudent.name || currentStudent.nickname || "Student";
  studentIdentity.textContent = currentStudent.nickname || displayName.split(" ")[0];
  studentAssignmentIdentity.textContent = `${displayName} · ${currentStudent.groupName || "GENERAL"}`;
  wireOwnSubmissionListeners();
  wireOwnEvidenceListeners();
  await refreshAssignments();
});

onValue(ref(db, "assignments"), async (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  wireOwnSubmissionListeners();
  wireOwnEvidenceListeners();
  await refreshAssignments();
});
