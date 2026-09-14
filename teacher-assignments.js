import { db } from "./firebase.js";
import { ref, onValue, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

if (!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const PRESET_CRITERIA = [
  {
    key: "cleanliness",
    title: "Cleanliness / neatness",
    description: "Work is clean, orderly, and free of unnecessary marks.",
    defaultPoints: 1
  },
  {
    key: "handwritten",
    title: "Handwritten work",
    description: "Required work is completed by hand rather than typed or printed.",
    defaultPoints: 1
  },
  {
    key: "legibility",
    title: "Legibility",
    description: "Handwriting, labels, and annotations are easy to read.",
    defaultPoints: 1
  },
  {
    key: "completeness",
    title: "Complete work",
    description: "All requested sections, questions, steps, or components are included.",
    defaultPoints: 2
  },
  {
    key: "instructions",
    title: "Follows instructions",
    description: "Submission follows the specific instructions and requested format.",
    defaultPoints: 2
  },
  {
    key: "identification",
    title: "Identification visible",
    description: "Student name and required identifying information are clearly visible.",
    defaultPoints: 1
  },
  {
    key: "organization",
    title: "Organization",
    description: "Content is arranged in a logical, easy-to-follow order.",
    defaultPoints: 1
  },
  {
    key: "writing",
    title: "Spelling / writing quality",
    description: "Spelling, grammar, and wording are appropriate for the task.",
    defaultPoints: 1
  },
  {
    key: "bibliography",
    title: "Sources / bibliography",
    description: "Required sources, references, or bibliography are included and identifiable.",
    defaultPoints: 1
  }
];

const assignmentCode = document.getElementById("assignmentCode");
const assignmentTitle = document.getElementById("assignmentTitle");
const assignmentGroup = document.getElementById("assignmentGroup");
const assignmentInstructions = document.getElementById("assignmentInstructions");
const assignmentDueAt = document.getElementById("assignmentDueAt");
const createPresetCriteria = document.getElementById("createPresetCriteria");
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
const editPresetCriteria = document.getElementById("editPresetCriteria");
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
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
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
      type: criterion.type === "preset" ? "preset" : "custom",
      presetKey: String(criterion.presetKey || ""),
      title: String(criterion.title || criterion.name || "").trim(),
      description: String(criterion.description || "").trim(),
      maxPoints: Number(criterion.maxPoints || criterion.points || 0)
    }))
    .filter((criterion) => criterion.title || criterion.description || criterion.maxPoints);
}

function presetCardHtml(preset, selectedCriterion = null) {
  const checked = Boolean(selectedCriterion);
  const points = selectedCriterion?.maxPoints > 0
    ? selectedCriterion.maxPoints
    : preset.defaultPoints;

  return `
    <div class="preset-card" data-preset-key="${escapeHtml(preset.key)}">
      <label class="preset-main">
        <input type="checkbox" data-preset-enabled ${checked ? "checked" : ""}>
        <span class="preset-copy">
          <strong>${escapeHtml(preset.title)}</strong>
          <span>${escapeHtml(preset.description)}</span>
        </span>
      </label>
      <input
        class="preset-points"
        data-preset-points
        type="number"
        min="0.1"
        step="0.1"
        value="${escapeHtml(points)}"
        aria-label="Points for ${escapeHtml(preset.title)}"
        ${checked ? "" : "disabled"}
      >
    </div>
  `;
}

function renderPresetEditor(container, criteria = []) {
  const normalized = normalizeCriteria(criteria);
  const byKey = new Map(
    normalized
      .filter((criterion) => criterion.type === "preset" && criterion.presetKey)
      .map((criterion) => [criterion.presetKey, criterion])
  );

  container.innerHTML = PRESET_CRITERIA.map((preset) =>
    presetCardHtml(preset, byKey.get(preset.key) || null)
  ).join("");
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

function addCustomCriterionRow(container, criterion = {}) {
  container.insertAdjacentHTML("beforeend", criterionRowHtml(criterion));
}

function renderCustomEditor(container, criteria = []) {
  const custom = normalizeCriteria(criteria).filter((criterion) => criterion.type !== "preset");
  container.innerHTML = "";
  if (custom.length) {
    custom.forEach((criterion) => addCustomCriterionRow(container, criterion));
  } else {
    addCustomCriterionRow(container);
  }
}

function collectPresetCriteria(container) {
  const criteria = [];

  for (const card of container.querySelectorAll(".preset-card")) {
    const enabled = card.querySelector("[data-preset-enabled]")?.checked;
    if (!enabled) continue;

    const presetKey = String(card.dataset.presetKey || "");
    const preset = PRESET_CRITERIA.find((item) => item.key === presetKey);
    if (!preset) continue;

    const maxPoints = Number(card.querySelector("[data-preset-points]")?.value || 0);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return { error: `Enter points greater than 0 for "${preset.title}".`, criteria: [] };
    }

    criteria.push({
      id: `preset-${preset.key}`,
      type: "preset",
      presetKey: preset.key,
      title: preset.title,
      description: preset.description,
      maxPoints: Number(maxPoints.toFixed(2))
    });
  }

  return { error: "", criteria };
}

function collectCustomCriteria(container) {
  const criteria = [];

  for (const row of container.querySelectorAll(".criteria-row")) {
    const title = row.querySelector("[data-criterion-title]")?.value.trim() || "";
    const description = row.querySelector("[data-criterion-description]")?.value.trim() || "";
    const pointsRaw = row.querySelector("[data-criterion-points]")?.value.trim() || "";
    const isBlank = !title && !description && !pointsRaw;
    if (isBlank) continue;

    const maxPoints = Number(pointsRaw);
    if (!title) return { error: "Each custom criterion needs a name.", criteria: [] };
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return { error: `Enter points greater than 0 for "${title}".`, criteria: [] };
    }

    criteria.push({
      id: row.dataset.criterionId || makeCriterionId(),
      type: "custom",
      presetKey: "",
      title,
      description,
      maxPoints: Number(maxPoints.toFixed(2))
    });
  }

  return { error: "", criteria };
}

