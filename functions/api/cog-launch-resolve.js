import { verifyCogAssignmentLaunch } from "../_shared/cog-assignment-launch.js";

const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";

function allowedCogOrigin(request) {
  const raw = String(request.headers.get("Origin") || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol === "https:" &&
      (host === "classroom-online-games.pages.dev" ||
        host.endsWith(".classroom-online-games.pages.dev"))
    ) {
      return url.origin;
    }
  } catch (_) {}
  return null;
}

function corsHeaders(origin) {
  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(status, payload, origin = "") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(origin)
  });
}

async function firebaseGet(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

export async function onRequestOptions({ request }) {
  const origin = allowedCogOrigin(request);
  if (origin === null) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin"
    }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = allowedCogOrigin(request);
  if (origin === null) {
    return json(403, { ok: false, error: "This launch resolver is only available to Classroom Online Games." });
  }

  try {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const token = String(body.token || "").trim();
    if (!token) {
      return json(400, { ok: false, error: "Missing assignment launch token." }, origin);
    }

    const launch = await verifyCogAssignmentLaunch(
      token,
      env.YOUTEACH_SESSION_SECRET
    );
    if (!launch) {
      return json(401, { ok: false, error: "Invalid or expired assignment launch." }, origin);
    }

    const [student, assignment] = await Promise.all([
      firebaseGet(`students/${encodeURIComponent(launch.studentKey)}`),
      firebaseGet(`assignments/${encodeURIComponent(launch.assignmentId)}`)
    ]);

    if (!student || !assignment) {
      return json(404, { ok: false, error: "Student or assignment not found." }, origin);
    }

    const studentGroup = String(student.groupName || "GENERAL");
    const assignmentGroup = String(assignment.groupName || "ALL");
    if (assignmentGroup !== "ALL" && assignmentGroup !== studentGroup) {
      return json(403, { ok: false, error: "This assignment is no longer assigned to your group." }, origin);
    }

    if (
      String(assignment.assignmentTypeCode || "").trim().toUpperCase() !== "COG" ||
      String(launch.cogActivity?.gameId || "") !== "verb-runner"
    ) {
      return json(403, { ok: false, error: "This COG assignment is no longer available." }, origin);
    }

    const fullName = String(student.fullName || student.name || "").trim();
    const nickname = String(
      student.nickname || (fullName ? fullName.split(/\s+/)[0] : "Student")
    ).trim();

    return json(200, {
      ok: true,
      identity: {
        studentKey: String(launch.studentKey),
        nickname: nickname || "Student",
        fullName,
        groupName: studentGroup,
        studentNumber: String(student.studentNumber || student.id || ""),
        identitySource: "youteach"
      },
      launchContext: {
        purpose: "assignment-practice",
        officialSubmissionAllowed: false,
        assignmentId: String(launch.assignmentId),
        assignmentCode: String(launch.assignmentCode || assignment.code || ""),
        cogActivity: launch.cogActivity
      }
    }, origin);
  } catch (error) {
    console.error(error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not resolve the COG assignment launch."
    }, origin || "");
  }
}
