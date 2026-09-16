import { db } from "./firebase.js";
import { ref, onValue, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { QUESTION_TYPES, normalizeQuestion, validateQuestion, makeExamId } from "./exam-schema.js";

if (!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const questionForm = document.getElementById("questionForm");
const formTitle = document.getElementById("formTitle");
const formStatus = document.getElementById("formStatus");
const questionType = document.getElementById("questionType");
const pointValue = document.getElementById("pointValue");
const promptText = document.getElementById("promptText");
const courseText = document.getElementById("courseText");
const unitText = document.getElementById("unitText");
const topicText = document.getElementById("topicText");
const subtopicText = document.getElementById("subtopicText");
const difficultyText = document.getElementById("difficultyText");
const tagsText = document.getElementById("tagsText");
const rationaleText = document.getElementById("rationaleText");
const sourceNotesText = document.getElementById("sourceNotesText");
const multipleChoiceFields = document.getElementById("multipleChoiceFields");
const trueFalseFields = document.getElementById("trueFalseFields");
const matchingFields = document.getElementById("matchingFields");
const openResponseFields = document.getElementById("openResponseFields");
const optionsEditor = document.getElementById("optionsEditor");
const matchingEditor = document.getElementById("matchingEditor");
const trueFalseAnswer = document.getElementById("trueFalseAnswer");
const openAnswer = document.getElementById("openAnswer");
const addOptionBtn = document.getElementById("addOptionBtn");
const addMatchingBtn = document.getElementById("addMatchingBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const newQuestionBtn = document.getElementById("newQuestionBtn");
const questionList = document.getElementById("questionList");
const questionCount = document.getElementById("questionCount");
const filterSearch = document.getElementById("filterSearch");
const filterCourse = document.getElementById("filterCourse");
const filterUnit = document.getElementById("filterUnit");
const filterTopic = document.getElementById("filterTopic");
const filterType = document.getElementById("filterType");

let questions = {};
let editingId = "";

teacherIdentity.textContent = getTeacherName();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}

function addOption(value = "", correct = false) {
  const id = makeExamId("option");
  optionsEditor.insertAdjacentHTML("beforeend", `
    <div class="option-row" data-option-row>
      <input type="radio" name="correctOption" value="${escapeHtml(id)}" ${correct ? "checked" : ""} aria-label="Correct option">
      <input data-option-id="${escapeHtml(id)}" data-option-text value="${escapeHtml(value)}" placeholder="Option text">
      <button type="button" data-remove-option>Remove</button>
    </div>
  `);
}

function addPair(left = "", right = "") {
  matchingEditor.insertAdjacentHTML("beforeend", `
    <div class="matching-row" data-matching-row>
      <input data-match-left value="${escapeHtml(left)}" placeholder="Left item">
      <input data-match-right value="${escapeHtml(right)}" placeholder="Matching item">
      <button type="button" data-remove-pair>Remove</button>
    </div>
  `);
}

function refreshTypeFields() {
  const type = questionType.value;
  multipleChoiceFields.hidden = type !== QUESTION_TYPES.MULTIPLE_CHOICE;
  trueFalseFields.hidden = type !== QUESTION_TYPES.TRUE_FALSE;
  matchingFields.hidden = type !== QUESTION_TYPES.MATCHING;
  openResponseFields.hidden = type !== QUESTION_TYPES.OPEN_RESPONSE;
}

function resetForm() {
  editingId = "";
  questionForm.reset();
  pointValue.value = "1";
  questionType.value = QUESTION_TYPES.MULTIPLE_CHOICE;
  difficultyText.value = "unspecified";
  optionsEditor.innerHTML = "";
  matchingEditor.innerHTML = "";
  addOption("", true);
  addOption("");
  addOption("");
  addOption("");
  addPair();
  addPair();
  formTitle.textContent = "New Question";
  formStatus.textContent = "";
  cancelEditBtn.hidden = true;
  refreshTypeFields();
}

function formQuestion() {
  const optionRows = [...optionsEditor.querySelectorAll("[data-option-row]")];
  const options = optionRows.map((row) => row.querySelector("[data-option-text]")?.value.trim() || "");
  const checked = optionsEditor.querySelector('input[name="correctOption"]:checked');
  let correctIndex = null;
  if (checked) {
    const target = checked.value;
    correctIndex = optionRows.findIndex((row) => row.querySelector("[data-option-text]")?.dataset.optionId === target);
  }

  const pairs = [...matchingEditor.querySelectorAll("[data-matching-row]")].map((row) => ({
    left: row.querySelector("[data-match-left]")?.value.trim() || "",
    right: row.querySelector("[data-match-right]")?.value.trim() || ""
  }));

  let answerKey = "";
  if (questionType.value === QUESTION_TYPES.MULTIPLE_CHOICE) answerKey = correctIndex;
  if (questionType.value === QUESTION_TYPES.TRUE_FALSE) answerKey = trueFalseAnswer.value === "true";
  if (questionType.value === QUESTION_TYPES.MATCHING) answerKey = pairs.map((pair) => pair.right);
  if (questionType.value === QUESTION_TYPES.OPEN_RESPONSE) answerKey = openAnswer.value.trim();

  return normalizeQuestion({
    id: editingId || makeExamId("question"),
    type: questionType.value,
    prompt: promptText.value,
    options,
    matchingPairs: pairs,
    answerKey,
    pointValue: pointValue.value,
    course: courseText.value,
    unit: unitText.value,
    topic: topicText.value,
    subtopic: subtopicText.value,
    difficulty: difficultyText.value,
    tags: tagsText.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    rationale: rationaleText.value,
    sourceNotes: sourceNotesText.value,
    active: editingId ? questions?.[editingId]?.active !== false : true,
    createdAt: editingId ? questions?.[editingId]?.createdAt : Date.now(),
    updatedAt: Date.now()
  });
}

function questionTypeLabel(type) {
  return ({
    "multiple-choice":"Multiple choice",
    "true-false":"True / False",
    "matching":"Matching",
    "open-response":"Open response"
  })[type] || type;
}

function renderQuestions() {
  const search = filterSearch.value.trim().toLowerCase();
  const course = filterCourse.value.trim().toLowerCase();
  const unit = filterUnit.value.trim().toLowerCase();
  const topic = filterTopic.value.trim().toLowerCase();
  const type = filterType.value;

  const rows = Object.entries(questions)
    .map(([id, raw]) => [id, normalizeQuestion({ ...raw, id })])
    .filter(([, q]) => {
      const haystack = [q.prompt,q.course,q.unit,q.topic,q.subtopic,...q.tags].join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (course && !q.course.toLowerCase().includes(course)) return false;
      if (unit && !q.unit.toLowerCase().includes(unit)) return false;
      if (topic && !q.topic.toLowerCase().includes(topic)) return false;
      if (type && q.type !== type) return false;
      return true;
    })
    .sort((a,b) => Number(b[1].updatedAt || 0)-Number(a[1].updatedAt || 0));

  questionCount.textContent = String(rows.length);
  questionList.innerHTML = rows.length ? rows.map(([id,q]) => `
    <article class="question-card ${q.active ? "" : "archived"}">
      <div class="question-card-head">
        <h4>${escapeHtml(q.prompt || "Untitled question")}</h4>
        <span class="question-chip">${escapeHtml(q.pointValue)} pt${q.pointValue===1?"":"s"}</span>
      </div>
      <div class="question-meta">
        <span class="question-chip">${escapeHtml(questionTypeLabel(q.type))}</span>
        ${q.course ? `<span class="question-chip">${escapeHtml(q.course)}</span>` : ""}
        ${q.unit ? `<span class="question-chip">${escapeHtml(q.unit)}</span>` : ""}
        ${q.topic ? `<span class="question-chip">${escapeHtml(q.topic)}</span>` : ""}
        ${!q.active ? '<span class="question-chip">Archived</span>' : ""}
      </div>
      ${q.tags.length ? `<p>Tags: ${escapeHtml(q.tags.join(", "))}</p>` : ""}
      <div class="question-card-actions">
        <button type="button" data-edit-question="${escapeHtml(id)}">Edit</button>
        <button type="button" data-toggle-question="${escapeHtml(id)}">${q.active ? "Archive" : "Restore"}</button>
      </div>
    </article>
  `).join("") : '<div class="empty-state">No questions match these filters.</div>';
}

function editQuestion(id) {
  const q = normalizeQuestion({ ...(questions[id] || {}), id });
  editingId = id;
  questionType.value = q.type;
  pointValue.value = q.pointValue;
  promptText.value = q.prompt;
  courseText.value = q.course;
  unitText.value = q.unit;
  topicText.value = q.topic;
  subtopicText.value = q.subtopic;
  difficultyText.value = q.difficulty;
  tagsText.value = q.tags.join(", ");
  rationaleText.value = q.rationale;
  sourceNotesText.value = q.sourceNotes;
  optionsEditor.innerHTML = "";
  q.options.forEach((option,index) => addOption(option,index===q.answerKey));
  if (!q.options.length) { addOption("",true); addOption(""); }
  matchingEditor.innerHTML = "";
  q.matchingPairs.forEach((pair) => addPair(pair.left,pair.right));
  if (!q.matchingPairs.length) { addPair(); addPair(); }
  if (q.type === QUESTION_TYPES.TRUE_FALSE) trueFalseAnswer.value = q.answerKey ? "true" : "false";
  if (q.type === QUESTION_TYPES.OPEN_RESPONSE) openAnswer.value = String(q.answerKey || "");
  formTitle.textContent = "Edit Question";
  cancelEditBtn.hidden = false;
  formStatus.textContent = "";
  refreshTypeFields();
  window.scrollTo({top:0,behavior:"smooth"});
}

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { question, errors } = validateQuestion(formQuestion());
  if (errors.length) {
    formStatus.textContent = errors.join(" ");
    formStatus.className = "status-text bad";
    return;
  }
  formStatus.textContent = "Saving...";
  formStatus.className = "status-text";
  try {
    const id = editingId || question.id || push(ref(db,"examQuestionBank")).key;
    await set(ref(db,`examQuestionBank/${id}`), {
      ...question,
      id,
      updatedBy: getTeacherName()
    });
    formStatus.textContent = "Question saved.";
    formStatus.className = "status-text ok";
    resetForm();
  } catch (error) {
    console.error(error);
    formStatus.textContent = "Could not save question.";
    formStatus.className = "status-text bad";
  }
});

