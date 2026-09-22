export function studentGroupNames(student = {}) {
  const names = new Set();
  const primary = String(student?.groupName || "").trim();
  if (primary) names.add(primary);

  const memberships = student?.groupMemberships;
  if (Array.isArray(memberships)) {
    memberships.forEach((groupName) => {
      const clean = String(groupName || "").trim();
      if (clean) names.add(clean);
    });
  } else if (memberships && typeof memberships === "object") {
    Object.entries(memberships).forEach(([groupName, value]) => {
      const clean = String(groupName || "").trim();
      const active = value === true || (value && typeof value === "object" && value.active !== false);
      if (clean && active) names.add(clean);
    });
  }

  return [...names];
}

export function studentInGroup(student, groupName) {
  const target = String(groupName || "").trim();
  if (!target) return true;
  return studentGroupNames(student).includes(target);
}

export function primaryStudentGroup(student) {
  return String(student?.groupName || studentGroupNames(student)[0] || "").trim();
}
