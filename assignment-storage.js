const MAX_PDF_BYTES = 15 * 1024 * 1024;

export function safeSegment(value, fallback = "item") {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return text || fallback;
}

export function validateAssignmentPdf(file) {
  const isPdf = file && (
    String(file.type || "").toLowerCase() === "application/pdf" ||
    String(file.name || "").toLowerCase().endsWith(".pdf")
  );

  if (!isPdf) throw new Error("Only PDF files are accepted.");
  if (file.size > MAX_PDF_BYTES) throw new Error("The PDF must be 15 MB or smaller.");
  return true;
}

export async function uploadAssignmentPdf({
  assignmentId,
  studentKey,
  externalId,
  file,
  onProgress
}) {
  validateAssignmentPdf(file);

  if (typeof onProgress === "function") onProgress(0.05);

  const response = await fetch("/api/drive-upload-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-Assignment-Id": assignmentId,
      "X-Student-Key": studentKey,
      "X-External-Id": externalId,
      "X-File-Size": String(file.size)
    },
    body: file
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !result.driveFileId) {
    throw new Error(result.error || "Could not upload the PDF to Google Drive.");
  }

  if (typeof onProgress === "function") onProgress(1);

  return {
    driveFileId: result.driveFileId,
    driveFileName: result.driveFileName,
    driveFileUrl: result.driveFileUrl,
    driveFolderId: result.driveFolderId,
    driveFolderUrl: result.driveFolderUrl,
    mimeType: "application/pdf",
    size: Number(result.size || file.size || 0),
    uploadedAt: Number(result.uploadedAt || Date.now())
  };
}

export async function undoAssignmentPdf({
  assignmentId,
  studentKey,
  externalId
}) {
  const response = await fetch("/api/drive-upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "undo",
      assignmentId,
      studentKey,
      externalId
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Could not undo the submission.");
  }
  return result;
}
