import { db } from "./firebase.js";
import { visibleGroups } from "./group-state.js";
import { ref, onValue, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName } from "./teacher-auth.js";
import { readAssignmentsModuleContext } from "./assignment-module-launcher.js?v=unsaved-close-20260922";
import { evaluationBlockNames, groupEvaluationConfig } from "./group-evaluation-model.js";
import {
  buildAssignmentEvaluationTarget,
  isExamAssignment,
  resolveAssignmentCriterion
} from "./assignment-evaluation-target.js";

if (!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const WORKING_GROUP_KEY = "youteachWorkingGroup";
const RUBRIC_MARKER = "\n\n[[YOUTEACH_RUBRIC_V1:";
const RUBRIC_END = "]]";

const PRESET_CRITERIA = [
  {
    key: "originality",
    title: "Originality",
    description: "The work shows the student's own development and is not merely copied or mechanically reproduced."
  },
  {
    key: "neatness",
    title: "Neatness",
    description: "The submission is clean, careful, orderly, and visually well presented."
  },
  {
    key: "analysis",
    title: "Analysis",
    description: "The student interprets, relates, explains, or evaluates the information rather than only reproducing it."
  },
  {
    key: "conclusions",
    title: "Conclusions",
    description: "The work includes clear conclusions that are consistent with the development and evidence presented."
  },
  {
    key: "completeness",
    title: "Complete work",
    description: "All requested sections, questions, steps, or components are included."
  },
  {
    key: "labeled-visuals",
    title: "Correctly labeled diagrams, tables, or drawings",
    description: "Required diagrams, tables, figures, or drawings are correctly identified and labeled."
  },
  {
    key: "required-format",
    title: "Compliance with requested format",
    description: "The submission follows the requested structure, presentation, and formatting requirements."
  }
];

const context = readAssignmentsModuleContext() || {};
const editingAssignmentId = context.mode === "edit" ? String(context.assignmentId || "") : "";

const assignmentType = document.getElementById("assignmentType");
const assignmentOtherTypeField = document.getElementById("assignmentOtherTypeField");
const assignmentOtherType = document.getElementById("assignmentOtherType");
const assignmentTitle = document.getElementById("assignmentTitle");
const assignmentGroup = document.getElementById("assignmentGroup");
const assignmentGroupDisplay = document.getElementById("assignmentGroupDisplay");
const assignmentGroupHelp = document.getElementById("assignmentGroupHelp");
const assignmentTargetField = document.getElementById("assignmentTargetField");
const assignmentTargetSelect = document.getElementById("assignmentTargetSelect");
const assignmentTargetHelp = document.getElementById("assignmentTargetHelp");
const assignmentEvaluationBlockField = document.getElementById("assignmentEvaluationBlockField");
const assignmentEvaluationBlock = document.getElementById("assignmentEvaluationBlock");
const assignmentEvaluationBlockHelp = document.getElementById("assignmentEvaluationBlockHelp");
const assignmentGroupCriterionField = document.getElementById("assignmentGroupCriterionField");
const assignmentGroupCriterion = document.getElementById("assignmentGroupCriterion");
const assignmentGroupCriterionHelp = document.getElementById("assignmentGroupCriterionHelp");
const assignmentEvaluationTargetSummary = document.getElementById("assignmentEvaluationTargetSummary");
const assignmentDueAt = document.getElementById("assignmentDueAt");
const assignmentCode = document.getElementById("assignmentCode");
const taskCodeStatus = document.getElementById("taskCodeStatus");
const assignmentInstructions = document.getElementById("assignmentInstructions");
const createPresetCriteria = document.getElementById("createPresetCriteria");
const createCriteriaRows = document.getElementById("createCriteriaRows");
const createCriteriaTotal = document.getElementById("createCriteriaTotal");
const createDistributionRadios = document.querySelectorAll('input[name="createDistribution"]');
const addCreateCriterionBtn = document.getElementById("addCreateCriterionBtn");
const assignmentEvaluationNotes = document.getElementById("assignmentEvaluationNotes");
const projectCheckpointBuilder = document.getElementById("projectCheckpointBuilder");
const projectCheckpointRows = document.getElementById("projectCheckpointRows");
const addProjectCheckpointBtn = document.getElementById("addProjectCheckpointBtn");
const createAssignmentBtn = document.getElementById("createAssignmentBtn");
const createAssignmentStatus = document.getElementById("createAssignmentStatus");
const createFromScratchBtn = document.getElementById("createFromScratchBtn");
const createFromLibraryBtn = document.getElementById("createFromLibraryBtn");
const assignmentLibraryPanel = document.getElementById("assignmentLibraryPanel");
const assignmentLibrarySearch = document.getElementById("assignmentLibrarySearch");
const assignmentLibraryTypeFilter = document.getElementById("assignmentLibraryTypeFilter");
const assignmentLibraryGroupFilter = document.getElementById("assignmentLibraryGroupFilter");
const assignmentLibrarySourceFilter = document.getElementById("assignmentLibrarySourceFilter");
const clearAssignmentLibraryFiltersBtn = document.getElementById("clearAssignmentLibraryFiltersBtn");
const assignmentLibraryList = document.getElementById("assignmentLibraryList");
const assignmentLibraryCount = document.getElementById("assignmentLibraryCount");
const assignmentLibraryStatus = document.getElementById("assignmentLibraryStatus");
const basedOnSource = document.getElementById("basedOnSource");
const basedOnSourceChip = document.getElementById("basedOnSourceChip");

let groupsCache = {};
let assignmentsCache = {};
let assignmentTemplatesCache = {};
let settingsCache = {};
let loadedLibrarySource = null;
let creationMode = "scratch";
let editingLoaded = false;
let editingHasSubmissions = false;
let draftAssignmentId = editingAssignmentId || push(ref(db, "assignments")).key || `assignment-${Date.now()}`;
let formDirty = false;

function postDirtyState(type) {
  if (window.parent === window) return;
  window.parent.postMessage({ type }, window.location.origin);
}

function markFormDirty() {
  if (formDirty) return;
  formDirty = true;
  postDirtyState("youteach:assignment-dirty");
}

function markFormClean() {
  formDirty = false;
  postDirtyState("youteach:assignment-clean");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function decodeRubricMetadata(encoded) {
  try {
    const binary = atob(String(encoded || ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) {
    return {};
  }
}

function splitStoredInstructions(value) {
  const raw = String(value || "");
  const markerIndex = raw.lastIndexOf(RUBRIC_MARKER);
  if (markerIndex < 0 || !raw.endsWith(RUBRIC_END)) {
    return { visibleInstructions: raw, rubric: {} };
  }

  const encoded = raw.slice(markerIndex + RUBRIC_MARKER.length, -RUBRIC_END.length);
  return {
    visibleInstructions: raw.slice(0, markerIndex).trim(),
    rubric: decodeRubricMetadata(encoded)
  };
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

function getAssignmentRubric(source = {}) {
  const parsed = splitStoredInstructions(source.instructions);
  const embedded = parsed.rubric || {};
  return {
    criteria: normalizeCriteria(source.evaluationCriteria || embedded.criteria || []),
    distribution: String(source.evaluationDistribution || embedded.distribution || "equal"),
    notes: String(source.evaluationNotes || embedded.notes || "")
  };
}

function reusableProjectCheckpoints(checkpoints) {
  const result = {};
  Object.entries(checkpoints || {}).forEach(([id, checkpoint]) => {
    if (!checkpoint || typeof checkpoint !== "object") return;
    result[id] = {
      title: String(checkpoint.title || ""),
      instructions: String(checkpoint.instructions || ""),
      requiredEvidenceTypes: Array.isArray(checkpoint.requiredEvidenceTypes)
        ? checkpoint.requiredEvidenceTypes.map(String)
        : ["image"]
    };
  });
  return result;
}

function reusableContentFromAssignment(assignment = {}) {
  const parsed = splitStoredInstructions(assignment.instructions);
  const rubric = getAssignmentRubric(assignment);
  return {
    title: String(assignment.title || ""),
    instructions: parsed.visibleInstructions,
    assignmentType: String(assignment.assignmentType || ""),
    assignmentTypeCode: String(assignment.assignmentTypeCode || ""),
    evaluationCriteria: rubric.criteria,
    evaluationDistribution: rubric.distribution,
    evaluationNotes: rubric.notes,
    projectCheckpoints: reusableProjectCheckpoints(assignment.projectCheckpoints),
    course: assignment.course,
    subject: assignment.subject,
    unit: assignment.unit,
    topic: assignment.topic,
    subtopic: assignment.subtopic,
    tags: Array.isArray(assignment.tags) ? assignment.tags : []
  };
}

function normalizeRecipientKeys(raw) {
  if (Array.isArray(raw)) return raw.map((value) => String(value || "")).filter(Boolean);
  if (raw && typeof raw === "object") {
    return Object.values(raw).map((value) => String(value || "")).filter(Boolean);
  }
  return [];
}

function generatedTeams() {
  const rawTeams = Array.isArray(context?.teams) ? context.teams : [];
  return rawTeams.map((team) => ({
    label: String(team?.label || "").trim(),
    memberKeys: [...new Set(normalizeRecipientKeys(team?.memberKeys))]
  })).filter((team) => team.label && team.memberKeys.length);
}

function hasGeneratedTeamContext() {
  return context?.source === "team-creator" && generatedTeams().length > 0;
}

function getWorkingGroup() {
  const contextGroup = String(context?.groupName || "").trim();
  if (contextGroup) return contextGroup;
  return String(
    sessionStorage.getItem(WORKING_GROUP_KEY) ||
    localStorage.getItem(WORKING_GROUP_KEY) ||
    ""
  ).trim();
}

function selectedGeneratedTarget() {
  const teams = generatedTeams();
  const value = String(assignmentTargetSelect.value || "all-generated");
  const selected = value === "all-generated"
    ? teams
    : teams.filter((team) => team.label === value);

  return {
    value,
    label: value === "all-generated" ? "All Generated Teams" : value,
    teamLabels: selected.map((team) => team.label),
    memberKeys: [...new Set(selected.flatMap((team) => team.memberKeys))]
  };
}

function assignmentTargetMetadata() {
  if (!hasGeneratedTeamContext()) return {};
  const target = selectedGeneratedTarget();
  return {
    recipientMode: "generated-teams",
    recipientStudentKeys: target.memberKeys,
    recipientTeamLabels: target.teamLabels,
    recipientTeamTarget: target.label,
    sourceBuzzerSessionCreatedAt: Number(context?.sessionCreatedAt || 0)
  };
}

function renderTargetOptions() {
  if (!hasGeneratedTeamContext()) {
    assignmentTargetField.hidden = true;
    return;
  }

  const teams = generatedTeams();
  const previous = assignmentTargetSelect.value || "all-generated";

  assignmentTargetField.hidden = false;
  assignmentTargetSelect.innerHTML =
    '<option value="all-generated">All Generated Teams</option>' +
    teams.map((team) =>
      `<option value="${escapeHtml(team.label)}">${escapeHtml(team.label)} · ${team.memberKeys.length} students</option>`
    ).join("");

  assignmentTargetSelect.value = teams.some((team) => team.label === previous)
    ? previous
    : "all-generated";

  const target = selectedGeneratedTarget();
  assignmentTargetHelp.textContent =
    `${target.label}: ${target.memberKeys.length} student${target.memberKeys.length === 1 ? "" : "s"}. Only students in the generated team selection receive it.`;
}

function availableGroups() {
  const names = new Set();
  Object.keys(groupsCache || {}).forEach((key) => {
    const clean = String(key || "").trim();
    if (clean) names.add(clean);
  });
  Object.values(groupsCache || {}).forEach((group) => {
    const name = String(group?.name || "").trim();
    if (name) names.add(name);
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

function renderEvaluationTargetOptions() {
  const groupName = String(assignmentGroup.value || "");
  const group = groupsCache?.[groupName] || null;
  const config = groupEvaluationConfig(group || {});
  const typeCode = selectedTypeCode();
  const exam = typeCode === "EX";
  const previousBlock = String(assignmentEvaluationBlock.value || "");
  const previousCriterion = String(assignmentGroupCriterion.value || "");

  if (!groupName || groupName === "ALL" || !group || !config.configured) {
    assignmentEvaluationBlock.innerHTML = '<option value="">Select block / unit</option>';
    assignmentEvaluationBlock.value = "";
    assignmentEvaluationBlock.disabled = true;
    assignmentGroupCriterion.innerHTML = exam
      ? '<option value="">Exam grading is handled separately</option>'
      : '<option value="">Select category</option>';
    assignmentGroupCriterion.value = "";
    assignmentGroupCriterion.disabled = true;
    assignmentEvaluationBlockHelp.textContent =
      groupName === "ALL"
        ? "Choose one specific group so the assignment can be linked to a block / unit."
        : "This group needs a valid evaluation setup before assignments can be graded.";
    assignmentGroupCriterionHelp.textContent = exam
      ? "Exams belong to a block / unit but do not use an assignment category."
      : "Choose a configured group to select its category.";
    assignmentEvaluationTargetSummary.textContent =
      "Choose a specific group with a valid evaluation setup.";
    return;
  }

  const blocks = evaluationBlockNames(group);
  assignmentEvaluationBlock.disabled = false;
  assignmentEvaluationBlock.innerHTML = blocks
    .map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`)
    .join("");
  const preferredBlock = blocks.includes(previousBlock)
    ? previousBlock
    : (blocks.includes(settingsCache.activeBlock) ? settingsCache.activeBlock : blocks[0]);
  assignmentEvaluationBlock.value = preferredBlock || "";
  assignmentEvaluationBlockHelp.textContent =
    "Required. This determines which block or unit receives the assignment grade.";

  if (exam) {
    assignmentGroupCriterion.innerHTML =
      '<option value="">Exam grading is handled separately</option>';
    assignmentGroupCriterion.value = "";
    assignmentGroupCriterion.disabled = true;
    assignmentGroupCriterionHelp.textContent =
      "Exams are linked only to the selected block / unit.";
  } else {
    assignmentGroupCriterion.disabled = false;
    assignmentGroupCriterion.innerHTML =
      '<option value="">Select category</option>' +
      config.criteria.map((criterion) =>
        `<option value="${escapeHtml(criterion.id)}">${escapeHtml(criterion.name)} · ${criterion.weight}%</option>`
      ).join("");

    if (config.criteria.some((criterion) => criterion.id === previousCriterion)) {
      assignmentGroupCriterion.value = previousCriterion;
    } else {
      const automatic = resolveAssignmentCriterion(group, typeCode);
      assignmentGroupCriterion.value = automatic?.id || "";
    }

    assignmentGroupCriterionHelp.textContent =
      "Required. YouTeach remembers the selected criterion as the default for this assignment type in this group.";
  }

  const criterion = config.criteria.find((item) => item.id === assignmentGroupCriterion.value) || null;
  assignmentEvaluationTargetSummary.textContent = exam
    ? `This exam will contribute to: ${preferredBlock || "No block selected"}.`
    : criterion
      ? `This assignment will contribute to: ${preferredBlock || "No block selected"} → ${criterion.name} (${criterion.weight}%).`
      : `Select the category for ${preferredBlock || "this block / unit"}.`;
}

function renderGroupOptions() {
  const workingGroup = getWorkingGroup();
  assignmentGroup.value = workingGroup || "";
  assignmentGroupDisplay.textContent = workingGroup || "No active group";
  assignmentGroupHelp.textContent = workingGroup
    ? "Change the working group from the group button beside the teacher name."
    : "Select a working group before creating an assignment.";
  renderTargetOptions();
  renderEvaluationTargetOptions();
  refreshAutomaticTaskCode();
}

function compactInitials(value, max = 3) {
  const words = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, max);
  return words.map((word) => word[0]).join("").slice(0, max);
}

function compactTitleCode(value) {
  const words = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 6);
  return words.slice(0, 2).map((word) => word.slice(0, 3)).join("").slice(0, 6);
}

function compactGroupCode(value) {
  const tokens = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  if (!tokens.length) return "";
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token.length <= 3 || /\d/.test(token)) return token.slice(0, 6);
    return token.slice(0, 3);
  }

  const withDigit = tokens.find((token) => /\d/.test(token));
  if (withDigit) return withDigit.slice(0, 6);
  return tokens.map((token) => token[0]).join("").slice(0, 4);
}

function selectedTypeCode() {
  if (assignmentType.value !== "OTHER") return assignmentType.value;
  return compactInitials(assignmentOtherType.value, 3) || "OT";
}

function selectedTypeLabel() {
  if (assignmentType.value === "OTHER") {
    return assignmentOtherType.value.trim() || "Other";
  }
  const option = assignmentType.options[assignmentType.selectedIndex];
  return option?.textContent?.replace(/\s*\([^)]*\)\s*$/, "").trim() || assignmentType.value;
}

function generatedTeamCodePart() {
  if (!hasGeneratedTeamContext()) return "";
  const target = selectedGeneratedTarget();
  if (target.value === "all-generated") return "TMS";
  const number = target.label.match(/\d+/)?.[0];
  return number ? `T${number}` : (compactInitials(target.label, 3) || "TM");
}

function internalCodeSuffix(value = draftAssignmentId) {
  return String(value || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-5)
    .toUpperCase() || "NEW";
}

function taskCodeBase() {
  const typePart = selectedTypeCode();
  const titlePart = compactTitleCode(assignmentTitle.value);
  const groupPart = compactGroupCode(assignmentGroup.value);
  const teamPart = generatedTeamCodePart();
  const idPart = internalCodeSuffix();

  if (!typePart || !titlePart || !groupPart || !idPart) return "";
  return [typePart, titlePart, groupPart, teamPart, idPart].filter(Boolean).join("-");
}

function taskCodeExists(code) {
  const target = String(code || "").trim().toUpperCase();
  return Object.entries(assignmentsCache || {}).some(
    ([assignmentId, assignment]) =>
      assignmentId !== editingAssignmentId &&
      String(assignment?.code || "").trim().toUpperCase() === target
  );
}

function renderOtherTypeField() {
  const show = assignmentType.value === "OTHER";
  assignmentOtherTypeField.hidden = !show;
  assignmentOtherTypeField.style.display = show ? "grid" : "none";
  if (!show) assignmentOtherType.value = "";
}

function refreshAutomaticTaskCode() {
  renderOtherTypeField();
  if (editingAssignmentId && editingLoaded) {
    const existing = assignmentsCache?.[editingAssignmentId];
    assignmentCode.value = String(existing?.code || "");
    assignmentCode.readOnly = true;
    taskCodeStatus.textContent = "Task code locked while editing.";
    taskCodeStatus.style.color = "#64748b";
    return;
  }
  const code = taskCodeBase();
  assignmentCode.value = code;

  if (!code) {
    taskCodeStatus.textContent = "Complete type, name, and target to generate the code.";
    taskCodeStatus.style.color = "#64748b";
    return;
  }

  if (taskCodeExists(code)) {
    taskCodeStatus.textContent = "This task code already exists. Change the name, target, or type.";
    taskCodeStatus.style.color = "#b91c1c";
    return;
  }

  taskCodeStatus.textContent = "Available task code.";
  taskCodeStatus.style.color = "#166534";
}

function makeCriterionId() {
  return `criterion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function presetCardHtml(preset, selectedCriterion = null) {
  const checked = Boolean(selectedCriterion);
  const points = checked ? Number(selectedCriterion.maxPoints || 0) : "";
  return `
    <div class="preset-card" data-preset-key="${escapeHtml(preset.key)}">
      <label class="preset-main">
        <input type="checkbox" data-preset-enabled ${checked ? "checked" : ""}>
        <span class="preset-copy">
          <strong>${escapeHtml(preset.title)}</strong>
          <span>${escapeHtml(preset.description)}</span>
        </span>
      </label>
      <input class="preset-points" data-preset-points type="number" min="0.1" step="0.1"
        value="${checked && points > 0 ? escapeHtml(points) : ""}"
        aria-label="Points for ${escapeHtml(preset.title)}" ${checked ? "" : "disabled"}>
    </div>
  `;
}

function criterionRowHtml(criterion = {}) {
  return `
    <div class="criteria-row" data-criterion-id="${escapeHtml(criterion.id || makeCriterionId())}">
      <input data-criterion-title placeholder="Criterion" value="${escapeHtml(criterion.title || "")}">
      <textarea data-criterion-description placeholder="What should be evaluated?">${escapeHtml(criterion.description || "")}</textarea>
      <input data-criterion-points type="number" min="0.1" step="0.1" placeholder="Points" value="${Number(criterion.maxPoints || 0) > 0 ? escapeHtml(criterion.maxPoints) : ""}">
      <button class="criteria-remove" type="button" data-remove-criterion title="Remove criterion">×</button>
    </div>
  `;
}

function addCustomCriterionRow(criterion = {}) {
  createCriteriaRows.insertAdjacentHTML("beforeend", criterionRowHtml(criterion));
}

function renderRubricEditors(criteria = [], mode = "equal") {
  const normalized = normalizeCriteria(criteria);
  const presetMap = new Map(
    normalized
      .filter((criterion) => criterion.type === "preset" && criterion.presetKey)
      .map((criterion) => [criterion.presetKey, criterion])
  );
  const approvedPresetKeys = new Set(PRESET_CRITERIA.map((preset) => preset.key));
  const custom = normalized.filter(
    (criterion) => criterion.type !== "preset" || !approvedPresetKeys.has(criterion.presetKey)
  );

  createPresetCriteria.innerHTML = PRESET_CRITERIA.map((preset) =>
    presetCardHtml(preset, presetMap.get(preset.key) || null)
  ).join("");

  createCriteriaRows.innerHTML = "";
  if (custom.length) custom.forEach((criterion) => addCustomCriterionRow(criterion));
  else addCustomCriterionRow();

  createDistributionRadios.forEach((radio) => {
    radio.checked = radio.value === (mode === "manual" ? "manual" : "equal");
  });
  refreshDistribution();
}

function getDistributionMode() {
  return [...createDistributionRadios].find((radio) => radio.checked)?.value || "manual";
}

function activePointInputs() {
  const inputs = [];

  createPresetCriteria.querySelectorAll(".preset-card").forEach((card) => {
    if (!card.querySelector("[data-preset-enabled]")?.checked) return;
    const input = card.querySelector("[data-preset-points]");
    if (input) inputs.push(input);
  });

  createCriteriaRows.querySelectorAll(".criteria-row").forEach((row) => {
    const title = row.querySelector("[data-criterion-title]")?.value.trim() || "";
    if (!title) return;
    const input = row.querySelector("[data-criterion-points]");
    if (input) inputs.push(input);
  });

  return inputs;
}

function applyEqualDistribution() {
  const inputs = activePointInputs();

  createPresetCriteria.querySelectorAll(".preset-card").forEach((card) => {
    const enabled = card.querySelector("[data-preset-enabled]")?.checked;
    const input = card.querySelector("[data-preset-points]");
    if (!input) return;
    input.disabled = true;
    if (!enabled) input.value = "";
  });

  createCriteriaRows.querySelectorAll(".criteria-row").forEach((row) => {
    const title = row.querySelector("[data-criterion-title]")?.value.trim() || "";
    const input = row.querySelector("[data-criterion-points]");
    if (!input) return;
    input.disabled = true;
    if (!title) input.value = "";
  });

  if (!inputs.length) return;

  const totalHundredths = 10000;
  const base = Math.floor(totalHundredths / inputs.length);
  let remainder = totalHundredths - base * inputs.length;

  inputs.forEach((input) => {
    const hundredths = base + (remainder-- > 0 ? 1 : 0);
    input.value = (hundredths / 100).toFixed(2).replace(/\.00$/, "");
  });
}

function applyManualDistribution() {
  createPresetCriteria.querySelectorAll(".preset-card").forEach((card) => {
    const enabled = card.querySelector("[data-preset-enabled]")?.checked;
    const input = card.querySelector("[data-preset-points]");
    if (input) input.disabled = !enabled;
  });
  createCriteriaRows.querySelectorAll("[data-criterion-points]").forEach((input) => {
    input.disabled = false;
  });
}

function updateRubricTotal() {
  const activeCount = activePointInputs().length;
  const total = Number(activePointInputs()
    .reduce((sum, input) => sum + Math.max(0, Number(input.value || 0)), 0)
    .toFixed(2));

  createCriteriaTotal.textContent = `${total} / 100`;
  createCriteriaTotal.classList.remove("ok", "bad");
  if (activeCount) createCriteriaTotal.classList.add(Math.abs(total - 100) < 0.01 ? "ok" : "bad");
}

function refreshDistribution() {
  if (getDistributionMode() === "equal") applyEqualDistribution();
  else applyManualDistribution();
  updateRubricTotal();
}

function collectRubric() {
  const criteria = [];

  for (const card of createPresetCriteria.querySelectorAll(".preset-card")) {
    if (!card.querySelector("[data-preset-enabled]")?.checked) continue;
    const preset = PRESET_CRITERIA.find((item) => item.key === card.dataset.presetKey);
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

  for (const row of createCriteriaRows.querySelectorAll(".criteria-row")) {
    const title = row.querySelector("[data-criterion-title]")?.value.trim() || "";
    const description = row.querySelector("[data-criterion-description]")?.value.trim() || "";
    const pointsRaw = row.querySelector("[data-criterion-points]")?.value.trim() || "";
    if (!title && !description && !pointsRaw) continue;

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

function encodeRubricMetadata(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value || {}));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildStoredInstructions(visibleInstructions, rubric) {
  const visible = String(visibleInstructions || "").trim() ||
    "Upload your completed work as one PDF file.";
  return `${visible}${RUBRIC_MARKER}${encodeRubricMetadata(rubric)}${RUBRIC_END}`;
}

function makeCheckpointId() {
  return `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function checkpointRowHtml(checkpoint = {}) {
  const evidence = new Set(
    Array.isArray(checkpoint.requiredEvidenceTypes) && checkpoint.requiredEvidenceTypes.length
      ? checkpoint.requiredEvidenceTypes
      : ["image"]
  );
  return `
    <div class="project-checkpoint-row" data-project-checkpoint-row data-checkpoint-id="${escapeHtml(checkpoint.id || makeCheckpointId())}">
      <input type="text" data-checkpoint-title placeholder="Checkpoint title" value="${escapeHtml(checkpoint.title || "")}">
      <input type="datetime-local" data-checkpoint-due>
      <textarea data-checkpoint-instructions placeholder="What progress should the student show?">${escapeHtml(checkpoint.instructions || "")}</textarea>
      <div class="checkpoint-evidence-types">
        <label><input type="checkbox" data-checkpoint-evidence="image" ${evidence.has("image") ? "checked" : ""}> Photo</label>
        <label><input type="checkbox" data-checkpoint-evidence="video" ${evidence.has("video") ? "checked" : ""}> Video</label>
        <label><input type="checkbox" data-checkpoint-evidence="document" ${evidence.has("document") ? "checked" : ""}> Document</label>
      </div>
      <button type="button" class="remove-checkpoint-btn" data-remove-checkpoint>Remove</button>
    </div>
  `;
}

function addProjectCheckpointRow(checkpoint = {}) {
  projectCheckpointRows.insertAdjacentHTML("beforeend", checkpointRowHtml(checkpoint));
}

function refreshProjectCheckpointBuilder() {
  const projectSelected = assignmentType.value === "PJ";
  projectCheckpointBuilder.hidden = !projectSelected;
  if (projectSelected && !projectCheckpointRows.querySelector("[data-project-checkpoint-row]")) {
    addProjectCheckpointRow();
  }
}

function collectProjectCheckpoints(finalDueAt) {
  if (assignmentType.value !== "PJ") return { checkpoints: {}, error: "" };

  const rows = [...projectCheckpointRows.querySelectorAll("[data-project-checkpoint-row]")];
  const checkpoints = {};

  for (const [index, row] of rows.entries()) {
    const id = String(row.dataset.checkpointId || makeCheckpointId());
    const title = row.querySelector("[data-checkpoint-title]")?.value.trim() || "";
    const dueValue = row.querySelector("[data-checkpoint-due]")?.value || "";
    const dueAt = dueValue ? new Date(dueValue).getTime() : 0;
    const instructions = row.querySelector("[data-checkpoint-instructions]")?.value.trim() || "";
    const requiredEvidenceTypes = [...row.querySelectorAll("[data-checkpoint-evidence]:checked")]
      .map((input) => String(input.dataset.checkpointEvidence || ""))
      .filter(Boolean);

    if (!title) return { checkpoints: {}, error: `Checkpoint ${index + 1} needs a title.` };
    if (!dueAt || Number.isNaN(dueAt)) return { checkpoints: {}, error: `Checkpoint ${index + 1} needs a review date.` };
    if (finalDueAt && dueAt > finalDueAt) {
      return { checkpoints: {}, error: `Checkpoint ${index + 1} cannot be later than the final project due date.` };
    }
    if (!requiredEvidenceTypes.length) {
      return { checkpoints: {}, error: `Checkpoint ${index + 1} needs at least one evidence type.` };
    }

    checkpoints[id] = {
      title,
      dueAt,
      instructions,
      requiredEvidenceTypes,
      createdAt: Date.now()
    };
  }

  return { checkpoints, error: "" };
}

function libraryEntries() {
  const entries = [];

  Object.entries(assignmentsCache || {}).forEach(([id, assignment]) => {
    if (!assignment || typeof assignment !== "object") return;
    entries.push({
      key: `assignment:${id}`,
      kind: "assignment",
      id,
      title: String(assignment.title || "Untitled assignment"),
      type: String(assignment.assignmentTypeCode || assignment.assignmentType || ""),
      groupName: String(assignment.groupName || ""),
      createdAt: Number(assignment.createdAt || 0),
      usageCount: 1,
      content: reusableContentFromAssignment(assignment)
    });
  });

  Object.entries(assignmentTemplatesCache || {}).forEach(([id, template]) => {
    if (!template || typeof template !== "object" || template.archived) return;
    const content = template.content || {};
    entries.push({
      key: `template:${id}`,
      kind: "template",
      id,
      title: String(content.title || "Untitled library item"),
      type: String(content.assignmentTypeCode || content.assignmentType || ""),
      groupName: "",
      createdAt: Number(template.createdAt || 0),
      usageCount: Number(template.usageCount || 0),
      templateVersion: Number(template.version || 1),
      content: {
        ...content,
        instructions: splitStoredInstructions(content.instructions).visibleInstructions,
        evaluationCriteria: getAssignmentRubric(content).criteria,
        evaluationDistribution: getAssignmentRubric(content).distribution,
        evaluationNotes: getAssignmentRubric(content).notes,
        projectCheckpoints: reusableProjectCheckpoints(content.projectCheckpoints)
      }
    });
  });

  return entries.sort((a, b) => {
    const byDate = Number(b.createdAt || 0) - Number(a.createdAt || 0);
    return byDate || a.title.localeCompare(b.title);
  });
}

function replaceLibraryOptions(select, values, allLabel) {
  const previous = select.value;
  const unique = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  select.innerHTML =
    `<option value="">${escapeHtml(allLabel)}</option>` +
    unique.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (unique.includes(previous)) select.value = previous;
}

function renderAssignmentLibraryFilters() {
  const entries = libraryEntries();
  replaceLibraryOptions(assignmentLibraryTypeFilter, entries.map((entry) => entry.type), "All types");
  replaceLibraryOptions(assignmentLibraryGroupFilter, entries.map((entry) => entry.groupName), "All groups");
}

function filteredLibraryEntries() {
  const query = String(assignmentLibrarySearch.value || "").trim().toLocaleLowerCase();
  const type = String(assignmentLibraryTypeFilter.value || "").trim();
  const group = String(assignmentLibraryGroupFilter.value || "").trim();
  const source = String(assignmentLibrarySourceFilter.value || "").trim();

  return libraryEntries().filter((entry) => {
    if (type && entry.type !== type) return false;
    if (group && entry.groupName !== group) return false;
    if (source && entry.kind !== source) return false;
    if (!query) return true;

    const content = entry.content || {};
    const searchable = [
      entry.title,
      entry.type,
      entry.groupName,
      content.course,
      content.subject,
      content.unit,
      content.topic,
      content.subtopic,
      ...(Array.isArray(content.tags) ? content.tags : [])
    ].map((value) => String(value || "").toLocaleLowerCase()).join(" ");
    return searchable.includes(query);
  });
}

function renderAssignmentLibrary() {
  const entries = filteredLibraryEntries();
  assignmentLibraryCount.textContent = `${entries.length} item${entries.length === 1 ? "" : "s"}`;

  if (!entries.length) {
    assignmentLibraryList.innerHTML =
      '<div class="library-empty">No previous assignments match these filters.</div>';
    return;
  }

  assignmentLibraryList.innerHTML = entries.map((entry) => {
    const content = entry.content || {};
    const meta = [
      entry.kind === "assignment" ? entry.groupName : "",
      content.course,
      content.subject,
      content.unit,
      content.topic
    ].map((value) => String(value || "").trim()).filter(Boolean);

    const selected = loadedLibrarySource?.key === entry.key;
    return `
      <article class="library-card${selected ? " selected" : ""}" data-library-key="${escapeHtml(entry.key)}" role="button" tabindex="0" aria-pressed="${String(selected)}">
        <div class="library-card-head">
          <h3>${escapeHtml(entry.title)}</h3>
          <span class="library-kind">${entry.kind === "assignment" ? "Previous assignment" : "Saved library item"}</span>
        </div>
        <div class="library-meta">
          ${escapeHtml(entry.type || "Assignment")}${meta.length ? " · " + meta.map(escapeHtml).join(" · ") : ""}
        </div>
        <span class="library-use-label">Use</span>
      </article>
    `;
  }).join("");
}

function setCreationMode(mode, { reset = false } = {}) {
  creationMode = mode === "library" ? "library" : "scratch";
  const libraryMode = creationMode === "library";

  createFromScratchBtn.classList.toggle("active", !libraryMode);
  createFromScratchBtn.setAttribute("aria-pressed", String(!libraryMode));
  createFromLibraryBtn.classList.toggle("active", libraryMode);
  createFromLibraryBtn.setAttribute("aria-pressed", String(libraryMode));
  assignmentLibraryPanel.hidden = !libraryMode;

  if (reset && !libraryMode) resetReusableForm();
  if (libraryMode) {
    renderAssignmentLibraryFilters();
    renderAssignmentLibrary();
    assignmentLibraryStatus.textContent = loadedLibrarySource
      ? `Based on: ${loadedLibrarySource.title}`
      : "Choose a previous assignment or saved library item.";
  }
}

function resetReusableForm() {
  loadedLibrarySource = null;
  basedOnSource.hidden = true;
  basedOnSourceChip.textContent = "";
  assignmentType.value = "CT";
  assignmentOtherType.value = "";
  assignmentTitle.value = "";
  assignmentInstructions.value = "";
  assignmentEvaluationNotes.value = "";
  assignmentDueAt.value = "";
  projectCheckpointRows.innerHTML = "";
  renderRubricEditors([], "equal");
  renderOtherTypeField();
  refreshProjectCheckpointBuilder();
  refreshAutomaticTaskCode();
  setStatus("");
}

function findLibraryEntry(key) {
  return libraryEntries().find((entry) => entry.key === key) || null;
}

function loadLibraryEntry(key) {
  const entry = findLibraryEntry(key);
  if (!entry) return;

  const content = entry.content || {};
  const typeCode = String(content.assignmentTypeCode || "").trim().toUpperCase();
  const standardCodes = new Set(["CT", "HW", "EX", "PJ", "PC", "RS", "PT", "COG"]);

  if (standardCodes.has(typeCode)) {
    assignmentType.value = typeCode;
    assignmentOtherType.value = "";
  } else {
    assignmentType.value = "OTHER";
    assignmentOtherType.value = String(content.assignmentType || typeCode || "");
  }

  assignmentTitle.value = String(content.title || "");
  assignmentInstructions.value = splitStoredInstructions(content.instructions).visibleInstructions;
  const rubric = getAssignmentRubric(content);
  assignmentEvaluationNotes.value = rubric.notes || "";
  renderRubricEditors(rubric.criteria, rubric.distribution);

  assignmentDueAt.value = "";
  projectCheckpointRows.innerHTML = "";
  if (assignmentType.value === "PJ") {
    Object.entries(content.projectCheckpoints || {}).forEach(([id, checkpoint]) => {
      addProjectCheckpointRow({ id, ...(checkpoint || {}) });
    });
  }

  loadedLibrarySource = {
    key: entry.key,
    kind: entry.kind,
    id: entry.id,
    title: entry.title,
    templateVersion: entry.templateVersion || 1,
    content
  };

  basedOnSource.hidden = false;
  basedOnSourceChip.textContent = `Based on: ${entry.title}`;
  renderOtherTypeField();
  refreshProjectCheckpointBuilder();
  refreshAutomaticTaskCode();
  renderAssignmentLibrary();
  assignmentLibraryStatus.textContent = `Loaded: ${entry.title}. Review the target and optional due date.`;
  setStatus("Previous assignment loaded. Review it before creating the new assignment.", "ok");
  markFormDirty();
}

function toDateTimeLocal(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "";
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function loadEditingAssignmentIfReady() {
  if (!editingAssignmentId || editingLoaded) return;
  const assignment = assignmentsCache?.[editingAssignmentId];
  if (!assignment) return;

  const typeCode = String(assignment.assignmentTypeCode || "CT").toUpperCase();
  const standardCodes = new Set(["CT","HW","EX","PJ","PC","RS","PT","COG"]);
  assignmentType.value = standardCodes.has(typeCode) ? typeCode : "OTHER";
  assignmentOtherType.value = standardCodes.has(typeCode) ? "" : String(assignment.assignmentType || typeCode);
  assignmentType.disabled = true;
  assignmentOtherType.disabled = true;

  assignmentTitle.value = String(assignment.title || "");
  assignmentInstructions.value = splitStoredInstructions(assignment.instructions).visibleInstructions;
  assignmentEvaluationNotes.value = String(assignment.evaluationNotes || getAssignmentRubric(assignment).notes || "");
  assignmentDueAt.value = toDateTimeLocal(assignment.dueAt);
  assignmentGroup.value = String(assignment.groupName || getWorkingGroup() || "");
  assignmentGroupDisplay.textContent = assignmentGroup.value || "No active group";

  const rubric = getAssignmentRubric(assignment);
  renderRubricEditors(rubric.criteria, rubric.distribution);

  projectCheckpointRows.innerHTML = "";
  if (typeCode === "PJ") {
    Object.entries(assignment.projectCheckpoints || {}).forEach(([id, checkpoint]) => {
      addProjectCheckpointRow({ id, ...(checkpoint || {}) });
    });
  }

  renderOtherTypeField();
  refreshProjectCheckpointBuilder();
  renderEvaluationTargetOptions();
  if (assignment.evaluationBlock) assignmentEvaluationBlock.value = assignment.evaluationBlock;
  if (assignment.groupEvaluationCriterionId) assignmentGroupCriterion.value = assignment.groupEvaluationCriterionId;
  renderEvaluationTargetOptions();

  assignmentCode.value = String(assignment.code || "");
  assignmentCode.readOnly = true;
  createAssignmentBtn.textContent = "Save Assignment";
  document.getElementById("assignmentModuleTitle").textContent = "Edit Assignment";
  document.getElementById("assignmentModuleSubtitle").textContent = "Update this assignment. Its internal ID and Task Code stay stable.";
  document.querySelector(".creation-source-toggle").hidden = true;
  assignmentLibraryPanel.hidden = true;
  editingLoaded = true;
  refreshAutomaticTaskCode();

  if (editingHasSubmissions) {
    createPresetCriteria.querySelectorAll("input,button").forEach((control) => control.disabled = true);
    createCriteriaRows.querySelectorAll("input,textarea,button").forEach((control) => control.disabled = true);
    createDistributionRadios.forEach((control) => control.disabled = true);
    addCreateCriterionBtn.disabled = true;
  }
}

async function saveEditingAssignment() {
  const existing = assignmentsCache?.[editingAssignmentId];
  if (!existing) return setStatus("Assignment not found.", "bad");

  const title = assignmentTitle.value.trim();
  const groupName = String(existing.groupName || assignmentGroup.value || getWorkingGroup() || "");
  const evaluationBlock = String(assignmentEvaluationBlock.value || "");
  const groupConfig = groupEvaluationConfig(groupsCache?.[groupName] || {});
  const groupCriterion = groupConfig.criteria.find(
    (criterion) => criterion.id === String(assignmentGroupCriterion.value || "")
  ) || null;
  const dueAt = assignmentDueAt.value ? new Date(assignmentDueAt.value).getTime() : 0;
  const typeCode = String(existing.assignmentTypeCode || selectedTypeCode()).toUpperCase();
  const typeLabel = String(existing.assignmentType || selectedTypeLabel());
  const existingRubric = getAssignmentRubric(existing);
  const rubric = editingHasSubmissions ? existingRubric : collectRubric();

  if (!title) return setStatus("Enter an assignment name.", "bad");
  if (!groupName) return setStatus("Select a working group.", "bad");
  if (!evaluationBlock) return setStatus("Select the block / unit for this assignment.", "bad");
  if (typeCode !== "EX" && !groupCriterion) return setStatus("Select the category for this assignment.", "bad");
  if (rubric.error) return setStatus(rubric.error, "bad");

  const now = Date.now();
  const storedInstructions = buildStoredInstructions(assignmentInstructions.value.trim(), {
    schemaVersion: 1,
    assignmentType: typeLabel,
    assignmentTypeCode: typeCode,
    criteria: rubric.criteria,
    distribution: rubric.distribution || existing.evaluationDistribution || "equal",
    notes: assignmentEvaluationNotes.value.trim(),
    updatedAt: now
  });

  const patch = {
    internalId: String(existing.internalId || editingAssignmentId),
    title,
    instructions: storedInstructions,
    evaluationNotes: assignmentEvaluationNotes.value.trim(),
    dueAt,
    planning: !dueAt,
    active: dueAt
      ? (existing.planning ? true : Boolean(existing.active))
      : false,
    evaluationBlock,
    groupEvaluationCriterionId: groupCriterion?.id || "",
    groupEvaluationCriterionName: groupCriterion?.name || "",
    evaluationTarget: buildAssignmentEvaluationTarget({
      groupName,
      block: evaluationBlock,
      criterion: groupCriterion,
      assignment: existing
    }),
    [`evaluationTargets/${groupName}`]: buildAssignmentEvaluationTarget({
      groupName,
      block: evaluationBlock,
      criterion: groupCriterion,
      assignment: existing
    }),
    updatedAt: now,
    updatedBy: getTeacherName()
  };

  if (!editingHasSubmissions) {
    patch.evaluationCriteria = rubric.criteria;
    patch.evaluationDistribution = rubric.distribution || getDistributionMode();
    const project = collectProjectCheckpoints(dueAt);
    if (project.error) return setStatus(project.error, "bad");
    patch.projectCheckpoints = typeCode === "PJ" ? project.checkpoints : null;
  }

  createAssignmentBtn.disabled = true;
  setStatus("Saving...");
  try {
    await update(ref(db, `assignments/${editingAssignmentId}`), patch);
    if (typeCode !== "EX" && groupCriterion?.id) {
      await update(ref(db, `groups/${groupName}/assignmentCriterionDefaults`), {
        [typeCode]: groupCriterion.id
      });
    }
    setStatus("Assignment updated.", "ok");
    markFormClean();
    if (window.parent !== window) {
      window.parent.postMessage({
        type: "youteach:assignment-updated",
        assignmentId: editingAssignmentId,
        code: String(existing.code || "")
      }, window.location.origin);
    }
  } catch (error) {
    console.error(error);
    setStatus(error?.message ? `Could not update the assignment: ${error.message}` : "Could not update the assignment.", "bad");
  } finally {
    createAssignmentBtn.disabled = false;
  }
}

function setStatus(message, kind = "") {
  createAssignmentStatus.textContent = message;
  createAssignmentStatus.className = `status ${kind}`.trim();
}

async function createAssignment() {
  if (context.mode === "edit" && editingAssignmentId) return saveEditingAssignment();
  refreshDistribution();
  refreshAutomaticTaskCode();

  const title = assignmentTitle.value.trim();
  const typeCode = selectedTypeCode();
  const typeLabel = selectedTypeLabel();
  const groupName = assignmentGroup.value || "ALL";
  const evaluationBlock = String(assignmentEvaluationBlock.value || "");
  const groupCriterionId = String(assignmentGroupCriterion.value || "");
  const groupConfig = groupEvaluationConfig(groupsCache?.[groupName] || {});
  const groupCriterion = groupConfig.criteria.find((criterion) => criterion.id === groupCriterionId) || null;
  const dueAt = assignmentDueAt.value ? new Date(assignmentDueAt.value).getTime() : 0;
  const code = assignmentCode.value.trim().toUpperCase();
  const targetMetadata = assignmentTargetMetadata();
  const rubric = collectRubric();
  const evaluationDistribution = getDistributionMode();
  const evaluationNotes = assignmentEvaluationNotes.value.trim();

  if (!title) return setStatus("Enter an assignment name.", "bad");
  if (!groupName || groupName === "ALL") {
    return setStatus("Choose one specific group so this assignment can be linked to a block / unit.", "bad");
  }
  if (!groupConfig.configured) {
    return setStatus("This group needs a valid evaluation setup before creating graded assignments.", "bad");
  }
  if (!evaluationBlock) return setStatus("Select the block / unit for this assignment.", "bad");
  if (typeCode !== "EX" && !groupCriterion) {
    return setStatus("Select the category for this assignment.", "bad");
  }
  if (assignmentType.value === "OTHER" && !assignmentOtherType.value.trim()) {
    return setStatus("Specify the assignment type.", "bad");
  }

  if (hasGeneratedTeamContext() && !normalizeRecipientKeys(targetMetadata.recipientStudentKeys).length) {
    return setStatus("The selected generated team has no students.", "bad");
  }

  if (rubric.error) return setStatus(rubric.error, "bad");

  if (rubric.criteria.length) {
    const total = rubric.criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints || 0), 0);
    if (Math.abs(total - 100) >= 0.01) {
      return setStatus("Evaluation criteria must total exactly 100 points.", "bad");
    }
  }

  const project = collectProjectCheckpoints(dueAt);
  if (project.error) return setStatus(project.error, "bad");

  if (!code) return setStatus("Complete type, name, and target to generate the Task Code.", "bad");
  if (taskCodeExists(code)) return setStatus("That activity code already exists. Change the name, target, or type.", "bad");

  createAssignmentBtn.disabled = true;
  setStatus("Creating...");

  try {
    const now = Date.now();
    const target = ref(db, `assignments/${draftAssignmentId}`);
    const storedInstructions = buildStoredInstructions(assignmentInstructions.value.trim(), {
      schemaVersion: 1,
      assignmentType: typeLabel,
      assignmentTypeCode: typeCode,
      criteria: rubric.criteria,
      distribution: evaluationDistribution,
      notes: evaluationNotes,
      updatedAt: now
    });

    const payload = {
      internalId: draftAssignmentId,
      code,
      title,
      instructions: storedInstructions,
      assignmentType: typeLabel,
      assignmentTypeCode: typeCode,
      evaluationCriteria: rubric.criteria,
      evaluationDistribution,
      evaluationNotes,
      projectCheckpoints: typeCode === "PJ" ? project.checkpoints : null,
      ...(loadedLibrarySource?.kind === "assignment"
        ? { sourceAssignmentId: loadedLibrarySource.id }
        : {}),
      ...(loadedLibrarySource?.kind === "template"
        ? {
            templateId: loadedLibrarySource.id,
            templateVersion: Number(loadedLibrarySource.templateVersion || 1),
            templateSnapshot: loadedLibrarySource.content
          }
        : {}),
      groupName,
      evaluationBlock,
      groupEvaluationCriterionId: groupCriterion?.id || "",
      groupEvaluationCriterionName: groupCriterion?.name || "",
      evaluationTarget: buildAssignmentEvaluationTarget({
        groupName,
        block: evaluationBlock,
        criterion: groupCriterion,
        assignment: { assignmentTypeCode: typeCode, code }
      }),
      evaluationTargets: {
        [groupName]: buildAssignmentEvaluationTarget({
          groupName,
          block: evaluationBlock,
          criterion: groupCriterion,
          assignment: { assignmentTypeCode: typeCode, code }
        })
      },
      ...targetMetadata,
      dueAt,
      planning: !dueAt,
      active: Boolean(dueAt),
      storageProvider: "google-drive",
      createdAt: now,
      createdBy: getTeacherName()
    };

    await set(target, payload);

    if (typeCode !== "EX" && groupCriterion?.id) {
      await update(ref(db, `groups/${groupName}/assignmentCriterionDefaults`), {
        [typeCode]: groupCriterion.id
      });
    }

    if (loadedLibrarySource?.kind === "template" && assignmentTemplatesCache[loadedLibrarySource.id]) {
      const sourceTemplate = assignmentTemplatesCache[loadedLibrarySource.id];
      await update(ref(db, `assignmentTemplates/${loadedLibrarySource.id}`), {
        usageCount: Number(sourceTemplate.usageCount || 0) + 1,
        lastUsedAt: now,
        updatedAt: now,
        updatedBy: getTeacherName()
      });
    }

    setStatus(dueAt ? "Assignment created." : "Planning assignment created without a due date.", "ok");
    markFormClean();

    if (window.parent !== window) {
      window.parent.postMessage({
        type: "youteach:assignment-created",
        assignmentId: draftAssignmentId,
        code
      }, window.location.origin);
    }
  } catch (error) {
    console.error(error);
    setStatus(error?.message ? `Could not create the assignment: ${error.message}` : "Could not create the assignment.", "bad");
  } finally {
    createAssignmentBtn.disabled = false;
  }
}

createFromScratchBtn.addEventListener("click", () => {
  if (!editingAssignmentId) {
    draftAssignmentId = push(ref(db, "assignments")).key || `assignment-${Date.now()}`;
  }
  setCreationMode("scratch", { reset: true });
  markFormDirty();
});

createFromLibraryBtn.addEventListener("click", () => {
  setCreationMode("library");
});

assignmentLibrarySearch.addEventListener("input", renderAssignmentLibrary);
assignmentLibraryTypeFilter.addEventListener("change", renderAssignmentLibrary);
assignmentLibraryGroupFilter.addEventListener("change", renderAssignmentLibrary);
assignmentLibrarySourceFilter.addEventListener("change", renderAssignmentLibrary);
clearAssignmentLibraryFiltersBtn.addEventListener("click", () => {
  assignmentLibrarySearch.value = "";
  assignmentLibraryTypeFilter.value = "";
  assignmentLibraryGroupFilter.value = "";
  assignmentLibrarySourceFilter.value = "";
  renderAssignmentLibrary();
});

assignmentLibraryList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-library-key]");
  if (!card) return;
  loadLibraryEntry(String(card.dataset.libraryKey || ""));
});

assignmentLibraryList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-library-key]");
  if (!card) return;
  event.preventDefault();
  loadLibraryEntry(String(card.dataset.libraryKey || ""));
});

assignmentType.addEventListener("change", () => {
  renderOtherTypeField();
  refreshProjectCheckpointBuilder();
  renderEvaluationTargetOptions();
  refreshAutomaticTaskCode();
});
assignmentOtherType.addEventListener("input", refreshAutomaticTaskCode);
assignmentTitle.addEventListener("input", refreshAutomaticTaskCode);
assignmentEvaluationBlock.addEventListener("change", renderEvaluationTargetOptions);
assignmentGroupCriterion.addEventListener("change", () => {
  renderEvaluationTargetOptions();
  refreshAutomaticTaskCode();
});
assignmentTargetSelect.addEventListener("change", () => {
  renderTargetOptions();
  refreshAutomaticTaskCode();
});
assignmentDueAt.addEventListener("input", refreshAutomaticTaskCode);

createPresetCriteria.addEventListener("change", refreshDistribution);
createPresetCriteria.addEventListener("input", () => {
  if (getDistributionMode() === "manual") updateRubricTotal();
});
createCriteriaRows.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-criterion]");
  if (!remove) return;
  remove.closest(".criteria-row")?.remove();
  if (!createCriteriaRows.querySelector(".criteria-row")) addCustomCriterionRow();
  refreshDistribution();
});
createCriteriaRows.addEventListener("input", (event) => {
  if (event.target.matches("[data-criterion-title]")) refreshDistribution();
  else if (getDistributionMode() === "manual") updateRubricTotal();
});
createDistributionRadios.forEach((radio) => radio.addEventListener("change", refreshDistribution));
addCreateCriterionBtn.addEventListener("click", () => {
  addCustomCriterionRow();
  refreshDistribution();
  markFormDirty();
});

addProjectCheckpointBtn.addEventListener("click", () => {
  addProjectCheckpointRow();
  markFormDirty();
});
projectCheckpointRows.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-checkpoint]");
  if (!remove) return;
  remove.closest("[data-project-checkpoint-row]")?.remove();
  if (!projectCheckpointRows.querySelector("[data-project-checkpoint-row]")) addProjectCheckpointRow();
  markFormDirty();
});

createAssignmentBtn.addEventListener("click", createAssignment);

const assignmentEditorRoot = document.querySelector(".create-assignment-module");
assignmentEditorRoot?.addEventListener("input", markFormDirty);
assignmentEditorRoot?.addEventListener("change", markFormDirty);

renderOtherTypeField();
renderRubricEditors();
renderTargetOptions();
refreshProjectCheckpointBuilder();
setCreationMode("scratch");
markFormClean();

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = visibleGroups(snapshot.val() || {});
  renderGroupOptions();
});

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  refreshAutomaticTaskCode();
  renderAssignmentLibraryFilters();
  loadEditingAssignmentIfReady();
  if (creationMode === "library") renderAssignmentLibrary();
});

onValue(ref(db, "assignmentTemplates"), (snapshot) => {
  assignmentTemplatesCache = snapshot.val() || {};
  renderAssignmentLibraryFilters();
  if (creationMode === "library") renderAssignmentLibrary();
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  renderEvaluationTargetOptions();
  loadEditingAssignmentIfReady();
});

if (editingAssignmentId) {
  onValue(ref(db, `assignmentSubmissions/${editingAssignmentId}`), (snapshot) => {
    editingHasSubmissions = Object.values(snapshot.val() || {}).some(Boolean);
    if (editingLoaded && editingHasSubmissions) {
      createPresetCriteria.querySelectorAll("input,button").forEach((control) => control.disabled = true);
      createCriteriaRows.querySelectorAll("input,textarea,button").forEach((control) => control.disabled = true);
      createDistributionRadios.forEach((control) => control.disabled = true);
      addCreateCriterionBtn.disabled = true;
    }
  });
}
