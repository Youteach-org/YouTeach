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
    const error = new Error("Google Drive is not configured on the server.");
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

function isExamAssignment(assignment) {
  const typeCode = String(assignment?.assignmentTypeCode || "").trim().toUpperCase();
  return typeCode === "EX" || String(assignment?.code || "").toUpperCase().startsWith("EX-");
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const assignmentId = String(body?.assignmentId || "").trim();
    const studentKey = String(body?.studentKey || "").trim();
    const externalId = String(body?.externalId || "").trim();

    if (!assignmentId || !studentKey || !externalId) {
      return json(400, { ok: false, error: "Missing assignment or student identity." });
    }

    const [assignment, submission, student] = await Promise.all([
      firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`),
      firebaseGet(`assignmentSubmissions/${encodeURIComponent(assignmentId)}/${encodeURIComponent(studentKey)}`),
      firebaseGet(`students/${encodeURIComponent(studentKey)}`)
    ]);

    if (!assignment || !submission || !student) {
      return json(404, { ok: false, error: "Published annotated exam was not found." });
    }

    const expectedExternalId = String(student.studentNumber || student.id || "").trim();
    if (!expectedExternalId || expectedExternalId !== externalId) {
      return json(403, { ok: false, error: "Student identity does not match this session." });
    }

    if (!isExamAssignment(assignment)) {
      return json(400, { ok: false, error: "This assignment is not an Exam." });
    }

    if (!submission.gradePublished) {
      return json(403, { ok: false, error: "The graded exam has not been published yet." });
    }

    const fileId = String(submission.examAnnotatedDriveFileId || "").trim();
    if (!fileId) {
      return json(404, { ok: false, error: "No annotated exam PDF is available." });
    }

    const accessToken = await getAccessToken(env);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      let message = "Could not read the annotated exam from Google Drive.";
      try {
        const data = await response.json();
        message = data.error?.message || message;
      } catch (_) {}
      throw new Error(message);
    }

    const bytes = await response.arrayBuffer();
    const name = String(submission.examAnnotatedDriveFileName || "graded-exam.pdf").replace(/"/g, "");
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return json(error?.code === "DRIVE_NOT_CONFIGURED" ? 503 : 500, {
      ok: false,
      error: error?.message || "Could not load the annotated exam."
    });
  }
}
