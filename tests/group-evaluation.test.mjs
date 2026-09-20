import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  calculateBlockGrade,
  evaluationBlockNames,
  evaluationWeightTotal,
  groupEvaluationConfig
} from '../group-evaluation-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const enrollmentHtml = readFileSync(join(root, 'teacher-enrollment.html'), 'utf8');
const enrollmentJs = readFileSync(join(root, 'teacher-enrollment.js'), 'utf8');
const studentsHtml = readFileSync(join(root, 'teacher-students.html'), 'utf8');
const studentsJs = readFileSync(join(root, 'teacher-students.js'), 'utf8');
const createAssignmentJs = readFileSync(join(root, 'assignment-create-module.js'), 'utf8');

test('group evaluation weights must form a 100 percent policy', () => {
  assert.equal(evaluationWeightTotal({ tasks: 30, exams: 40, participation: 20, attendance: 10 }), 100);
  assert.equal(groupEvaluationConfig({
    evaluationUnitCount: 4,
    evaluationWeights: { tasks: 30, exams: 40, participation: 20, attendance: 10 }
  }).configured, true);
  assert.equal(groupEvaluationConfig({ name: 'Legacy' }).configured, false);
});

test('group block names come from configured evaluation unit count', () => {
  assert.deepEqual(
    evaluationBlockNames({
      evaluationUnitCount: 4,
      evaluationWeights: { tasks: 25, exams: 25, participation: 25, attendance: 25 }
    }),
    ['Block 1', 'Block 2', 'Block 3', 'Block 4']
  );
});

test('block grade applies configured category weights', () => {
  const grade = calculateBlockGrade({
    weights: { tasks: 30, exams: 40, participation: 20, attendance: 10 },
    taskScores: [80, 100],
    examScores: [75],
    participationPoints: 12,
    attendancePoints: 10
  });

  assert.equal(grade.contributions.tasks, 27);
  assert.equal(grade.contributions.exams, 30);
  assert.equal(grade.contributions.participation, 12);
  assert.equal(grade.contributions.attendance, 10);
  assert.equal(grade.total, 79);
});

test('legacy task and exam points remain fallback contributions', () => {
  const grade = calculateBlockGrade({
    weights: { tasks: 20, exams: 50, participation: 20, attendance: 10 },
    legacyTaskPoints: 18,
    legacyExamPoints: 45,
    participationPoints: 50,
    attendancePoints: 7
  });

  assert.equal(grade.contributions.tasks, 18);
  assert.equal(grade.contributions.exams, 45);
  assert.equal(grade.contributions.participation, 20);
  assert.equal(grade.contributions.attendance, 7);
  assert.equal(grade.total, 90);
});

test('group creation UI captures units and four evaluation categories', () => {
  for (const id of [
    'evaluationUnitCountInput',
    'tasksWeightInput',
    'examsWeightInput',
    'participationWeightInput',
    'attendanceWeightInput',
    'evaluationWeightTotal'
  ]) {
    assert.match(enrollmentHtml, new RegExp(`id="${id}"`));
  }
  assert.match(enrollmentJs, /evaluationWeights/);
  assert.match(enrollmentJs, /evaluationUnitCount/);
  assert.match(enrollmentJs, /Evaluation criteria must total exactly 100%/);
  assert.match(enrollmentJs, /data-edit-group-evaluation/);
});

test('Students renders dynamic block grades from group policy', () => {
  assert.match(studentsHtml, /id="evaluationUnitCountCard"/);
  assert.match(studentsHtml, /id="evaluationSetupSummary"/);
  assert.match(studentsJs, /evaluationBlockNames/);
  assert.match(studentsJs, /calculateBlockGrade/);
  assert.match(studentsJs, /assignmentSubmissions/);
  assert.match(studentsJs, /Setup required/);
  assert.doesNotMatch(studentsJs, /getTotalPointsForBlock/);
});

test('new assignments are tagged with the active evaluation block', () => {
  assert.match(createAssignmentJs, /evaluationBlock:/);
  assert.match(createAssignmentJs, /settingsCache\.activeBlock/);
  assert.match(createAssignmentJs, /onValue\(ref\(db, "settings"\)/);
});
