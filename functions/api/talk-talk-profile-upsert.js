import { verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  allowedCogOrigin,
  bearer,
  firebaseGet,
  firebasePut,
  json,
  optionsResponse
} from "../_shared/cog-live-http.js";
import { mergeTalkTalkProfile } from "../_shared/talk-talk-profile.js";

export function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
  const origin = allowedCogOrigin(request);
  if (origin === null) return json(403, { ok:false, error:"COG origin required." });

  try {
    const token = bearer(request);
    const grant = token
      ? await verifyCogLiveToken(token, env.YOUTEACH_SESSION_SECRET, Date.now(), "cog-live-student-session")
      : null;
    if (!grant?.studentKey) return json(401, { ok:false, error:"Invalid student session." }, origin);
    if (String(grant.gameId || "") !== "talk-talk") {
      return json(403, { ok:false, error:"Talk Talk profile access requires a Talk Talk session." }, origin);
    }

    let body = {};
    try { body = await request.json(); } catch {}

    if (body.studentKey && String(body.studentKey) !== String(grant.studentKey)) {
      return json(403, { ok:false, error:"Student identity is server-authoritative." }, origin);
    }

    const path = `talkTalkProfiles/${encodeURIComponent(String(grant.studentKey))}`;
    const existing = await firebaseGet(path);
    const profile = mergeTalkTalkProfile(existing || {}, body.profile || body, String(grant.studentKey));
    await firebasePut(path, profile);

    return json(200, { ok:true, profile }, origin);
  } catch (error) {
    return json(400, { ok:false, error:error?.message || "Could not save Talk Talk profile." }, origin || "");
  }
}
