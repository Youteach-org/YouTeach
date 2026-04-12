import { db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const SESSION_KEY = "youteachStudentKey";
const SESSION_ID = "youteachStudentId";

export function getStudentKey() {
  return localStorage.getItem(SESSION_KEY);
}

export function getStudentId() {
  return localStorage.getItem(SESSION_ID);
}

export function setStudentSession(studentKey, internalId) {
  localStorage.setItem(SESSION_KEY, studentKey);
  localStorage.setItem(SESSION_ID, internalId);
}

export function clearStudentSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_ID);
}

export async function loginStudentByIdAndPassword(internalId, password) {
  const snapshot = await get(ref(db, "students"));
  const students = snapshot.val() || {};

  for (const [key, student] of Object.entries(students)) {
    if (student.id === internalId) {
      const validPassword = student.password || student.id;
      if (password !== validPassword) {
        return { ok: false, message: "Invalid password." };
      }

      if (!student.nickname) {
        const baseName = student.fullName || student.name || "Student";
        await update(ref(db, `students/${key}`), {
          nickname: baseName.split(" ")[0]
        });
      }

      setStudentSession(key, internalId);
      return { ok: true, key, student };
    }
  }

  return { ok: false, message: "Student not found." };
}

export function requireStudentSession() {
  const studentKey = getStudentKey();
  const internalId = getStudentId();

  if (!studentKey || !internalId) {
    window.location.href = "student.html";
    return null;
  }

  return { studentKey, internalId };
}
