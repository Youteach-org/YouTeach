import { app } from "./firebase.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const auth = getAuth(app);
const storage = getStorage(app);

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.82;

export function safeSegment(value, fallback = "item") {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return text || fallback;
}

export async function ensureAssignmentStorageAuth() {
  if (auth.currentUser) return auth.currentUser;
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    const wrapped = new Error(
      "Photo storage is not enabled yet. Firebase Anonymous Authentication must be enabled for YouTeach assignments."
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function preparePhoto(file) {
  const type = String(file?.type || "").toLowerCase();
  const isPdf = type === "application/pdf" || String(file?.name || "").toLowerCase().endsWith(".pdf");

  if (!file || !isPdf) {
    throw new Error("Only PDF files are accepted.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Each PDF must be 8 MB or smaller.");
  }

  return file;
}

export async function uploadAssignmentPhoto({
  assignmentId,
  taskCode,
  studentKey,
  studentNumber,
  groupName,
  file,
  index,
  onProgress
}) {
  const user = await ensureAssignmentStorageAuth();
  const prepared = await preparePhoto(file);
  const extension = "pdf";
  const studentLabel = safeSegment(studentNumber || studentKey, "student");
  const safeTaskCode = safeSegment(taskCode || assignmentId, "task");
  const fileName = `${studentLabel}--${safeTaskCode}--${String(index + 1).padStart(2, "0")}.${extension}`;
  const path = [
    "assignments",
    safeTaskCode,
    safeSegment(studentKey),
    fileName
  ].join("/");

  const target = storageRef(storage, path);
  const task = uploadBytesResumable(target, prepared, {
    contentType: prepared.type || "image/jpeg",
    customMetadata: {
      assignmentId: String(assignmentId),
      studentKey: String(studentKey),
      studentNumber: String(studentNumber || ""),
      groupName: String(groupName || ""),
      uploaderUid: user.uid
    }
  });

  await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        if (typeof onProgress === "function") {
          onProgress(snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes));
        }
      },
      reject,
      resolve
    );
  });

  const downloadURL = await getDownloadURL(task.snapshot.ref);
  return {
    downloadURL,
    storagePath: path,
    fileName: prepared.name,
    contentType: prepared.type || "image/jpeg",
    size: prepared.size,
    uploadedAt: Date.now()
  };
}