function collectRubric(presetContainer, customContainer) {
  const presetResult = collectPresetCriteria(presetContainer);
  if (presetResult.error) return presetResult;

  const customResult = collectCustomCriteria(customContainer);
  if (customResult.error) return customResult;

  return {
    error: "",
    criteria: [...presetResult.criteria, ...customResult.criteria]
  };
}

function rubricTotal(presetContainer, customContainer) {
  let total = 0;

  for (const card of presetContainer.querySelectorAll(".preset-card")) {
    if (!card.querySelector("[data-preset-enabled]")?.checked) continue;
    total += Math.max(0, Number(card.querySelector("[data-preset-points]")?.value || 0));
  }

  for (const input of customContainer.querySelectorAll("[data-criterion-points]")) {
    total += Math.max(0, Number(input.value || 0));
  }

  return Number(total.toFixed(2));
}

function updateRubricTotal(presetContainer, customContainer, totalElement) {
  totalElement.textContent = `Total points: ${rubricTotal(presetContainer, customContainer)}`;
}

function fillRubricEditor(presetContainer, customContainer, totalElement, criteria = []) {
  renderPresetEditor(presetContainer, criteria);
  renderCustomEditor(customContainer, criteria);
  updateRubricTotal(presetContainer, customContainer, totalElement);
}

function renderCriteriaGroup(title, criteria) {
  if (!criteria.length) return "";
  return `
    <div class="criteria-view-group">
      <h5>${escapeHtml(title)}</h5>
      ${criteria.map((criterion) => `
        <div class="criteria-view-item">
          <strong>${escapeHtml(criterion.title)} <span class="criteria-points">· ${escapeHtml(criterion.maxPoints)} pts</span></strong>
          ${criterion.description ? `<span>${escapeHtml(criterion.description)}</span>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderEvaluationCriteria(assignment) {
  const criteria = normalizeCriteria(assignment?.evaluationCriteria);
  const presets = criteria.filter((criterion) => criterion.type === "preset");
  const custom = criteria.filter((criterion) => criterion.type !== "preset");
  const notes = String(assignment?.evaluationNotes || "").trim();
  const total = criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints || 0), 0);

  if (!criteria.length && !notes) {
    criteriaReadOnly.innerHTML = '<div class="status-text">No evaluation criteria have been set.</div>';
    return;
  }

  const notesBlock = notes
    ? `<div class="criteria-view-item"><strong>Teacher grading notes</strong><span>${escapeHtml(notes)}</span></div>`
    : "";

  criteriaReadOnly.innerHTML = `
    ${renderCriteriaGroup("Preset criteria", presets)}
    ${renderCriteriaGroup("Custom criteria", custom)}
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
  const rubricResult = collectRubric(createPresetCriteria, createCriteriaRows);
  const evaluationNotes = assignmentEvaluationNotes.value.trim();

  if (rubricResult.error) {
    createAssignmentStatus.textContent = rubricResult.error;
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
      evaluationCriteria: rubricResult.criteria,
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
    fillRubricEditor(createPresetCriteria, createCriteriaRows, createCriteriaTotal, []);
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
  fillRubricEditor(
    editPresetCriteria,
    editCriteriaRows,
    editCriteriaTotal,
    assignment.evaluationCriteria
  );
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

  const result = collectRubric(editPresetCriteria, editCriteriaRows);
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

function wireRubricEditor(presetContainer, customContainer, totalElement) {
  presetContainer.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-preset-enabled]");
    if (checkbox) {
      const card = checkbox.closest(".preset-card");
      const pointsInput = card?.querySelector("[data-preset-points]");
      if (pointsInput) pointsInput.disabled = !checkbox.checked;
    }
    updateRubricTotal(presetContainer, customContainer, totalElement);
  });

  presetContainer.addEventListener("input", () => {
    updateRubricTotal(presetContainer, customContainer, totalElement);
  });

  customContainer.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-criterion]");
    if (!removeButton) return;
    removeButton.closest(".criteria-row")?.remove();
    if (!customContainer.querySelector(".criteria-row")) addCustomCriterionRow(customContainer);
    updateRubricTotal(presetContainer, customContainer, totalElement);
  });

  customContainer.addEventListener("input", () => {
    updateRubricTotal(presetContainer, customContainer, totalElement);
  });
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
addCreateCriterionBtn.addEventListener("click", () => {
  addCustomCriterionRow(createCriteriaRows);
  updateRubricTotal(createPresetCriteria, createCriteriaRows, createCriteriaTotal);
});
addEditCriterionBtn.addEventListener("click", () => {
  addCustomCriterionRow(editCriteriaRows);
  updateRubricTotal(editPresetCriteria, editCriteriaRows, editCriteriaTotal);
});
editCriteriaBtn.addEventListener("click", beginCriteriaEdit);
cancelCriteriaBtn.addEventListener("click", cancelCriteriaEdit);
saveCriteriaBtn.addEventListener("click", saveEvaluationCriteria);

wireRubricEditor(createPresetCriteria, createCriteriaRows, createCriteriaTotal);
wireRubricEditor(editPresetCriteria, editCriteriaRows, editCriteriaTotal);
fillRubricEditor(createPresetCriteria, createCriteriaRows, createCriteriaTotal, []);

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
