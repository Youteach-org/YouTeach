import { verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  allowedCogOrigin,
  bearer,
  firebaseGet,
  json,
  optionsResponse
} from "../_shared/cog-live-http.js";
import { normalizeTalkTalkProfile } from "../_shared/talk-talk-profile.js";

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

    const path = `talkTalkProfiles/${encodeURIComponent(String(grant.studentKey))}`;
    const stored = await firebaseGet(path);
    return json(200, {
      ok:true,
      profile: normalizeTalkTalkProfile(stored || {}, String(grant.studentKey))
    }, origin);
  } catch (error) {
    return json(500, { ok:false, error:error?.message || "Could not load Talk Talk profile." }, origin || "");
  }
}
