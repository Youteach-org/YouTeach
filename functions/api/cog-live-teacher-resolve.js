import { signCogLiveToken, verifyCogLiveToken } from "../_shared/cog-live-token.js";

const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const BRIDGE_TTL_MS = 12 * 60 * 60 * 1000;

function allowedCogOrigin(request) {
  const raw = String(request.headers.get("Origin") || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol === "https:" &&
      (
        host === "classroom-online-games.pages.dev" ||
        host.endsWith(".classroom-online-games.pages.dev")
      )
    ) {
      return url.origin;
    }
  } catch {}
  return null;
}

function headers(origin = "") {
  return {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {})
  };
}

function json(status, payload, origin = "") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: headers(origin)
  });
}

async function firebaseGet(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestOptions({ request }) {
  const origin = allowedCogOrigin(request);
  if (origin === null) return new Response(null, { status: 403 });
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
    return json(403, {
      ok: false,
      error: "This endpoint is only available to Classroom Online Games."
    });
  }

  try {
    let body = {};
    try {
      body = await request.json();
    } catch {}

    const token = String(body.token || "").trim();
    if (!token) {
      return json(400, { ok: false, error: "Missing teacher launch credential." }, origin);
    }

    const launch = await verifyCogLiveToken(
      token,
      env.YOUTEACH_SESSION_SECRET,
      Date.now(),
      "cog-live-teacher"
    );
    if (!launch) {
      return json(401, { ok: false, error: "Invalid or expired teacher launch." }, origin);
    }

    const assignmentId = String(launch.assignmentId || "").trim();
    const [currentSession, assignment] = await Promise.all([
      firebaseGet("session/current"),
      assignmentId ? firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`) : Promise.resolve(null)
    ]);
    const canonicalSessionId = String(
      currentSession?.sessionId || currentSession?.createdAt || ""
    ).trim();
    const canonicalGroup = String(currentSession?.groupName || "").trim();

    if (
      !currentSession?.active ||
      !canonicalSessionId ||
      canonicalSessionId !== String(launch.youTeachSessionId || "") ||
      canonicalGroup !== String(launch.groupName || "")
    ) {
      return json(409, {
        ok: false,
        error: "The YouTeach Buzzer session changed. Reopen Classroom Online Games from Buzzer."
      }, origin);
    }

    const assignmentTypeCode = String(assignment?.assignmentTypeCode || "").trim().toUpperCase();
    const assignmentGroup = String(assignment?.groupName || "").trim();
    if (
      !assignmentId ||
      !assignment ||
      assignment?.active === false ||
      assignmentTypeCode !== "COG" ||
      assignmentGroup !== canonicalGroup
    ) {
      return json(409, {
        ok: false,
        error: "The COG assignment is no longer active for this Buzzer group."
      }, origin);
    }

    const normalizeStringArray = (raw) => {
      const values = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === "object" ? Object.values(raw) : []);
      return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
    };
    const recipientStudentKeys = normalizeStringArray(assignment.recipientStudentKeys);
    const recipientTeamLabels = normalizeStringArray(assignment.recipientTeamLabels);
    const recipientTeamTarget = String(assignment.recipientTeamTarget || "").trim();

    const now = Date.now();
    const expiresAt = Math.min(
      now + BRIDGE_TTL_MS,
      Number(launch.teacherSessionExpiresAt || 0)
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return json(401, {
        ok: false,
        error: "The teacher session expired. Reopen Classroom Online Games from YouTeach."
      }, origin);
    }

    const bridgeToken = await signCogLiveToken({
      purpose: "cog-live-teacher-session",
      teacherUsername: String(launch.teacherUsername || ""),
      teacherRole: String(launch.teacherRole || "teacher"),
      teacherDisplayName: String(launch.teacherDisplayName || "Teacher"),
      youTeachSessionId: canonicalSessionId,
      groupName: canonicalGroup,
      assignmentId,
      assignmentCode: String(assignment.code || "").trim(),
      assignmentTitle: String(assignment.title || "Classroom Online Games").trim(),
      recipientStudentKeys,
      recipientTeamLabels,
      recipientTeamTarget,
      iat: now,
      exp: expiresAt,
      nonce: nonce()
    }, env.YOUTEACH_SESSION_SECRET);

    return json(200, {
      ok: true,
      teacher: {
        username: String(launch.teacherUsername || ""),
        role: String(launch.teacherRole || "teacher"),
        displayName: String(launch.teacherDisplayName || "Teacher")
      },
      liveContext: {
        youTeachSessionId: canonicalSessionId,
        groupName: canonicalGroup,
        assignmentId,
        assignmentCode: String(assignment.code || "").trim(),
        assignmentTitle: String(assignment.title || "Classroom Online Games").trim()
      },
      bridgeToken,
      bridgeExpiresAt: expiresAt
    }, origin);
  } catch (error) {
    console.error("COG live teacher resolve failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not resolve the teacher launch."
    }, origin || "");
  }
}
