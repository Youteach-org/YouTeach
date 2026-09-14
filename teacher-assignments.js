import { db } from "./firebase.js";
import { ref, onValue, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

if (!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const assignmentTitle = document.getElementById("assignmentTitle");
const assignmentGroup = document.getElementById("assignmentGroup");
const assignmentInstructions = document.getElementById("assignmentInstructions");
const assignmentDueAt = document.getElementById("assignmentDueAt");
const createAssignmentBtn = document.getElementById("createAssignmentBtn");
const createAssignmentStatus = document.getElementById("createAssignmentStatus");
const teacherAssignmentList = document.getElementById("teacherAssignmentList");
const assignmentDetailEmpty = document.getElementById("assignmentDetailEmpty");
const assignmentDetail = document.getElementById("assignmentDetail");
const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const eligibleCount = document.getElementById("eligibleCount");
const submittedCount = document.getElementById("submittedCount");
const missingCount = document.getElementById("missingCount");
const submissionList = document.getElementById("submissionList");
const missingList = document.getElementById("missingList");
const downloadZipBtn = document.getElementById("downloadZipBtn");
const toggleAssignmentBtn = document.getElementById("toggleAssignmentBtn");
const zipStatus = document.getElementById("zipStatus");
const logoutBtn = document.getElementById("logoutBtn");
const teacherIdentity = document.getElementById("teacherIdentity");

let assignmentsCache = {};
let submissionsCache = {};
let studentsCache = {};
let groupsCache = {};
let selectedAssignmentId = "";

teacherIdentity.textContent = getTeacherName();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function safeFileSegment(value, fallback = "item") {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || fallback;
}

function formatDate(timestamp) {
  const value = Number(timestamp || 0);
  return value ? new Date(value).toLocaleString() : "No due date";
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function assignmentStudents(assignment) {
  const target = String(assignment?.groupName || "ALL");
  return Object.entries(studentsCache || {})
    .filter(([, student]) => target === "ALL" || String(student.groupName || "GENERAL") === target)
    .sort((a, b) => String(a[1]?.fullName || a[1]?.name || "").localeCompare(String(b[1]?.fullName || b[1]?.name || "")));
}

function assignmentSubmissions(assignmentId) {
  return submissionsCache?.[assignmentId] || {};
}

function renderGroupOptions() {
  const groups = Object.values(groupsCache || {})
    .map((group) => String(group?.name || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  assignmentGroup.innerHTML =
    '<option value="ALL">All groups</option>' +
    groups.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
}

function renderAssignmentList() {
  const entries = Object.entries(assignmentsCache || {})
    .sort((a, b) => Number(b[1]?.createdAt || 0) - Number(a[1]?.createdAt || 0));

  if (!entries.length) {
    teacherAssignmentList.innerHTML = '<div class="status-text">No assignments yet.</div>';
    selectedAssignmentId = "";
    renderDetail();
    return;
  }

  if (!selectedAssignmentId || !assignmentsCache[selectedAssignmentId]) {
    selectedAssignmentId = entries[0][0];
  }

  teacherAssignmentList.innerHTML = entries.map(([id, assignment]) => {
    const submissions = assignmentSubmissions(id);
    const count = Object.keys(submissions).length;
    return `
      <button class="assignment-item ${id === selectedAssignmentId ? "active" : ""}" data-assignment-select="${id}">
        <strong>${escapeHtml(assignment.title || "Assignment")}</strong>
        <span>${escapeHtml(assignment.groupName || "ALL")} · ${assignment.active ? "Open" : "Closed"} · ${count} submitted</span>
      </button>
    `;
  }).join("");

  renderDetail();
}

function renderDetail() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) {
    assignmentDetail.hidden = true;
    assignmentDetailEmpty.hidden = false;
    return;
  }

  assignmentDetail.hidden = false;
  assignmentDetailEmpty.hidden = true;

  const students = assignmentStudents(assignment);
  const submissions = assignmentSubmissions(selectedAssignmentId);
  const submittedKeys = new Set(Object.keys(submissions));
  const missing = students.filter(([studentKey]) => !submittedKeys.has(studentKey));

  detailTitle.textContent = assignment.title || "Assignment";
  detailMeta.textContent = `${assignment.groupName || "ALL"} · Due: ${formatDate(assignment.dueAt)} · ${assignment.active ? "Open" : "Closed"}`;
  eligibleCount.textContent = students.length;
  submittedCount.textContent = Object.keys(submissions).length;
  missingCount.textContent = missing.length;
  toggleAssignmentBtn.textContent = assignment.active ? "Close Assignment" : "Reopen Assignment";

  const submissionEntries = Object.entries(submissions)
    .sort((a, b) => String(a[1]?.studentName || "").localeCompare(String(b[1]?.studentName || "")));

  submissionList.innerHTML = submissionEntries.length
    ? submissionEntries.map(([studentKey, submission]) => {
        const files = Object.values(submission.files || {}).sort((a, b) => Number(a.uploadedAt || 0) - Number(b.uploadedAt || 0));
        return `
          <article class="submission-card">
            <h4>${escapeHtml(submission.studentName || "Student")}</h4>
            <div class="submission-meta">
              ${escapeHtml(submission.studentNumber || "No ID")} ·
              ${escapeHtml(submission.groupName || "")} ·
              ${files.length} photo${files.length === 1 ? "" : "s"} ·
              ${escapeHtml(formatDate(submission.updatedAt || submission.submittedAt))}
            </div>
            <div class="photo-links">
              ${files.map((file, index) => `<a href="${escapeHtml(file.downloadURL || "#")}" target="_blank" rel="noopener">Photo ${index + 1}</a>`).join("")}
            </div>
          </article>
        `;
      }).join("")
    : '<div class="status-text">No submissions yet.</div>';

  missingList.textContent = missing.length
    ? missing.map(([, student]) => student.fullName || student.name || student.nickname || "Student").join(", ")
    : "None";
}

async function createAssignment() {
  const title = assignmentTitle.value.trim();
  const groupName = assignmentGroup.value || "ALL";
  const instructions = assignmentInstructions.value.trim();
  const dueValue = assignmentDueAt.value;
  const dueAt = dueValue ? new Date(dueValue).getTime() : null;

  if (!title) {
    createAssignmentStatus.textContent = "Enter an assignment title.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  createAssignmentBtn.disabled = true;
  createAssignmentStatus.textContent = "Creating...";
  createAssignmentStatus.className = "status-text";

  try {
    const target = push(ref(db, "assignments"));
    await set(target, {
      title,
      groupName,
      instructions: instructions || "Upload clear photos of your work.",
      dueAt,
      active: true,
      createdAt: Date.now(),
      createdBy: getTeacherName()
    });

    selectedAssignmentId = target.key;
    assignmentTitle.value = "";
    assignmentInstructions.value = "";
    assignmentDueAt.value = "";
    createAssignmentStatus.textContent = "Assignment created.";
    createAssignmentStatus.className = "status-text ok";
  } catch (error) {
    console.error(error);
    createAssignmentStatus.textContent = "Could not create the assignment.";
    createAssignmentStatus.className = "status-text bad";
  } finally {
    createAssignmentBtn.disabled = false;
  }
}

async function toggleAssignment() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) return;
  await update(ref(db, `assignments/${selectedAssignmentId}`), {
    active: !assignment.active,
    updatedAt: Date.now()
  });
}

async function downloadZip() {
  const assignment = assignmentsCache[selectedAssignmentId];
  const submissions = assignmentSubmissions(selectedAssignmentId);
  const entries = Object.entries(submissions);

  if (!assignment || !entries.length) {
    zipStatus.textContent = "There are no submitted photos to download.";
    zipStatus.className = "status-text bad";
    return;
  }

  if (!window.JSZip) {
    zipStatus.textContent = "ZIP library did not load. Refresh the page and try again.";
    zipStatus.className = "status-text bad";
    return;
  }

  downloadZipBtn.disabled = true;
  zipStatus.textContent = "Preparing ZIP...";
  zipStatus.className = "status-text";

  try {
    const zip = new window.JSZip();
    const assignmentFolderName = safeFileSegment(assignment.title || "assignment");
    const folder = zip.folder(assignmentFolderName);

    const manifest = [[
      "studentNumber", "studentName", "groupName", "submittedAt", "updatedAt", "fileCount"
    ].join(",")];

    let totalFiles = 0;
    for (const [, submission] of entries) totalFiles += Object.keys(submission.files || {}).length;
    let completedFiles = 0;

    for (const [studentKey, submission] of entries) {
      const studentFolderName = [
        safeFileSegment(submission.studentName || "Student"),
        safeFileSegment(submission.studentNumber || studentKey)
      ].join("--");
      const studentFolder = folder.folder(studentFolderName);
      const files = Object.values(submission.files || {}).sort((a, b) => Number(a.uploadedAt || 0) - Number(b.uploadedAt || 0));

      manifest.push([
        csv(submission.studentNumber || ""),
        csv(submission.studentName || ""),
        csv(submission.groupName || ""),
        csv(submission.submittedAt ? new Date(submission.submittedAt).toISOString() : ""),
        csv(submission.updatedAt ? new Date(submission.updatedAt).toISOString() : ""),
        csv(files.length)
      ].join(","));

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file.downloadURL) continue;
        completedFiles += 1;
        zipStatus.textContent = `Downloading photo ${completedFiles} of ${totalFiles}...`;

        const response = await fetch(file.downloadURL);
        if (!response.ok) throw new Error(`Could not download a submitted photo (HTTP ${response.status}).`);
        const blob = await response.blob();

        const original = safeFileSegment(file.fileName || `photo-${index + 1}.jpg`);
        const archiveName = `${String(index + 1).padStart(2, "0")}-${original}`;
        studentFolder.file(archiveName, blob);
      }
    }

    folder.file("manifest.csv", manifest.join("\n"));
    folder.file("assignment-info.txt", [
      `Title: ${assignment.title || ""}`,
      `Group: ${assignment.groupName || "ALL"}`,
      `Due: ${assignment.dueAt ? new Date(assignment.dueAt).toISOString() : "None"}`,
      "",
      "Instructions:",
      assignment.instructions || ""
    ].join("\n"));

    zipStatus.textContent = "Compressing ZIP...";
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${assignmentFolderName}-submissions.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    zipStatus.textContent = `ZIP ready: ${entries.length} student submission${entries.length === 1 ? "" : "s"}.`;
    zipStatus.className = "status-text ok";
  } catch (error) {
    console.error(error);
    zipStatus.textContent = error?.message || "Could not build the ZIP.";
    zipStatus.className = "status-text bad";
  } finally {
    downloadZipBtn.disabled = false;
  }
}

teacherAssignmentList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-assignment-select]");
  if (!button) return;
  selectedAssignmentId = button.dataset.assignmentSelect;
  renderAssignmentList();
});

createAssignmentBtn.addEventListener("click", createAssignment);
toggleAssignmentBtn.addEventListener("click", toggleAssignment);
downloadZipBtn.addEventListener("click", downloadZip);
logoutBtn.addEventListener("click", logoutTeacher);

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderGroupOptions();
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderDetail();
});

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  renderAssignmentList();
});

onValue(ref(db, "assignmentSubmissions"), (snapshot) => {
  submissionsCache = snapshot.val() || {};
  renderAssignmentList();
});
