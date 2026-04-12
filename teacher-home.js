import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

requireTeacherAuth();

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const activeBlockCard = document.getElementById("activeBlockCard");
const blockStatusCard = document.getElementById("blockStatusCard");
const studentCountCard = document.getElementById("studentCountCard");
const sessionCard = document.getElementById("sessionCard");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let activeBlock = "Block 1";
let closedBlocks = {};
let session = null;

onValue(ref(db, "settings"), (snapshot) => {
  const settings = snapshot.val() || {};
  activeBlock = settings.activeBlock || "Block 1";
  closedBlocks = settings.closedBlocks || {};
  activeBlockCard.textContent = activeBlock;
  blockStatusCard.textContent = closedBlocks[activeBlock] ? "CLOSED" : "OPEN";
});

onValue(ref(db, "students"), (snapshot) => {
  const students = snapshot.val() || {};
  studentCountCard.textContent = String(Object.keys(students).length);
});

onValue(ref(db, "session/current"), (snapshot) => {
  session = snapshot.val() || null;
  sessionCard.textContent = session?.active ? "Yes" : "No";
});
