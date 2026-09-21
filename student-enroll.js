import { db } from "./firebase.js";
import { ref, get, push, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const enrollmentGroupChip = document.getElementById("enrollmentGroupChip");
const invalidEnrollmentMessage = document.getElementById("invalidEnrollmentMessage");
const enrollmentRequestForm = document.getElementById("enrollmentRequestForm");
const enrollmentFullName = document.getElementById("enrollmentFullName");
const enrollmentNickname = document.getElementById("enrollmentNickname");
const enrollmentExternalId = document.getElementById("enrollmentExternalId");
const submitEnrollmentRequestBtn = document.getElementById("submitEnrollmentRequestBtn");
const enrollmentRequestStatus = document.getElementById("enrollmentRequestStatus");

const params = new URLSearchParams(window.location.search);
const groupName = String(params.get("group") || "").trim();
const token = String(params.get("token") || "").trim();

let validatedGroup = null;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function showInvalid() {
  validatedGroup = null;
  enrollmentGroupChip.textContent = groupName || "Unknown group";
  enrollmentRequestForm.hidden = true;
  invalidEnrollmentMessage.hidden = false;
}

async function validateInvitation() {
  if (!groupName || !token) {
    showInvalid();
    return;
  }

  const snapshot = await get(ref(db, `groups/${groupName}`));
  const group = snapshot.val();

  if (!group || group?.enrollment?.enabled === false || String(group?.enrollment?.token || "") !== token) {
    showInvalid();
    return;
  }

  validatedGroup = group;
  enrollmentGroupChip.textContent = groupName;
  invalidEnrollmentMessage.hidden = true;
  enrollmentRequestForm.hidden = false;
}

async function findMatchingPendingRequest(fullName, externalId) {
  const snapshot = await get(ref(db, `groupEnrollmentRequests/${groupName}`));
  const requests = snapshot.val() || {};
  const nameKey = normalize(fullName);
  const externalKey = normalize(externalId);

  return Object.entries(requests).find(([, request]) => {
    if (String(request?.status || "pending") !== "pending") return false;
    const sameName = normalize(request?.fullName || request?.name) === nameKey;
    const requestExternal = normalize(request?.externalId || request?.studentNumber);
    const sameExternal = externalKey && requestExternal && requestExternal === externalKey;
    return sameName || sameExternal;
  }) || null;
}

enrollmentRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validatedGroup) {
    showInvalid();
    return;
  }

  const fullName = enrollmentFullName.value.trim();
  const nickname = enrollmentNickname.value.trim() || fullName.split(" ")[0] || "";
  const externalId = enrollmentExternalId.value.trim();

  if (!fullName) {
    enrollmentRequestStatus.textContent = "Enter your full name.";
    enrollmentRequestStatus.className = "enroll-status status-text bad";
    return;
  }

  submitEnrollmentRequestBtn.disabled = true;
  enrollmentRequestStatus.textContent = "Sending request…";
  enrollmentRequestStatus.className = "enroll-status status-text";

  try {
    const existing = await findMatchingPendingRequest(fullName, externalId);
    if (existing) {
      enrollmentRequestStatus.textContent = "Your enrollment request is already pending teacher approval.";
      enrollmentRequestStatus.className = "enroll-status status-text ok";
      enrollmentRequestForm.hidden = true;
      return;
    }

    const requestRef = push(ref(db, `groupEnrollmentRequests/${groupName}`));
    await set(requestRef, {
      groupName,
      fullName,
      nickname,
      externalId,
      status: "pending",
      requestedAt: Date.now(),
      source: "enrollment-link"
    });

    enrollmentRequestStatus.textContent = "Request sent. Your teacher must approve it before you are enrolled.";
    enrollmentRequestStatus.className = "enroll-status status-text ok";
    enrollmentRequestForm.reset();
    enrollmentRequestForm.hidden = true;
  } catch (error) {
    console.error(error);
    enrollmentRequestStatus.textContent = "The request could not be sent. Try again or ask your teacher for help.";
    enrollmentRequestStatus.className = "enroll-status status-text bad";
  } finally {
    submitEnrollmentRequestBtn.disabled = false;
  }
});

validateInvitation().catch((error) => {
  console.error(error);
  showInvalid();
});