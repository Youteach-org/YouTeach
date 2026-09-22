export const STUDENT_DISPLAY_MODES = ["name", "lastNames", "nickname"];

function fullName(student) {
  return String(student?.fullName || student?.name || student?.nickname || "").trim();
}

function nameParts(student) {
  const complete = fullName(student);
  const explicitGiven = String(student?.firstName || student?.givenName || "").trim();
  const explicitLast = String(student?.lastName || student?.lastNames || student?.surname || "").trim();
  if (explicitGiven || explicitLast) {
    return { givenNames: explicitGiven || complete, lastNames: explicitLast, fullName: complete };
  }

  const tokens = complete.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { givenNames: complete, lastNames: "", fullName: complete };
  if (tokens.length === 2) return { givenNames: tokens[0], lastNames: tokens[1], fullName: complete };

  const letters = complete.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  const surnameFirst = letters && letters === letters.toLocaleUpperCase();
  return surnameFirst
    ? { givenNames: tokens.slice(2).join(" "), lastNames: tokens.slice(0, 2).join(" "), fullName: complete }
    : { givenNames: tokens.slice(0, -2).join(" "), lastNames: tokens.slice(-2).join(" "), fullName: complete };
}

function orderedName(student, lastNamesFirst = false) {
  const parts = nameParts(student);
  if (!parts.lastNames || !parts.givenNames) return parts.fullName || parts.givenNames || parts.lastNames;
  return lastNamesFirst
    ? `${parts.lastNames} ${parts.givenNames}`.trim()
    : `${parts.givenNames} ${parts.lastNames}`.trim();
}

export function normalizeStudentDisplayMode(mode) {
  return STUDENT_DISPLAY_MODES.includes(mode) ? mode : "name";
}

export function nextStudentDisplayMode(mode) {
  const current = normalizeStudentDisplayMode(mode);
  const index = STUDENT_DISPLAY_MODES.indexOf(current);
  return STUDENT_DISPLAY_MODES[(index + 1) % STUDENT_DISPLAY_MODES.length];
}

export function studentDisplayModeLabel(mode) {
  if (mode === "lastNames") return "Last names";
  if (mode === "nickname") return "Nicknames";
  return "Names";
}

export function studentPrimaryDisplay(student, mode) {
  if (mode === "lastNames") return orderedName(student, true);
  if (mode === "nickname") return String(student?.nickname || "").trim() || orderedName(student);
  return orderedName(student);
}
