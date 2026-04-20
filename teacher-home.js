import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const activeBlockCard = document.getElementById("activeBlockCard");
const blockStatusCard = document.getElementById("blockStatusCard");
const studentCountCard = document.getElementById("studentCountCard");
const presentCountCard = document.getElementById("presentCountCard");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);


function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

let activeBlock = "Block 1";
let closedBlocks = {};

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

onValue(ref(db, `attendance/${todayKey()}`), (snapshot) => {
  const attendance = snapshot.val() || {};
  const present = Object.values(attendance).filter((row) => row.activeNow !== false).length;
  presentCountCard.textContent = String(present);
});

