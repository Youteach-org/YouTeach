import { signStudentSession } from "../_shared/student-session.js";

const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

async function firebaseGet(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicStudent(student = {}) {
  const fullName = String(student.fullName || student.name || "").trim();
  return {
    fullName,
    name: fullName,
    nickname: String(student.nickname || (fullName ? fullName.split(/\s+/)[0] : "Student")).trim(),
    groupName: String(student.groupName || "GENERAL"),
    studentNumber: String(student.studentNumber || ""),
    id: String(student.id || "")
  };
}

export async function onRequestPost({ request, env }) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const externalId = String(body.externalId || "").trim();
    const password = String(body.password || "");
    if (!externalId || !password) {
      return json(400, { ok: false, error: "Enter your ID and password." });
    }

    const students = (await firebaseGet("students")) || {};
    let match = null;

    for (const [studentKey, student] of Object.entries(students)) {
      const savedExternalId = String(student?.studentNumber || "").trim();
      const savedInternalId = String(student?.id || "").trim();
      if (savedExternalId === externalId || savedInternalId === externalId) {
        match = { studentKey, student: student || {} };
        break;
      }
    }

    const expectedPassword = match ? String(match.student.password || "1234") : "";
    if (!match || password !== expectedPassword) {
      return json(403, { ok: false, error: "Incorrect ID or password." });
    }

    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    const canonicalExternalId = String(
      match.student.studentNumber || match.student.id || externalId
    ).trim();

    const sessionToken = await signStudentSession(
      {
        studentKey: match.studentKey,
        externalId: canonicalExternalId,
        iat: now,
        exp: expiresAt,
        nonce: makeNonce()
      },
      env.YOUTEACH_SESSION_SECRET
    );

    return json(200, {
      ok: true,
      studentKey: match.studentKey,
      externalId: canonicalExternalId,
      expiresAt,
      sessionToken,
      student: publicStudent(match.student)
    });
  } catch (error) {
    console.error(error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not create the student session."
    });
  }
}
