import { db } from "./firebase.js";
import { ref, onValue, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

if (!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const assignmentCode = document.getElementById("assignmentCode");
const assignmentTitle = document.getElementById("assignmentTitle");
const assignmentGroup = document.getElementById("assignmentGroup");
const assignmentInstructions = document.getElementById("assignmentInstructions");
const assignmentDueAt = document.getElementById("assignmentDueAt");
const createCriteriaRows = document.getElementById("createCriteriaRows");
const createCriteriaTotal = document.getElementById("createCriteriaTotal");
const addCreateCriterionBtn = document.getElementById("addCreateCriterionBtn");
const assignmentEvaluationNotes = document.getElementById("assignmentEvaluationNotes");
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
const openDriveFolderBtn = document.getElementById("openDriveFolderBtn");
const toggleAssignmentBtn = document.getElementById("toggleAssignmentBtn");
const driveStatus = document.getElementById("driveStatus");
const criteriaReadOnly = document.getElementById("criteriaReadOnly");
const editCriteriaBtn = document.getElementById("editCriteriaBtn");
const criteriaEditPanel = document.getElementById("criteriaEditPanel");
const editCriteriaRows = document.getElementById("editCriteriaRows");
const editCriteriaTotal = document.getElementById("editCriteriaTotal");
const editEvaluationNotes = document.getElementById("editEvaluationNotes");
const addEditCriterionBtn = document.getElementById("addEditCriterionBtn");
const saveCriteriaBtn = document.getElementById("saveCriteriaBtn");
const cancelCriteriaBtn = document.getElementById("cancelCriteriaBtn");
const criteriaSaveStatus = document.getElementById("criteriaSaveStatus");
const logoutBtn = document.getElementById("logoutBtn");
const teacherIdentity = document.getElementById("teacherIdentity");

let assignmentsCache = {};
let submissionsCache = {};
let studentsCache = {};
let groupsCache = {};
let selectedAssignmentId = "";
let selectedDriveFolderUrl = "";

teacherIdentity.textContent = getTeacherName();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function formatDate(timestamp) {
  const value = Number(timestamp || 0);
  return value ? new Date(value).toLocaleString() : "No due date";
}

function makeCriterionId() {
  return `criterion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCriteria(value) {
  const raw = Array.isArray(value) ? value : Object.values(value || {});
  return raw
    .filter(Boolean)
    .map((criterion, index) => ({
      id: String(criterion.id || `criterion-${index + 1}`),
      title: String(criterion.title || criterion.name || "").trim(),
      description: String(criterion.description || "").trim(),
      maxPoints: Number(criterion.maxPoints || criterion.points || 0)
    }))
    .filter((criterion) => criterion.title || criterion.description || criterion.maxPoints);
}

function criterionRowHtml(criterion = {}) {
  const id = criterion.id || makeCriterionId();
  const points = Number(criterion.maxPoints || 0);
  return `
    <div class="criteria-row" data-criterion-id="${escapeHtml(id)}">
      <input data-criterion-title placeholder="Criterion" value="${escapeHtml(criterion.title || "")}">
      <textarea data-criterion-description placeholder="What should be evaluated?">${escapeHtml(criterion.description || "")}</textarea>
      <input data-criterion-points type="number" min="0.1" step="0.1" placeholder="Points" value="${points > 0 ? escapeHtml(points) : ""}">
      <button class="criteria-remove" type="button" data-remove-criterion title="Remove criterion">×</button>
    </div>
  `;
}

function updateCriteriaTotal(container, totalElement) {
  const total = [...container.querySelectorAll("[data-criterion-points]")]
    .reduce((sum, input) => sum + Math.max(0, Number(input.value || 0)), 0);
  totalElement.textContent = `Total points: ${Number(total.toFixed(2))}`;
}

function addCriterionRow(container, totalElement, criterion = {}) {
  container.insertAdjacentHTML("beforeend", criterionRowHtml(criterion));
  updateCriteriaTotal(container, totalElement);
}

function fillCriteriaEditor(container, totalElement, criteria) {
  container.innerHTML = "";
  const normalized = normalizeCriteria(criteria);
  if (normalized.length) {
    normalized.forEach((criterion) => addCriterionRow(container, totalElement, criterion));
  } else {
    addCriterionRow(container, totalElement);
  }
}

function collectCriteria(container) {
  const criteria = [];
  for (const row of container.querySelectorAll(".criteria-row")) {
    const title = row.querySelector("[data-criterion-title]")?.value.trim() || "";
    const description = row.querySelector("[data-criterion-description]")?.value.trim() || "";
    const pointsRaw = row.querySelector("[data-criterion-points]")?.value.trim() || "";
    const isBlank = !title && !description && !pointsRaw;
    if (isBlank) continue;

    const maxPoints = Number(pointsRaw);
    if (!title) return { error: "Each evaluation criterion needs a name.", criteria: [] };
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return { error: `Enter points greater than 0 for "${title}".`, criteria: [] };
    }

    criteria.push({
      id: row.dataset.criterionId || makeCriterionId(),
      title,
      description,
      maxPoints: Number(maxPoints.toFixed(2))
    });
  }
  return { error: "", criteria };
}

function renderEvaluationCriteria(assignment) {
  const criteria = normalizeCriteria(assignment?.evaluationCriteria);
  const notes = String(assignment?.evaluationNotes || "").trim();
  const total = criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints || 0), 0);

  if (!criteria.length && !notes) {
    criteriaReadOnly.innerHTML = '<div class="status-text">No evaluation criteria have been set.</div>';
    return;
  }

  const items = criteria.map((criterion) => `
    <div class="criteria-view-item">
      <strong>${escapeHtml(criterion.title)} <span class="criteria-points">· ${escapeHtml(criterion.maxPoints)} pts</span></strong>
      ${criterion.description ? `<span>${escapeHtml(criterion.description)}</span>` : ""}
    </div>
  `).join("");

  const notesBlock = notes
    ? `<div class="criteria-view-item"><strong>Teacher grading notes</strong><span>${escapeHtml(notes)}</span></div>`
    : "";

  criteriaReadOnly.innerHTML = `
    ${items}
    ${notesBlock}
    <div class="criteria-total">Total points: ${Number(total.toFixed(2))}</div>
  `;
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
  const current = assignmentGroup.value;
  const groups = Object.values(groupsCache || {})
    .map((group) => String(group?.name || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  assignmentGroup.innerHTML =
    '<option value="ALL">All groups</option>' +
    groups.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

  if ([...assignmentGroup.options].some((option) => option.value === current)) {
    assignmentGroup.value = current;
  }
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
    const count = Object.values(submissions).filter((submission) => submission?.driveFileId).length;
    return `
      <button class="assignment-item ${id === selectedAssignmentId ? "active" : ""}" data-assignment-select="${id}">
        <strong>${escapeHtml(assignment.code || "")} · ${escapeHtml(assignment.title || "Assignment")}</strong>
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
    selectedDriveFolderUrl = "";
    return;
  }

  assignmentDetail.hidden = false;
  assignmentDetailEmpty.hidden = true;

  const students = assignmentStudents(assignment);
  const submissions = assignmentSubmissions(selectedAssignmentId);
  const validSubmissionEntries = Object.entries(submissions)
    .filter(([, submission]) => submission?.driveFileId)
    .sort((a, b) => String(a[1]?.studentName || "").localeCompare(String(b[1]?.studentName || "")));

  const submittedKeys = new Set(validSubmissionEntries.map(([studentKey]) => studentKey));
  const missing = students.filter(([studentKey]) => !submittedKeys.has(studentKey));

  selectedDriveFolderUrl =
    validSubmissionEntries.find(([, submission]) => submission.driveFolderUrl)?.[1]?.driveFolderUrl || "";
  openDriveFolderBtn.disabled = !selectedDriveFolderUrl;
  driveStatus.textContent = selectedDriveFolderUrl
    ? "PDFs are stored in the Google Drive folder for this task."
    : "The Drive folder is created automatically with the first PDF submission.";

  detailTitle.textContent = `${assignment.code || ""} · ${assignment.title || "Assignment"}`;
  detailMeta.textContent = `${assignment.groupName || "ALL"} · Due: ${formatDate(assignment.dueAt)} · ${assignment.active ? "Open" : "Closed"}`;
  eligibleCount.textContent = students.length;
  submittedCount.textContent = validSubmissionEntries.length;
  missingCount.textContent = missing.length;
  toggleAssignmentBtn.textContent = assignment.active ? "Close Assignment" : "Reopen Assignment";
  renderEvaluationCriteria(assignment);

  submissionList.innerHTML = validSubmissionEntries.length
    ? validSubmissionEntries.map(([, submission]) => `
        <article class="submission-card">
          <h4>${escapeHtml(submission.studentName || "Student")}</h4>
          <div class="submission-meta">
            ${escapeHtml(submission.studentNumber || "No ID")} ·
            ${escapeHtml(submission.groupName || "")} ·
            ${Math.max(1, Math.round(Number(submission.size || 0) / 1024))} KB ·
            ${escapeHtml(formatDate(submission.updatedAt || submission.submittedAt))}
          </div>
          <div class="review-chip">Identity pending review</div><br>
          <a class="pdf-link" href="${escapeHtml(submission.driveFileUrl || "#")}" target="_blank" rel="noopener">
            Open submitted PDF →
          </a>
        </article>
      `).join("")
    : '<div class="status-text">No PDF submissions yet.</div>';

  missingList.textContent = missing.length
    ? missing.map(([, student]) => student.fullName || student.name || student.nickname || "Student").join(", ")
    : "None";
}

async function createAssignment() {
  const code = assignmentCode.value.trim().toUpperCase();
  const title = assignmentTitle.value.trim();
  const groupName = assignmentGroup.value || "ALL";
  const instructions = assignmentInstructions.value.trim();
  const dueValue = assignmentDueAt.value;
  const dueAt = dueValue ? new Date(dueValue).getTime() : null;
  const criteriaResult = collectCriteria(createCriteriaRows);
  const evaluationNotes = assignmentEvaluationNotes.value.trim();

  if (criteriaResult.error) {
    createAssignmentStatus.textContent = criteriaResult.error;
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  if (!code || !title) {
    createAssignmentStatus.textContent = "Enter a task code and assignment title.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  const duplicate = Object.values(assignmentsCache).some(
    (assignment) => String(assignment?.code || "").trim().toUpperCase() === code
  );
  if (duplicate) {
    createAssignmentStatus.textContent = "That task code is already in use.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  createAssignmentBtn.disabled = true;
  createAssignmentStatus.textContent = "Creating...";
  createAssignmentStatus.className = "status-text";

  try {
    const target = push(ref(db, "assignments"));
    await set(target, {
      code,
      title,
      groupName,
      instructions: instructions || "Upload your completed work as one PDF file.",
      evaluationCriteria: criteriaResult.criteria,
      evaluationNotes,
      evaluationUpdatedAt: Date.now(),
      dueAt,
      active: true,
      storageProvider: "google-drive",
      createdAt: Date.now(),
      createdBy: getTeacherName()
    });

    selectedAssignmentId = target.key;
    assignmentCode.value = "";
    assignmentTitle.value = "";
    assignmentInstructions.value = "";
    assignmentEvaluationNotes.value = "";
    assignmentDueAt.value = "";
    fillCriteriaEditor(createCriteriaRows, createCriteriaTotal, []);
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

function beginCriteriaEdit() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) return;
  fillCriteriaEditor(editCriteriaRows, editCriteriaTotal, assignment.evaluationCriteria);
  editEvaluationNotes.value = assignment.evaluationNotes || "";
  criteriaSaveStatus.textContent = "";
  criteriaEditPanel.hidden = false;
}

function cancelCriteriaEdit() {
  criteriaEditPanel.hidden = true;
  criteriaSaveStatus.textContent = "";
}

async function saveEvaluationCriteria() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) return;

  const result = collectCriteria(editCriteriaRows);
  if (result.error) {
    criteriaSaveStatus.textContent = result.error;
    criteriaSaveStatus.className = "status-text bad";
    return;
  }

  saveCriteriaBtn.disabled = true;
  criteriaSaveStatus.textContent = "Saving...";
  criteriaSaveStatus.className = "status-text";

  try {
    await update(ref(db, `assignments/${selectedAssignmentId}`), {
      evaluationCriteria: result.criteria,
      evaluationNotes: editEvaluationNotes.value.trim(),
      evaluationUpdatedAt: Date.now(),
      updatedAt: Date.now()
    });
    criteriaSaveStatus.textContent = "Evaluation criteria saved.";
    criteriaSaveStatus.className = "status-text ok";
    criteriaEditPanel.hidden = true;
  } catch (error) {
    console.error(error);
    criteriaSaveStatus.textContent = "Could not save the evaluation criteria.";
    criteriaSaveStatus.className = "status-text bad";
  } finally {
    saveCriteriaBtn.disabled = false;
  }
}

teacherAssignmentList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-assignment-select]");
  if (!button) return;
  selectedAssignmentId = button.dataset.assignmentSelect;
  renderAssignmentList();
});

