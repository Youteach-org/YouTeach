import { verifyTeacherSession } from "../_shared/teacher-session.js";
import { signCogLiveToken } from "../_shared/cog-live-token.js";

const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const DEFAULT_COG_ORIGIN = "https://classroom-online-games.pages.dev";
const LAUNCH_TTL_MS = 5 * 60 * 1000;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function bearer(request) {
  const value = String(request.headers.get("Authorization") || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
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

function cogOrigin(env) {
  const raw = String(env?.COG_LIVE_ORIGIN || DEFAULT_COG_ORIGIN).trim();
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !(
      host === "classroom-online-games.pages.dev" ||
      host.endsWith(".classroom-online-games.pages.dev")
    )
  ) {
    throw new Error("Invalid Classroom Online Games live origin.");
  }
  return url.origin;
}

export async function onRequestPost({ request, env }) {
  try {
    const signedTeacherSession = bearer(request);
    if (!signedTeacherSession) {
      return json(401, { ok: false, error: "Sign in again before opening Classroom Online Games." });
    }

    const teacher = await verifyTeacherSession(
      signedTeacherSession,
      env.YOUTEACH_SESSION_SECRET
    );
    if (!teacher) {
      return json(401, { ok: false, error: "Your teacher session expired. Sign in again." });
    }

    const currentSession = await firebaseGet("session/current");
    const groupName = String(currentSession?.groupName || "").trim();
    const youTeachSessionId = String(
      currentSession?.sessionId || currentSession?.createdAt || ""
    ).trim();

    if (!currentSession?.active || !groupName || !youTeachSessionId) {
      return json(409, {
        ok: false,
        error: "Create or activate a Buzzer session with a group before opening Classroom Online Games."
      });
    }

    const now = Date.now();
    const expiresAt = Math.min(now + LAUNCH_TTL_MS, Number(teacher.expiresAt || 0));
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return json(401, { ok: false, error: "Your teacher session expired. Sign in again." });
    }

    const token = await signCogLiveToken(
      {
        purpose: "cog-live-teacher",
        teacherUsername: teacher.username,
        teacherRole: teacher.role,
        teacherDisplayName: teacher.displayName,
        teacherSessionExpiresAt: Number(teacher.expiresAt || 0),
        youTeachSessionId,
        groupName,
        iat: now,
        exp: expiresAt,
        nonce: nonce()
      },
      env.YOUTEACH_SESSION_SECRET
    );

    const issuer = new URL(request.url).origin;
    const launchUrl = new URL(`${cogOrigin(env)}/teacher/`);
    launchUrl.searchParams.set("ytLiveTeacher", token);
    launchUrl.searchParams.set("issuer", issuer);

    return json(200, {
      ok: true,
      launchUrl: launchUrl.toString(),
      expiresAt
    });
  } catch (error) {
    console.error("COG live teacher launch failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not create the Classroom Online Games launch."
    });
  }
}
