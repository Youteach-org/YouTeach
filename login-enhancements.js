const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

function getPrimaryLoginButton() {
  return (
    document.getElementById("loginBtn") ||
    document.querySelector('[data-login-primary="1"]') ||
    document.querySelector('button[type="submit"]') ||
    document.querySelector('form button') ||
    document.querySelector('button')
  );
}

function wireTeacherLoginRedirect() {
  const btn = getPrimaryLoginButton();

  const redirectIfTeacherSessionExists = () => {
    const raw = localStorage.getItem("youteachTeacherAuth") || sessionStorage.getItem("youteachTeacherAuth");
    if (!raw) return false;

    localStorage.setItem("youteachTeacherAuth", raw);
    sessionStorage.removeItem("youteachTeacherAuth");
    window.location.href = "buzzer.html";
    return true;
  };

  if (redirectIfTeacherSessionExists()) return;

  const runCheck = () => {
    let attempts = 0;
    const maxAttempts = 12;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (redirectIfTeacherSessionExists() || attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 200);
  };

  if (btn) btn.addEventListener("click", runCheck);
  const form = document.querySelector("form");
  if (form) form.addEventListener("submit", runCheck);
}

document.addEventListener("DOMContentLoaded", () => {
  if (page === "teacher-login.html") {
    wireTeacherLoginRedirect();
  }
});