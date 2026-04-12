const USERS = [
  { username: "teacher", password: "teacher123", role: "teacher", displayName: "Teacher" },
  { username: "admin", password: "admin123", role: "admin", displayName: "Admin" }
];

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");

if (sessionStorage.getItem("youteachTeacherAuth") === "true") {
  window.location.href = "teacher.html";
}

loginBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  const user = USERS.find((item) => item.username === username && item.password === password);

  if (!user) {
    loginMessage.textContent = "Invalid username or password.";
    loginMessage.className = "status-text bad";
    return;
  }

  sessionStorage.setItem("youteachTeacherAuth", "true");
  sessionStorage.setItem("youteachTeacherRole", user.role);
  sessionStorage.setItem("youteachTeacherName", user.displayName);
  window.location.href = "teacher.html";
});
