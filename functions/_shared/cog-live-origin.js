const DEFAULT_COG_ORIGIN = "https://utichgion.org";

function validateCogOrigin(raw) {
  const url = new URL(String(raw || "").trim());
  const host = url.hostname.toLowerCase();

  if (
    url.protocol !== "https:" ||
    !(
      host === "utichgion.org" ||
      host === "classroom-online-games.pages.dev" ||
      host.endsWith(".classroom-online-games.pages.dev")
    )
  ) {
    throw new Error("Invalid Classroom Online Games live origin.");
  }

  return url.origin;
}

function inferredPreviewOrigin(requestUrl) {
  const request = new URL(String(requestUrl || ""));
  const host = request.hostname.toLowerCase();
  const suffix = ".youteach.pages.dev";

  if (!host.endsWith(suffix) || host === "youteach.pages.dev") return "";
  const branch = host.slice(0, -suffix.length).trim();
  if (!branch || !branch.startsWith("talk-talk-")) return "";

  return `https://${branch}.classroom-online-games.pages.dev`;
}

export function resolveCogLiveOrigin(env = {}, requestUrl = "") {
  const explicit = String(env?.COG_LIVE_ORIGIN || "").trim();
  if (explicit) return validateCogOrigin(explicit);

  const preview = inferredPreviewOrigin(requestUrl);
  if (preview) return validateCogOrigin(preview);

  return DEFAULT_COG_ORIGIN;
}

export { DEFAULT_COG_ORIGIN };
