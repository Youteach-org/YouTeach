import { db } from "./firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const SESSION_KEY = "youteachStudentKey";
const SESSION_EXTERNAL_ID = "youteachStudentExternalId";

export function getStudentKey() {
  return localStorage.getItem(SESSION_KEY);
}

export function getStudentExternalId() {
  return localStorage.getItem(SESSION_EXTERNAL_ID);
}

export function setStudentSession(studentKey, externalId) {
  localStorage.setItem(SESSION_KEY, studentKey);
  localStorage.setItem(SESSION_EXTERNAL_ID, externalId);
}

export function clearStudentSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_EXTERNAL_ID);
}

export async function loginStudentByExternalIdAndPassword(externalId, password) {
  const snapshot = await get(ref(db, "students"));
  const students = snapshot.val() || {};
  const cleanId = externalId.trim();

  for (const [key, student] of Object.entries(students)) {
    const savedExternalId = (student.studentNumber || "").trim();
    const savedInternalId = (student.id || "").trim();

    if (savedExternalId === cleanId || savedInternalId === cleanId) {
      const validPassword = student.password || "1234";

      if (password !== validPassword) {
        return { ok: false, message: "Incorrect password. Use 1234 for now." };
      }

      const updatedStudent = {
        ...student,
        nickname: student.nickname || (student.fullName || student.name || "Student").split(" ")[0],
        groupName: student.groupName || "GENERAL"
      };

      setStudentSession(key, cleanId);
      return { ok: true, key, student: updatedStudent };
    }
  }

  return { ok: false, message: "Student not found. Try external ID exactly as saved." };
}

export function requireStudentSession() {
  const studentKey = getStudentKey();
  const externalId = getStudentExternalId();

  if (!studentKey || !externalId) {
    window.location.href = "student.html";
    return null;
  }

  return { studentKey, externalId };
}

export async function saveLeaveLog(studentKey, reason = "") {
  return true;
}
