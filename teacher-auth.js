const SESSION_TOKEN_KEY = "youteachTeacherSession";
const SESSION_EXPIRES_KEY = "youteachTeacherSessionExpiresAt";

export function requireTeacherAuth() {
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
  const expiresAt = Number(sessionStorage.getItem(SESSION_EXPIRES_KEY) || 0);
  if (!token || !expiresAt || expiresAt <= Date.now()) {
    logoutTeacher(false);
    window.location.href = "teacher-login.html";
    return false;
  }
  return true;
}

export function getTeacherSessionToken() {
  return sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
}

export function getTeacherName() {
  return sessionStorage.getItem("youteachTeacherName") || "Teacher";
}

export function getTeacherRole() {
  return sessionStorage.getItem("youteachTeacherRole") || "teacher";
}

export function logoutTeacher(redirect = true) {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  sessionStorage.removeItem("youteachTeacherRole");
  sessionStorage.removeItem("youteachTeacherName");
  sessionStorage.removeItem("youteachWorkingGroup");
  localStorage.removeItem("youteachTeacherAuth");
  localStorage.removeItem("youteachTeacherRole");
  localStorage.removeItem("youteachTeacherName");
  if (redirect) window.location.href = "index.html";
}
