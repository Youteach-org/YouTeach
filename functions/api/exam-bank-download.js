const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";

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

async function getAccessToken(env) {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    const error = new Error("Google Drive download is not configured on the server.");
    error.code = "DRIVE_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Could not authorize Google Drive.");
  }
  return data.access_token;
}

function safeFileName(value) {
  return String(value || "exam")
    .replace(/[\r\n"]/g, "_")
    .trim() || "exam";
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return json(405, { ok: false, error: "Method not allowed." });
  }

  try {
    const url = new URL(request.url);
    const entryId = String(url.searchParams.get("entryId") || "").trim();
    if (!entryId) return json(400, { ok: false, error: "Exam Bank entry ID is required." });

    const entry = await firebaseGet(`examBank/${encodeURIComponent(entryId)}`);
    if (!entry?.driveFileId) {
      return json(404, { ok: false, error: "Exam Bank entry or original file not found." });
    }

    const accessToken = await getAccessToken(env);
    const driveUrl = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(entry.driveFileId)}`
    );
    driveUrl.searchParams.set("alt", "media");

    const response = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      return json(response.status === 404 ? 404 : 502, {
        ok: false,
        error: "Could not retrieve the original exam file from Google Drive."
      });
    }

    const bytes = await response.arrayBuffer();
    const fileName = safeFileName(entry.originalFileName || entry.driveFileName);
    const contentType = entry.mimeType || response.headers.get("content-type") || "application/octet-stream";

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error(error);
    const status = error?.code === "DRIVE_NOT_CONFIGURED" ? 503 : 500;
    return json(status, {
      ok: false,
      error: error?.message || "Could not download the exam."
    });
  }
}
