import { db } from "./firebase.js";
import { ref, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";
import { uploadAssignmentPdf, validateAssignmentPdf } from "./assignment-storage.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey, externalId } = session;
const assignmentList = document.getElementById("assignmentList");
const studentIdentity = document.getElementById("studentIdentity");
const studentAssignmentIdentity = document.getElementById("studentAssignmentIdentity");
const logoutBtn = document.getElementById("logoutBtn");

let currentStudent = null;
let assignmentsCache = {};
let submissionCache = {};
let renderingToken = 0;

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

function submissionRow(submission) {
  if (!submission?.driveFileId) return "";
  return `
    <div class="submission-row">
      <span>${escapeHtml(submission.driveFileName || "Submitted PDF")}</span>
      <span>${Math.max(1, Math.round(Number(submission.size || 0) / 1024))} KB · pending review</span>
    </div>
  `;
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
    const closed = isClosed(assignment);

    return `
      <article class="assignment-card">
        <h3>${escapeHtml(assignment.code || "")} · ${escapeHtml(assignment.title || "Assignment")}</h3>
        <div class="assignment-meta">
          <span class="assignment-chip">Group: ${escapeHtml(assignment.groupName || "ALL")}</span>
          <span class="assignment-chip">Due: ${escapeHtml(formatDate(assignment.dueAt))}</span>
          <span class="assignment-chip">${closed ? "Closed" : "Open"}</span>
        </div>

        <div class="assignment-instructions">${escapeHtml(
          assignment.instructions || "Upload your completed work as one PDF file."
        )}</div>

        ${submissionRow(submission)}

        <div class="assignment-status ${hasPdf ? "ok" : ""}" id="status-${assignmentId}">
          ${hasPdf ? "Submitted · identity pending review" : "Not submitted yet"}
        </div>

        <div class="upload-box">
          <strong>${hasPdf ? "Replace submitted PDF" : "Attach PDF"}</strong>
          <input
            id="file-${assignmentId}"
            type="file"
            accept="application/pdf,.pdf"
            ${closed ? "disabled" : ""}
          >
          <button
            class="upload-btn"
            data-upload-assignment="${assignmentId}"
            ${closed ? "disabled" : ""}
          >${hasPdf ? "Replace PDF" : "Submit PDF"}</button>
          <div id="progress-${assignmentId}" style="margin-top:8px;color:#475569;font-size:13px"></div>
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

    const previous = submissionCache[assignmentId] || {};
    await update(ref(db, `assignmentSubmissions/${assignmentId}/${studentKey}`), {
      studentKey,
      studentName: currentStudent.fullName || currentStudent.name || currentStudent.nickname || "Student",
      nickname: currentStudent.nickname || "",
      studentNumber: currentStudent.studentNumber || currentStudent.id || "",
      groupName: currentStudent.groupName || "GENERAL",
      assignmentId,
      assignmentCode: assignment.code || "",
      assignmentTitle: assignment.title || "Assignment",
      submittedAt: previous.submittedAt || Date.now(),
      updatedAt: Date.now(),
      reviewStatus: "pending",
      identityReviewStatus: "pending",
      ...uploaded
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

assignmentList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-upload-assignment]");
  if (!button) return;
  handleUpload(button.dataset.uploadAssignment);
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
  await refreshAssignments();
});

onValue(ref(db, "assignments"), async (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  await refreshAssignments();
});
