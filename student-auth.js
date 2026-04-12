import { db } from "./firebase.js";
import { ref, get, update, push, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function markAttendanceOnLogin(studentKey, student) {
  const dateKey = todayKey();
  const attendancePath = `attendance/${dateKey}/${studentKey}`;
  const attendanceSnap = await get(ref(db, attendancePath));

  if (!attendanceSnap.exists()) {
    await set(ref(db, attendancePath), {
      studentKey,
      studentName: student.nickname || student.fullName || student.name || "",
      externalId: student.studentNumber || "",
      groupName: student.groupName || "",
      loginAt: Date.now(),
      leaveAt: null,
      leaveReason: "",
      activeNow: true
    });
  } else {
    const current = attendanceSnap.val() || {};
    await update(ref(db, attendancePath), {
      activeNow: true,
      studentName: student.nickname || student.fullName || student.name || current.studentName || "",
      externalId: student.studentNumber || current.externalId || "",
      groupName: student.groupName || current.groupName || ""
    });
  }

  await update(ref(db, `students/${studentKey}`), {
    activeNow: true,
    lastAttendanceDate: dateKey
  });

  return dateKey;
}

export async function setStudentLeave(studentKey, reason = "") {
  const dateKey = todayKey();
  const attendancePath = `attendance/${dateKey}/${studentKey}`;
  const snap = await get(ref(db, attendancePath));

  if (snap.exists()) {
    await update(ref(db, attendancePath), {
      activeNow: false,
      leaveAt: Date.now(),
      leaveReason: reason
    });
  }

  await update(ref(db, `students/${studentKey}`), {
    activeNow: false
  });
}

export async function loginStudentByExternalIdAndPassword(externalId, password) {
  const snapshot = await get(ref(db, "students"));
  const students = snapshot.val() || {};

  for (const [key, student] of Object.entries(students)) {
    const savedExternalId = (student.studentNumber || "").trim();
    if (savedExternalId === externalId.trim()) {
      const validPassword = student.password || "1234";

      if (password !== validPassword) {
        return { ok: false, message: "Incorrect password." };
      }

      if (!student.groupName) {
        return { ok: false, message: "This student does not have a group assigned yet." };
      }

      const nickname = student.nickname || (student.fullName || student.name || "Student").split(" ")[0];
      if (!student.nickname) {
        await update(ref(db, `students/${key}`), { nickname });
        student.nickname = nickname;
      }

      setStudentSession(key, externalId);
      await markAttendanceOnLogin(key, student);
      return { ok: true, key, student };
    }
  }

  return { ok: false, message: "External ID not found." };
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
  await setStudentLeave(studentKey, reason);
}
