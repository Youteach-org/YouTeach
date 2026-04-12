import { db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

  for (const [key, student] of Object.entries(students)) {
    const savedExternalId = student.studentNumber || "";
    if (savedExternalId === externalId) {
      const validPassword = student.password || "1234";
      if (password !== validPassword) {
        return { ok: false, message: "Invalid password." };
      }

      if (!student.nickname) {
        const baseName = student.fullName || student.name || "Student";
        await update(ref(db, `students/${key}`), {
          nickname: baseName.split(" ")[0]
        });
      }

      setStudentSession(key, externalId);
      return { ok: true, key, student };
    }
  }

  return { ok: false, message: "Student not found." };
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

export async function setStudentActiveFlag(studentKey, isActive) {
  await update(ref(db, `students/${studentKey}`), {
    activeNow: isActive
  });
}
