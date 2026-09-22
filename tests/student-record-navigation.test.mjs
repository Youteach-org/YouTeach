import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const assignmentsJs = readFileSync(join(root, "teacher-assignments.js"), "utf8");
const summaryJs = readFileSync(join(root, "student-summary.js"), "utf8");
const summaryHtml = readFileSync(join(root, "student-summary.html"), "utf8");

test("double-clicking an assignment student card opens that student's record", () => {
  assert.match(assignmentsJs, /function openStudentRecord\(studentKey\)/);
  assert.match(assignmentsJs, /submissionList\.addEventListener\("dblclick"/);
  assert.match(assignmentsJs, /data-student-record-key=/);
  assert.match(assignmentsJs, /student-summary\.html\?teacherViewStudentKey=/);
});

test("Student Summary name double-click opens a searchable picker limited to the active group", () => {
  assert.match(summaryHtml, /<dialog id="studentPickerDialog">/);
  assert.match(summaryHtml, /id="studentPickerSearch"/);
  assert.match(summaryHtml, /id="studentPickerList"/);
  assert.match(summaryJs, /displayNameCard\.addEventListener\("dblclick"/);
  assert.match(summaryJs, /function renderStudentPicker\(/);
  assert.match(summaryJs, /teacherGroupEntries\(\)/);
  assert.match(summaryJs, /selectTeacherStudent\(/);
  assert.match(summaryJs, /studentPrimaryDisplay/);
});

test("Student Summary T reads assignment grading while P and A keep their existing storage", () => {
  assert.match(summaryJs, /taskCriterionContribution/);
  assert.match(summaryJs, /onValue\(ref\(db, "assignments"\)/);
  assert.match(summaryJs, /onValue\(ref\(db, "assignmentSubmissions"\)/);
  assert.match(summaryJs, /student\?\.blockPoints\?\.\[blockName\]/);
  assert.match(summaryJs, /student\?\.attendancePoints\?\.\[blockName\]/);
});
