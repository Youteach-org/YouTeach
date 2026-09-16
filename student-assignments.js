import { db } from "./firebase.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";
import { uploadAssignmentPdf, undoAssignmentPdf, validateAssignmentPdf } from "./assignment-storage.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey, externalId } = session;
const RUBRIC_MARKER = "\n\n[[YOUTEACH_RUBRIC_V1:";
const RUBRIC_END = "]]";
const assignmentList = document.getElementById("assignmentList");
const studentIdentity = document.getElementById("studentIdentity");
const studentAssignmentIdentity = document.getElementById("studentAssignmentIdentity");
const logoutBtn = document.getElementById("logoutBtn");

let currentStudent = null;
let assignmentsCache = {};
let submissionCache = {};
let renderingToken = 0;
let expandedAssignmentId = "";
const submissionUnsubscribers = new Map();

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

function gradingTotalForSubmission(submission) {
  const raw = submission?.grading?.totalScore;
  if (raw === null || raw === undefined || raw === "") return null;
  const total = Number(raw);
  return Number.isFinite(total) ? total : null;
}

function publishedGradeHtml(assignment, submission, expanded) {
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
    </div>
  `;
}

function assignmentApplies(assignment) {
  if (!currentStudent || !assignment) return false;
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

        ${publishedGradeHtml(assignment, submission, expanded)}

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
  await loadOwnSubmissions(applicable, token);
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

assignmentList.addEventListener("change", (event) => {
  const input = event.target.closest('input[type="file"][id^="file-"]');
  if (!input) return;
  const assignmentId = input.id.replace(/^file-/, "");
  const fileName = document.getElementById(`file-name-${assignmentId}`);
  if (fileName) fileName.textContent = input.files?.[0]?.name || "No file";
});

assignmentList.addEventListener("click", (event) => {
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
  await refreshAssignments();
});

onValue(ref(db, "assignments"), async (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  wireOwnSubmissionListeners();
  await refreshAssignments();
});