openDriveFolderBtn.addEventListener("click", () => {
  if (selectedDriveFolderUrl) window.open(selectedDriveFolderUrl, "_blank", "noopener");
});

createAssignmentBtn.addEventListener("click", createAssignment);
toggleAssignmentBtn.addEventListener("click", toggleAssignment);
addCreateCriterionBtn.addEventListener("click", () => addCriterionRow(createCriteriaRows, createCriteriaTotal));
addEditCriterionBtn.addEventListener("click", () => addCriterionRow(editCriteriaRows, editCriteriaTotal));
editCriteriaBtn.addEventListener("click", beginCriteriaEdit);
cancelCriteriaBtn.addEventListener("click", cancelCriteriaEdit);
saveCriteriaBtn.addEventListener("click", saveEvaluationCriteria);

for (const [container, totalElement] of [
  [createCriteriaRows, createCriteriaTotal],
  [editCriteriaRows, editCriteriaTotal]
]) {
  container.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-criterion]");
    if (!removeButton) return;
    removeButton.closest(".criteria-row")?.remove();
    if (!container.querySelector(".criteria-row")) addCriterionRow(container, totalElement);
    updateCriteriaTotal(container, totalElement);
  });
  container.addEventListener("input", () => updateCriteriaTotal(container, totalElement));
}

fillCriteriaEditor(createCriteriaRows, createCriteriaTotal, []);
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
