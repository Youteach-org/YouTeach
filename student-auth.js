import { db } from "./firebase.js";
import { ref, get, update, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const SESSION_KEY = "youteachStudentKey";
const SESSION_EXTERNAL_ID = "youteachStudentExternalId";
const SESSION_TOKEN = "youteachStudentSessionToken";
const SESSION_EXPIRES_AT = "youteachStudentSessionExpiresAt";

export function getStudentKey() {
  return localStorage.getItem(SESSION_KEY);
}

export function getStudentExternalId() {
  return localStorage.getItem(SESSION_EXTERNAL_ID);
}

export function getStudentSessionToken() {
  return localStorage.getItem(SESSION_TOKEN) || "";
}

export function setStudentSession(studentKey, externalId, sessionToken, expiresAt) {
  localStorage.setItem(SESSION_KEY, studentKey);
  localStorage.setItem(SESSION_EXTERNAL_ID, externalId);
  localStorage.setItem(SESSION_TOKEN, sessionToken);
  localStorage.setItem(SESSION_EXPIRES_AT, String(Number(expiresAt || 0)));
}

export function clearStudentSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_EXTERNAL_ID);
  localStorage.removeItem(SESSION_TOKEN);
  localStorage.removeItem(SESSION_EXPIRES_AT);
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function migrateExistingStudentsForTeacher() {
  const groupsSnap = await get(ref(db, "groups"));
  const groups = groupsSnap.val() || {};

  if (!groups.GENERAL) {
    await update(ref(db, "groups"), {
      GENERAL: { name: "GENERAL", createdAt: Date.now() }
    });
  }

  const studentsSnap = await get(ref(db, "students"));
  const students = studentsSnap.val() || {};
  const updates = {};

  for (const [key, student] of Object.entries(students)) {
    const fullName = student.fullName || student.name || "";
    const nickname = student.nickname || (fullName ? fullName.split(" ")[0] : "Student");
    const groupName = student.groupName || "GENERAL";
    updates[`students/${key}/fullName`] = fullName;
    updates[`students/${key}/name`] = fullName;
    updates[`students/${key}/nickname`] = nickname;
    updates[`students/${key}/groupName`] = groupName;
    updates[`students/${key}/blockPoints`] = {
      "Block 1": Number(student?.blockPoints?.["Block 1"] || 0),
      "Block 2": Number(student?.blockPoints?.["Block 2"] || 0),
      "Block 3": Number(student?.blockPoints?.["Block 3"] || 0)
    };
  }

  if (Object.keys(updates).length) await update(ref(db), updates);
}

export async function markAttendanceOnLogin(studentKey, student) {
  const dateKey = todayKey();
  const attendancePath = `attendance/${dateKey}/${studentKey}`;
  const attendanceSnap = await get(ref(db, attendancePath));
  const nowTs = Date.now();

  if (!attendanceSnap.exists()) {
    await set(ref(db, attendancePath), {
      studentKey,
      studentName: student.nickname || student.fullName || student.name || "",
      externalId: student.studentNumber || "",
      studentNumber: student.studentNumber || "",
      groupName: student.groupName || "GENERAL",
      loginAt: nowTs,
      detectedAt: nowTs,
      leaveAt: null,
      leaveReason: "",
      activeNow: true,
      leftEarly: false
    });
  } else {
    const current = attendanceSnap.val() || {};
    await update(ref(db, attendancePath), {
      studentName: student.nickname || student.fullName || student.name || current.studentName || "",
      externalId: student.studentNumber || current.externalId || "",
      studentNumber: student.studentNumber || current.studentNumber || "",
      groupName: student.groupName || current.groupName || "GENERAL",
      activeNow: true,
      leftEarly: false,
      leaveAt: null,
      leaveReason: "",
      detectedAt: nowTs,
      loginAt: current.loginAt || nowTs
    });
  }

  await update(ref(db, `students/${studentKey}`), {
    activeNow: true,
    lastAttendanceDate: dateKey,
    lastSeenAt: nowTs
  });
  return dateKey;
}

export async function setStudentLeave(studentKey, reason = "") {
  const dateKey = todayKey();
  const attendancePath = `attendance/${dateKey}/${studentKey}`;
  const snap = await get(ref(db, attendancePath));
  const leaveTs = Date.now();

  if (snap.exists()) {
    await update(ref(db, attendancePath), {
      activeNow: false,
      leaveAt: leaveTs,
      leaveReason: reason,
      leftEarly: true
    });
  } else {
    await set(ref(db, attendancePath), {
      studentKey,
      activeNow: false,
      leaveAt: leaveTs,
      leaveReason: reason,
      leftEarly: true
    });
  }
  await update(ref(db, `students/${studentKey}`), { activeNow: false });
}

export async function loginStudentByExternalIdAndPassword(externalId, password) {
  const response = await fetch("/api/student-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ externalId: String(externalId || "").trim(), password: String(password || "") })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok !== true || !data.sessionToken) {
    return { ok: false, message: data.error || "Incorrect ID or password." };
  }

  setStudentSession(data.studentKey, data.externalId, data.sessionToken, data.expiresAt);
  return {
    ok: true,
    key: data.studentKey,
    studentKey: data.studentKey,
    externalId: data.externalId,
    student: data.student || {}
  };
}

export function requireStudentSession() {
  const studentKey = getStudentKey();
  const externalId = getStudentExternalId();
  const sessionToken = getStudentSessionToken();
  const expiresAt = Number(localStorage.getItem(SESSION_EXPIRES_AT) || 0);

  if (!studentKey || !externalId || !sessionToken || !expiresAt || expiresAt <= Date.now()) {
    clearStudentSession();
    window.location.href = "student.html";
    return null;
  }

  return { studentKey, externalId, sessionToken, expiresAt };
}

export async function saveLeaveLog(studentKey, reason = "") {
  await setStudentLeave(studentKey, reason);
  return true;
}
