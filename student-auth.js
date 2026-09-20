import { db } from "./firebase.js";
import { ref, get, update, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

export async function migrateExistingStudentsForTeacher() {
  const groupsSnap = await get(ref(db, "groups"));
  const groups = groupsSnap.val() || {};

  if (!groups.GENERAL) {
    await update(ref(db, "groups"), {
      GENERAL: {
        name: "GENERAL",
        createdAt: Date.now()
      }
    });
  }

  const studentsSnap = await get(ref(db, "students"));
  const students = studentsSnap.val() || {};
  const updates = {};

  for (const [key, student] of Object.entries(students)) {
    const fullName = student.fullName || student.name || "";
    const nickname = student.nickname || (fullName ? fullName.split(" ")[0] : "Student");
    const groupName = student.groupName || "GENERAL";
    const existingBlockPoints =
      student?.blockPoints && typeof student.blockPoints === "object"
        ? student.blockPoints
        : {};
    const blockPoints = Object.fromEntries(
      Object.entries(existingBlockPoints).map(([blockName, value]) => [
        blockName,
        Number(value || 0)
      ])
    );
    for (const blockName of ["Block 1", "Block 2", "Block 3"]) {
      if (blockPoints[blockName] === undefined) blockPoints[blockName] = 0;
    }

    updates[`students/${key}/fullName`] = fullName;
    updates[`students/${key}/name`] = fullName;
    updates[`students/${key}/nickname`] = nickname;
    updates[`students/${key}/groupName`] = groupName;
    updates[`students/${key}/password`] = student.password || "1234";
    updates[`students/${key}/blockPoints`] = blockPoints;
  }

  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
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

  await update(ref(db, `students/${studentKey}`), {
    activeNow: false
  });
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
  await setStudentLeave(studentKey, reason);
  return true;
}