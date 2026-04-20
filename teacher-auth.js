export function requireTeacherAuth() {
  if (sessionStorage.getItem("youteachTeacherAuth") !== "true") {
    window.location.href = "teacher-login.html";
    return false;
  }
  return true;
}

export function getTeacherName() {
  return sessionStorage.getItem("youteachTeacherName") || "Teacher";
}

export function logoutTeacher() {
  sessionStorage.removeItem("youteachTeacherAuth");
  sessionStorage.removeItem("youteachTeacherRole");
  sessionStorage.removeItem("youteachTeacherName");
  localStorage.removeItem("youteachTeacherAuth");
  localStorage.removeItem("youteachTeacherRole");
  localStorage.removeItem("youteachTeacherName");
  window.location.href = "index.html";
}