questionList.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-question]");
  if (edit) { editQuestion(edit.dataset.editQuestion); return; }
  const toggle = event.target.closest("[data-toggle-question]");
  if (!toggle) return;
  const id = toggle.dataset.toggleQuestion;
  const active = questions?.[id]?.active !== false;
  await update(ref(db,`examQuestionBank/${id}`), {
    active: !active,
    updatedAt: Date.now(),
    updatedBy: getTeacherName()
  });
});

optionsEditor.addEventListener("click", (event) => {
  const button=event.target.closest("[data-remove-option]");
  if (!button) return;
  button.closest("[data-option-row]")?.remove();
});
matchingEditor.addEventListener("click", (event) => {
  const button=event.target.closest("[data-remove-pair]");
  if (!button) return;
  button.closest("[data-matching-row]")?.remove();
});
addOptionBtn.addEventListener("click",()=>addOption(""));
addMatchingBtn.addEventListener("click",()=>addPair());
questionType.addEventListener("change",refreshTypeFields);
cancelEditBtn.addEventListener("click",resetForm);
newQuestionBtn.addEventListener("click",resetForm);
for (const el of [filterSearch,filterCourse,filterUnit,filterTopic,filterType]) {
  el.addEventListener(el.tagName==="SELECT"?"change":"input",renderQuestions);
}
logoutBtn.addEventListener("click",logoutTeacher);

onValue(ref(db,"examQuestionBank"),(snapshot)=>{
  questions=snapshot.val()||{};
  renderQuestions();
});

resetForm();
