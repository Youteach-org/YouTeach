import { verifyTeacherSession } from "../_shared/teacher-session.js";
import { bearer, firebaseGet, json } from "../_shared/cog-live-http.js";

export async function onRequestGet({ request, env }) {
  try {
    const token = bearer(request);
    if (!token) {
      return json(401, {
        ok: false,
        error: "Sign in again before viewing Classroom Online Games results."
      });
    }

    const teacher = await verifyTeacherSession(
      token,
      env.YOUTEACH_SESSION_SECRET
    );
    if (!teacher) {
      return json(401, {
        ok: false,
        error: "Your teacher session expired. Sign in again."
      });
    }

    const results = await firebaseGet("classroomGameResultsByAssignment");

    return json(200, {
      ok: true,
      results: results && typeof results === "object" ? results : {}
    });
  } catch (error) {
    console.error("COG assignment results read failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not load Classroom Online Games results."
    });
  }
}
