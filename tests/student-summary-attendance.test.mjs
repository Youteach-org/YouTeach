import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'student-summary.html'), 'utf8');
const js = readFileSync(join(root, 'student-summary.js'), 'utf8');
const studentMenuJs = readFileSync(join(root, 'student-menu.js'), 'utf8');
const studentAuthJs = readFileSync(join(root, 'student-auth.js'), 'utf8');

test('Student Summary uses compact one-line metadata cards and presence only on the name badge', () => {
  assert.match(html, /id="displayNameCard" class="student-name-badge"/);
  assert.match(html, /class="summary-compact-row"/);
  assert.match(html, /id="groupCard"/);
  assert.match(html, /id="classActiveBlockHero"/);
  assert.match(html, /id="totalBlockPointsCard"/);
  assert.doesNotMatch(html, /attendanceStatusBar|Current status today|hero-label|classActiveBlockStatus/);
  assert.match(js, /displayNameCard\.classList\.toggle\("present-now", currentStudent\.activeNow === true\)/);
  assert.doesNotMatch(js, /renderAttendanceStatus|attendanceStatusText/);
});

test('student login creates live green presence but not official attendance', () => {
  assert.match(studentMenuJs, /activeNow: true/);
  assert.match(studentMenuJs, /lastSeenAt: Date\.now\(\)/);
  assert.doesNotMatch(studentMenuJs, /attendanceValidated|attendance\/\$\{today\}/);
  const leaveStart = studentAuthJs.indexOf('export async function setStudentLeave');
  const loginStart = studentAuthJs.indexOf('export async function loginStudentByExternalIdAndPassword', leaveStart);
  const leaveBlock = studentAuthJs.slice(leaveStart, loginStart);
  assert.doesNotMatch(leaveBlock, /await set\(/);
});

test('Active Today and legacy attendance validation pages are removed', () => {
  assert.equal(existsSync(join(root, 'teacher-active.html')), false);
  assert.equal(existsSync(join(root, 'teacher-active.js')), false);
  assert.equal(existsSync(join(root, 'attendance-validation.js')), false);
});


test('Teacher Student Summary defaults to the first student in the active group and navigates within that group', () => {
  assert.match(html, /id="previousStudentBtn"/);
  assert.match(html, /id="nextStudentBtn"/);
  assert.match(js, /function teacherGroupEntries\(\)/);
  assert.match(js, /studentInGroup\(student, groupName\)/);
  assert.match(js, /selectTeacherStudent\(entries\[0\]\[0\]\)/);
  assert.match(js, /previousStudentBtn\.addEventListener\("click"/);
  assert.match(js, /nextStudentBtn\.addEventListener\("click"/);
  assert.match(js, /sessionStorage\.getItem\(WORKING_GROUP_KEY\)/);
});
