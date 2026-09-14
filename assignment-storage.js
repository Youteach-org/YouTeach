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

  const sessionResponse = await fetch("/api/drive-upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assignmentId,
      studentKey,
      externalId,
      fileSize: file.size,
      mimeType: "application/pdf"
    })
  });

  const session = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok || !session.ok || !session.sessionUrl) {
    throw new Error(session.error || "Could not connect YouTeach to Google Drive.");
  }

  if (typeof onProgress === "function") onProgress(0.2);

  const uploadResponse = await fetch(session.sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error(`Google Drive upload failed (HTTP ${uploadResponse.status}).`);
  }

  const driveFile = await uploadResponse.json();
  if (!driveFile?.id) throw new Error("Google Drive did not return the uploaded file ID.");

  if (typeof onProgress === "function") onProgress(1);

  return {
    driveFileId: driveFile.id,
    driveFileName: driveFile.name || session.fileName,
    driveFileUrl: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`,
    driveFolderId: session.folderId,
    driveFolderUrl: session.folderUrl,
    mimeType: "application/pdf",
    size: Number(driveFile.size || file.size || 0),
    uploadedAt: Date.now()
  };
}
