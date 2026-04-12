import { db } from "./firebase.js";
import { ref, push, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { generateId } from "./app.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

requireTeacherAuth();

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const createStudentBtn = document.getElementById("createStudent");
const importCsvBtn = document.getElementById("importCsv");
const importTextBtn = document.getElementById("importText");

const studentNameInput = document.getElementById("studentName");
const studentNicknameInput = document.getElementById("studentNickname");
const studentNumberManualInput = document.getElementById("studentNumberManual");
const csvFileInput = document.getElementById("csvFile");
const bulkTextInput = document.getElementById("bulkText");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.includes("name") || header.includes("fullname") || header.includes("studentnumber") || header.includes("nickname");
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows.map((line) => {
    const cols = parseCsvLine(line);

    if (hasHeader) {
      const nameIndex = header.indexOf("name") >= 0 ? header.indexOf("name") : header.indexOf("fullname");
      const numberIndex = header.indexOf("studentnumber");
      const nicknameIndex = header.indexOf("nickname");

      return {
        fullName: nameIndex >= 0 ? (cols[nameIndex] || "").trim() : "",
        studentNumber: numberIndex >= 0 ? (cols[numberIndex] || "").trim() : "",
        nickname: nicknameIndex >= 0 ? (cols[nicknameIndex] || "").trim() : ""
      };
    }

    return {
      studentNumber: (cols[0] || "").trim(),
      fullName: (cols[1] || "").trim(),
      nickname: ""
    };
  }).filter((student) => student.fullName);
}

function parseBulkText(text) {
  return text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    if (line.includes("\t")) {
      const parts = line.split("\t");
      return {
        studentNumber: (parts[0] || "").trim(),
        fullName: parts.slice(1).join(" ").trim(),
        nickname: ""
      };
    }

    const parts = parseCsvLine(line);
    return {
      studentNumber: (parts[0] || "").trim(),
      fullName: (parts[1] || "").trim() || line,
      nickname: ""
    };
  }).filter((student) => student.fullName);
}

async function saveStudent(fullName, nickname = "", studentNumber = "") {
  const cleanName = fullName.trim();
  const cleanNickname = nickname.trim() || cleanName.split(" ")[0];
  const cleanNumber = studentNumber.trim();
  const internalId = generateId();

  const newRef = push(ref(db, "students"));

  await set(newRef, {
    fullName: cleanName,
    name: cleanName,
    nickname: cleanNickname,
    studentNumber: cleanNumber,
    id: internalId,
    password: internalId,
    blockPoints: {
      "Block 1": 0,
      "Block 2": 0,
      "Block 3": 0
    }
  });
}

createStudentBtn.addEventListener("click", async () => {
  const fullName = studentNameInput.value.trim();
  const nickname = studentNicknameInput.value.trim();
  const studentNumber = studentNumberManualInput.value.trim();

  if (!fullName) {
    alert("Please enter a student name.");
    return;
  }

  await saveStudent(fullName, nickname, studentNumber);
  studentNameInput.value = "";
  studentNicknameInput.value = "";
  studentNumberManualInput.value = "";
  alert("Student added.");
});

importCsvBtn.addEventListener("click", async () => {
  const file = csvFileInput.files[0];

  if (!file) {
    alert("Please choose a CSV file.");
    return;
  }

  const text = await file.text();
  const students = parseCsv(text);

  if (!students.length) {
    alert("No valid students were found.");
    return;
  }

  for (const student of students) {
    await saveStudent(student.fullName, student.nickname || "", student.studentNumber || "");
  }

  csvFileInput.value = "";
  alert(`${students.length} students imported successfully.`);
});

importTextBtn.addEventListener("click", async () => {
  const text = bulkTextInput.value.trim();

  if (!text) {
    alert("Paste the student list first.");
    return;
  }

  const students = parseBulkText(text);

  if (!students.length) {
    alert("No valid students were found.");
    return;
  }

  for (const student of students) {
    await saveStudent(student.fullName, student.nickname || "", student.studentNumber || "");
  }

  bulkTextInput.value = "";
  alert(`${students.length} students imported successfully.`);
});
