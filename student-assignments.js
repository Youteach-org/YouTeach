import { db } from "./firebase.js";
import { ref, get, onValue, push, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";
import { uploadAssignmentPhoto } from "./assignment-storage.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey } = session;
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

function submissionRows(submission) {
  const files = Object.values(submission?.files || {}).sort((a, b) => Number(a.uploadedAt || 0) - Number(b.uploadedAt || 0));
  if (!files.length) return "";
  return `
    <div class="submission-list">
      ${files.map((file, index) => `
        <div class="submission-row">
          <span>Photo ${index + 1}: ${escapeHtml(file.fileName || "image")}</span>
          <span>${Math.max(1, Math.round(Number(file.size || 0) / 1024))} KB</span>
        </div>
      `).join("")}
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
    const fileCount = Object.keys(submission?.files || {}).length;
    const closed = isClosed(assignment);
    const statusText = fileCount
      ? `Submitted: ${fileCount} photo${fileCount === 1 ? "" : "s"}`
      : "Not submitted yet";

    return `
      <article class="assignment-card">
        <h3>${escapeHtml(assignment.title || "Assignment")}</h3>
        <div class="assignment-meta">
          <span class="assignment-chip">Group: ${escapeHtml(assignment.groupName || "ALL")}</span>
          <span class="assignment-chip">Due: ${escapeHtml(formatDate(assignment.dueAt))}</span>
          <span class="assignment-chip">${closed ? "Closed" : "Open"}</span>
        </div>
        <div class="assignment-instructions">${escapeHtml(assignment.instructions || "Upload clear photos of your work.")}</div>

        ${submissionRows(submission)}

        <div class="assignment-status ${fileCount ? "ok" : ""}" id="status-${assignmentId}">
          ${escapeHtml(statusText)}
        </div>

        <div class="upload-box">
          <strong>${fileCount ? "Add more photos" : "Submit photos"}</strong>
          <input
            id="files-${assignmentId}"
            data-assignment-id="${assignmentId}"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            ${closed ? "disabled" : ""}
          >
          <button
            class="upload-btn"
            data-upload-assignment="${assignmentId}"
            ${closed ? "disabled" : ""}
          >Upload selected photos</button>
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
  const input = document.getElementById(`files-${assignmentId}`);
  const button = document.querySelector(`[data-upload-assignment="${assignmentId}"]`);
  const status = document.getElementById(`status-${assignmentId}`);
  const progress = document.getElementById(`progress-${assignmentId}`);

  if (!assignment || !input || !button || !currentStudent) return;
  if (isClosed(assignment)) {
    status.textContent = "This assignment is closed.";
    status.className = "assignment-status bad";
    return;
  }

  const files = Array.from(input.files || []);
  if (!files.length) {
    status.textContent = "Choose at least one photo first.";
    status.className = "assignment-status bad";
    return;
  }
  if (files.length > 6) {
    status.textContent = "Upload a maximum of 6 files at a time.";
    status.className = "assignment-status bad";
    return;
  }

  button.disabled = true;
  status.textContent = "Preparing files...";
  status.className = "assignment-status";

  try {
    for (let index = 0; index < files.length; index += 1) {
      progress.textContent = `Uploading photo ${index + 1} of ${files.length}...`;
      const fileResult = await uploadAssignmentPhoto({
        assignmentId,
        studentKey,
        studentNumber: currentStudent.studentNumber || currentStudent.id || "",
        groupName: currentStudent.groupName || "GENERAL",
        file: files[index],
        index,
        onProgress: (ratio) => {
          progress.textContent = `Photo ${index + 1} of ${files.length}: ${Math.round(ratio * 100)}%`;
        }
      });

      const fileRef = push(ref(db, `assignmentSubmissions/${assignmentId}/${studentKey}/files`));
      await update(ref(db, `assignmentSubmissions/${assignmentId}/${studentKey}`), {
        studentKey,
        studentName: currentStudent.fullName || currentStudent.name || currentStudent.nickname || "Student",
        nickname: currentStudent.nickname || "",
        studentNumber: currentStudent.studentNumber || currentStudent.id || "",
        groupName: currentStudent.groupName || "GENERAL",
        assignmentId,
        assignmentTitle: assignment.title || "Assignment",
        submittedAt: submissionCache[assignmentId]?.submittedAt || Date.now(),
        updatedAt: Date.now(),
        reviewStatus: "pending",
        identityReviewStatus: "pending"
      });
      await update(fileRef, fileResult);
    }

    input.value = "";
    progress.textContent = "Upload complete.";
    status.textContent = "Your files were submitted successfully.";
    status.className = "assignment-status ok";
    await refreshAssignments();
  } catch (error) {
    console.error(error);
    progress.textContent = "";
    status.textContent = error?.message || "Could not upload the files.";
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
