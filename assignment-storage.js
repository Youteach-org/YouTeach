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

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image."));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch (_) {}
  }
  return loadImageFromFile(file);
}

export async function preparePhoto(file) {
  const type = String(file?.type || "").toLowerCase();
  const isImage = type.startsWith("image/");
  const isPdf = type === "application/pdf" || String(file?.name || "").toLowerCase().endsWith(".pdf");

  if (!file || (!isImage && !isPdf)) {
    throw new Error("Only images or PDF files are accepted.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Each file must be 12 MB or smaller.");
  }

  if (isPdf) {
    return file;
  }

  try {
    const image = await decodeImage(file);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    if (typeof image.close === "function") image.close();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Could not compress this photo.")),
        "image/jpeg",
        JPEG_QUALITY
      );
    });

    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error("The compressed photo is still too large.");
    }

    const baseName = safeSegment(String(file.name || "photo").replace(/\.[^.]+$/, ""), "photo");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch (error) {
    if (file.size <= MAX_UPLOAD_BYTES) return file;
    throw error;
  }
}

export async function uploadAssignmentPhoto({
  assignmentId,
  studentKey,
  studentNumber,
  groupName,
  file,
  index,
  onProgress
}) {
  const user = await ensureAssignmentStorageAuth();
  const prepared = await preparePhoto(file);
  const extension = prepared.type === "application/pdf" || String(prepared.name).toLowerCase().endsWith(".pdf") ? "pdf" : "jpg";
  const studentLabel = safeSegment(studentNumber || studentKey, "student");
  const taskCode = safeSegment(assignmentId, "task");
  const fileName = `${studentLabel}--${taskCode}--${String(index + 1).padStart(2, "0")}.${extension}`;
  const path = [
    "assignments",
    taskCode,
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
