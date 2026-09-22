import { studentGroupNames, studentInGroup } from "./student-groups.js";

export function planStudentRemovalFromGroup(students, groupName) {
  const targetGroup = String(groupName || "").trim();
  const updates = {};
  const deletedStudentKeys = [];

  if (!targetGroup) return { updates, deletedStudentKeys };

  Object.entries(students || {}).forEach(([studentKey, student]) => {
    if (!studentInGroup(student, targetGroup)) return;

    const remainingGroups = studentGroupNames(student)
      .filter((name) => name !== targetGroup);

    if (!remainingGroups.length) {
      updates[`students/${studentKey}`] = null;
      deletedStudentKeys.push(studentKey);
      return;
    }

    updates[`students/${studentKey}/groupMemberships/${targetGroup}`] = null;
    if (String(student?.groupName || "").trim() === targetGroup) {
      updates[`students/${studentKey}/groupName`] = remainingGroups[0];
    }
  });

  return { updates, deletedStudentKeys };
}
