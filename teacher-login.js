import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

sessionStorage.removeItem("firebase:authUser");

const USERS = [
  { username: "teacher", password: "teacher123", role: "teacher", displayName: "Teacher" },
  { username: "admin", password: "admin123", role: "admin", displayName: "Admin" }
];

const WORKING_GROUP_KEY = "youteachWorkingGroup";
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");
const credentialsStep = document.getElementById("credentialsStep");
const workingGroupStep = document.getElementById("workingGroupStep");
const workingGroupSelect = document.getElementById("workingGroupSelect");
const continueWithGroupBtn = document.getElementById("continueWithGroupBtn");
const skipWorkingGroupBtn = document.getElementById("skipWorkingGroupBtn");
const workingGroupMessage = document.getElementById("workingGroupMessage");

let groupsCache = {};
let pendingUser = null;

function renderGroups() {
  const groups = Object.keys(groupsCache || {}).sort();
  const storedGroup = sessionStorage.getItem(WORKING_GROUP_KEY) || "";
  workingGroupSelect.innerHTML =
    '<option value="">Select group</option>' +
    groups.map((group) => `<option value="${group}">${group}</option>`).join("");

  if (storedGroup && groups.includes(storedGroup)) {
    workingGroupSelect.value = storedGroup;
  }

  if (!groups.length) {
    workingGroupMessage.textContent = "No registered groups yet. You may skip for now.";
  } else {
    workingGroupMessage.textContent = "";
  }
}

function showWorkingGroupStep(user) {
  pendingUser = user;
  credentialsStep.hidden = true;
  workingGroupStep.hidden = false;
  renderGroups();
}

function completeLogin(groupName = "") {
  const user = pendingUser;
  if (!user) return;

  sessionStorage.setItem("youteachTeacherAuth", "true");
  sessionStorage.setItem("youteachTeacherRole", user.role);
  sessionStorage.setItem("youteachTeacherName", user.displayName);

  if (groupName) {
    sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  } else {
    sessionStorage.removeItem(WORKING_GROUP_KEY);
  }

  window.location.href = "buzzer.html";
}

function doTeacherLogin() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const user = USERS.find((item) => item.username === username && item.password === password);

  if (!user) {
    loginMessage.textContent = "Invalid username or password.";
    loginMessage.className = "status-text bad";
    return;
  }

  showWorkingGroupStep(user);
}

loginBtn.addEventListener("click", doTeacherLogin);

continueWithGroupBtn.addEventListener("click", () => {
  const groupName = workingGroupSelect.value;
  if (!groupName) {
    workingGroupMessage.textContent = "Select a group or use Skip for now.";
    workingGroupMessage.className = "status-text bad";
    return;
  }
  completeLogin(groupName);
});

skipWorkingGroupBtn.addEventListener("click", () => completeLogin(""));

[usernameInput, passwordInput].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      doTeacherLogin();
    }
  });
});

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderGroups();
});