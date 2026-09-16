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


const MAX_PROJECT_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_PROJECT_VIDEO_BYTES = 50 * 1024 * 1024;

export function projectEvidenceType(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";

  const documentMimeTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain"
  ]);
  if (
    documentMimeTypes.has(type) ||
    /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt)$/.test(name)
  ) {
    return "document";
  }

  return "";
}

export function validateProjectEvidence(file, allowedTypes = []) {
  if (!file) throw new Error("Choose an evidence file first.");

  const evidenceType = projectEvidenceType(file);
  if (!evidenceType) {
    throw new Error("Use a photo, video, PDF, or Office/text document.");
  }

  const allowed = new Set((allowedTypes || []).map((value) => String(value)));
  if (allowed.size && !allowed.has(evidenceType)) {
    throw new Error(`This checkpoint does not accept ${evidenceType} evidence.`);
  }

  const maxBytes = evidenceType === "video"
    ? MAX_PROJECT_VIDEO_BYTES
    : MAX_PROJECT_DOCUMENT_BYTES;
  if (Number(file.size || 0) > maxBytes) {
    throw new Error(
      evidenceType === "video"
        ? "Video evidence must be 50 MB or smaller."
        : "Photo/document evidence must be 20 MB or smaller."
    );
  }

  return evidenceType;
}

export async function uploadProjectEvidence({
  assignmentId,
  studentKey,
  externalId,
  checkpointId,
  file,
  allowedTypes = [],
  onProgress
}) {
  const evidenceType = validateProjectEvidence(file, allowedTypes);

  if (typeof onProgress === "function") onProgress(0.05);

  const response = await fetch("/api/project-evidence-upload", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Assignment-Id": assignmentId,
      "X-Student-Key": studentKey,
      "X-External-Id": externalId,
      "X-Checkpoint-Id": checkpointId,
      "X-File-Name": encodeURIComponent(file.name || "evidence"),
      "X-File-Size": String(file.size || 0),
      "X-Evidence-Type": evidenceType
    },
    body: file
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !result.evidenceId) {
    throw new Error(result.error || "Could not upload project evidence.");
  }

  if (typeof onProgress === "function") onProgress(1);
  return result;
}
