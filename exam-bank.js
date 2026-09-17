import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { normalizeExamBankMetadata, filterExamBankEntries } from "./exam-bank-model.js";

if (!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const teacherIdentity = document.getElementById("teacherIdentity");
const sidebarIdentity = document.getElementById("sidebarIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const examBankForm = document.getElementById("examBankForm");
const examFile = document.getElementById("examFile");
const examTitle = document.getElementById("examTitle");
const examSubject = document.getElementById("examSubject");
const examUnit = document.getElementById("examUnit");
const examTopic = document.getElementById("examTopic");
const examType = document.getElementById("examType");
const examDate = document.getElementById("examDate");
const examVersion = document.getElementById("examVersion");
const examTags = document.getElementById("examTags");
const uploadExamBtn = document.getElementById("uploadExamBtn");
const examBankFormStatus = document.getElementById("examBankFormStatus");
const examBankSearch = document.getElementById("examBankSearch");
const examBankSubjectFilter = document.getElementById("examBankSubjectFilter");
const examBankTypeFilter = document.getElementById("examBankTypeFilter");
const examBankVersionFilter = document.getElementById("examBankVersionFilter");
const clearExamBankFiltersBtn = document.getElementById("clearExamBankFiltersBtn");
const examBankList = document.getElementById("examBankList");
const examBankCount = document.getElementById("examBankCount");

let examBankEntries = {};

const teacherName = getTeacherName();
teacherIdentity.textContent = teacherName;
if (sidebarIdentity) sidebarIdentity.textContent = teacherName;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;,"'":"&#39;"
  }[char]));
}

function makeEntryId() {
  if (typeof crypto?.randomUUID === "function") {
    return `exam-${crypto.randomUUID()}`;
  }
  return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function setSelectOptions(select, values, allLabel) {
  const previous = select.value;
  const unique = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>` +
    unique.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (unique.includes(previous)) select.value = previous;
}

function refreshFilters() {
  const rows = Object.values(examBankEntries || {});
  setSelectOptions(examBankSubjectFilter, rows.map((entry) => entry?.subject), "All subjects");
  setSelectOptions(examBankTypeFilter, rows.map((entry) => entry?.examType), "All types");
  setSelectOptions(examBankVersionFilter, rows.map((entry) => entry?.version), "All versions");
}

function formatDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString();
}

function renderExamBank() {
  const rows = filterExamBankEntries(examBankEntries, {
    query: examBankSearch.value,
    subject: examBankSubjectFilter.value,
    examType: examBankTypeFilter.value,
    version: examBankVersionFilter.value
  });

  examBankCount.textContent = `${rows.length} exam${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    examBankList.innerHTML = '<div class="exam-bank-empty">No exams match these filters.</div>';
    return;
  }

  examBankList.innerHTML = rows.map(([id, entry]) => {
    const meta = [entry.subject, entry.unit, entry.topic, entry.examType, formatDate(entry.examDate)]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];

    return `
      <article class="exam-bank-card" data-exam-id="${escapeHtml(id)}">
        <div class="exam-bank-card-head">
          <h4>${escapeHtml(entry.title || "Untitled exam")}</h4>
          ${entry.version ? `<span class="exam-bank-version">${escapeHtml(entry.version)}</span>` : ""}
        </div>
        <div class="exam-bank-meta">
          ${meta.length ? `${meta.map(escapeHtml).join(" · ")}<br>` : ""}
          ${escapeHtml(entry.originalFileName || entry.driveFileName || "Original file")}
        </div>
        ${tags.length ? `<div class="exam-bank-tags">${tags.map((tag) => `<span class="exam-bank-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <div class="exam-bank-actions">
          <button type="button" data-exam-action="open" data-exam-id="${escapeHtml(id)}">Open</button>
          <button type="button" data-exam-action="download" data-exam-id="${escapeHtml(id)}">Download</button>
        </div>
      </article>
    `;
  }).join("");
}

async function uploadExam(event) {
  event.preventDefault();
  const file = examFile.files?.[0];
  if (!file) {
    examBankFormStatus.textContent = "Choose an original exam file.";
    examBankFormStatus.className = "status-text bad";
    return;
  }
  if (!examTitle.value.trim()) {
    examBankFormStatus.textContent = "Title is required.";
    examBankFormStatus.className = "status-text bad";
    return;
  }

  const metadata = normalizeExamBankMetadata({
    title: examTitle.value,
    subject: examSubject.value,
    unit: examUnit.value,
    topic: examTopic.value,
    examType: examType.value,
    examDate: examDate.value,
    version: examVersion.value,
    tags: examTags.value
  });
  const entryId = makeEntryId();

  uploadExamBtn.disabled = true;
  examBankFormStatus.textContent = "Uploading original file...";
  examBankFormStatus.className = "status-text";

  try {
    const headers = {
      "Content-Type": file.type || "application/octet-stream",
      "x-exam-entry-id": encodeURIComponent(entryId),
      "x-exam-title": encodeURIComponent(metadata.title),
      "x-exam-subject": encodeURIComponent(metadata.subject),
      "x-exam-unit": encodeURIComponent(metadata.unit),
      "x-exam-topic": encodeURIComponent(metadata.topic),
      "x-exam-type": encodeURIComponent(metadata.examType),
      "x-exam-date": encodeURIComponent(metadata.examDate),
      "x-exam-version": encodeURIComponent(metadata.version),
      "x-exam-tags": encodeURIComponent(JSON.stringify(metadata.tags)),
      "x-teacher-name": encodeURIComponent(teacherName),
      "x-file-name": encodeURIComponent(file.name),
      "x-file-size": String(file.size)
    };

    const response = await fetch("/api/exam-bank-upload", {
      method: "POST",
      headers,
      body: file
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || "Could not upload the exam.");
    }

    examBankForm.reset();
    examBankFormStatus.textContent = "Exam saved in the Exam Bank.";
    examBankFormStatus.className = "status-text ok";
  } catch (error) {
    console.error(error);
    examBankFormStatus.textContent = error?.message || "Could not upload the exam.";
    examBankFormStatus.className = "status-text bad";
  } finally {
    uploadExamBtn.disabled = false;
  }
}

examBankForm.addEventListener("submit", uploadExam);
examBankSearch.addEventListener("input", renderExamBank);
[examBankSubjectFilter, examBankTypeFilter, examBankVersionFilter]
  .forEach((select) => select.addEventListener("change", renderExamBank));

clearExamBankFiltersBtn.addEventListener("click", () => {
  examBankSearch.value = "";
  examBankSubjectFilter.value = "";
  examBankTypeFilter.value = "";
  examBankVersionFilter.value = "";
  renderExamBank();
});

examBankList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-exam-action][data-exam-id]");
  if (!button) return;

  const entryId = String(button.dataset.examId || "");
  const action = String(button.dataset.examAction || "");
  const entry = examBankEntries[entryId];
  if (!entry) return;

  if (action === "open" && entry.driveFileUrl) {
    window.open(entry.driveFileUrl, "_blank", "noopener");
  }
  if (action === "download") {
    window.location.href = `/api/exam-bank-download?entryId=${encodeURIComponent(entryId)}`;
  }
});

onValue(ref(db, "examBank"), (snapshot) => {
  examBankEntries = snapshot.val() || {};
  refreshFilters();
  renderExamBank();
});

logoutBtn.addEventListener("click", logoutTeacher);
