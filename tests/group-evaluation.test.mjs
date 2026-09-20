import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  calculateBlockGrade,
  criteriaToFirebaseObject,
  evaluationBlockNames,
  evaluationWeightTotal,
  groupEvaluationConfig,
  normalizeEvaluationCriteria
} from '../group-evaluation-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const enrollmentHtml = readFileSync(join(root, 'teacher-enrollment.html'), 'utf8');
const enrollmentJs = readFileSync(join(root, 'teacher-enrollment.js'), 'utf8');
const studentsHtml = readFileSync(join(root, 'teacher-students.html'), 'utf8');
const studentsJs = readFileSync(join(root, 'teacher-students.js'), 'utf8');
const gradeRuntimeJs = readFileSync(join(root, 'group-grade-runtime.js'), 'utf8');
const createAssignmentHtml = readFileSync(join(root, 'assignment-create-module.html'), 'utf8');
const createAssignmentJs = readFileSync(join(root, 'assignment-create-module.js'), 'utf8');
const pointsHtml = readFileSync(join(root, 'teacher-points.html'), 'utf8');
const pointsJs = readFileSync(join(root, 'teacher-points.js'), 'utf8');
const blockReportHtml = readFileSync(join(root, 'teacher-block-report.html'), 'utf8');
const blockReportJs = readFileSync(join(root, 'teacher-block-report.js'), 'utf8');

const criteria = [
  { id: 'written', name: 'Written exam', shortLabel: 'E', weight: 35, source: 'writtenExam', order: 0 },
  { id: 'oral', name: 'Oral exam', shortLabel: 'O', weight: 40, source: 'oralExam', order: 1 },
  { id: 'tasks', name: 'Tasks', shortLabel: 'T', weight: 10, source: 'tasks', order: 2 },
  { id: 'verbs', name: 'Verbs exam', shortLabel: 'V', weight: 15, source: 'verbsExam', order: 3 }
];

test('group evaluation criteria are dynamic and must total 100 percent', () => {
  assert.equal(evaluationWeightTotal(criteria), 100);
  const config = groupEvaluationConfig({
    evaluationUnitCount: 4,
    evaluationCriteria: criteriaToFirebaseObject(criteria)
  });
  assert.equal(config.configured, true);
  assert.equal(config.criteria.length, 4);
  assert.equal(config.criteria[0].name, 'Written exam');
  assert.equal(groupEvaluationConfig({ name: 'Legacy' }).configured, false);
});

test('old fixed evaluationWeights are no longer accepted as canonical configuration', () => {
  const config = groupEvaluationConfig({
    evaluationUnitCount: 3,
    evaluationWeights: { tasks: 25, exams: 50, participation: 15, attendance: 10 }
  });
  assert.equal(config.configured, false);
  assert.equal(config.legacyFixedWeightsPresent, true);
});

test('group block names come from configured evaluation unit count', () => {
  assert.deepEqual(
    evaluationBlockNames({
      evaluationUnitCount: 4,
      evaluationCriteria: criteriaToFirebaseObject(criteria)
    }),
    ['Block 1', 'Block 2', 'Block 3', 'Block 4']
  );
});

test('block grade applies arbitrary criteria and their configured weights', () => {
  const grade = calculateBlockGrade({
    criteria,
    valuesByCriterion: {
      written: { value: 28, mode: 'contribution' },
      oral: { value: 32, mode: 'contribution' },
      tasks: { value: 0, mode: 'contribution' },
      verbs: { value: 15, mode: 'contribution' }
    }
  });

  assert.equal(grade.total, 75);
  assert.equal(grade.criteria.find((item) => item.id === 'written').contribution, 28);
  assert.equal(grade.criteria.find((item) => item.id === 'oral').contribution, 32);
});

test('score-mode criteria convert a 0-100 score into weighted contribution', () => {
  const grade = calculateBlockGrade({
    criteria: [{ id: 'project', name: 'Project', weight: 50, source: 'manual', order: 0 }],
    valuesByCriterion: { project: { value: 80, mode: 'score' } }
  });
  assert.equal(grade.total, 40);
});

test('group creation UI uses a dynamic criterion editor and reusable templates', () => {
  for (const id of [
    'evaluationUnitCountInput',
    'evaluationTemplateSelect',
    'useEvaluationTemplateBtn',
    'saveEvaluationTemplateBtn',
    'addEvaluationCriterionBtn',
    'evaluationCriteriaRows',
    'evaluationWeightTotal'
  ]) {
    assert.match(enrollmentHtml, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(enrollmentHtml, /tasksWeightInput|examsWeightInput|participationWeightInput|attendanceWeightInput/);
  assert.match(enrollmentJs, /criteriaToFirebaseObject/);
  assert.match(enrollmentJs, /groupEvaluationTemplates/);
  assert.match(enrollmentJs, /data-evaluation-criterion/);
  assert.match(enrollmentJs, /Evaluation criteria must total exactly 100%/);
});

test('Students renders arbitrary criterion names and dynamic block grades', () => {
  assert.match(studentsHtml, /id="evaluationUnitCountCard"/);
  assert.match(studentsHtml, /id="evaluationSetupSummary"/);
  assert.match(studentsJs, /config\.criteria\.map/);
  assert.match(studentsJs, /calculateStudentBlockGrade/);
  assert.match(gradeRuntimeJs, /calculateBlockGrade/);
  assert.match(gradeRuntimeJs, /evaluationCriterionScores/);
  assert.match(gradeRuntimeJs, /groupEvaluationCriterionId/);
  assert.doesNotMatch(studentsJs, /config\.weights/);
});

test('new assignments can be linked to a group evaluation criterion', () => {
  assert.match(createAssignmentHtml, /id="assignmentGroupCriterion"/);
  assert.match(createAssignmentJs, /groupEvaluationCriterionId/);
  assert.match(createAssignmentJs, /groupEvaluationCriterionName/);
  assert.match(createAssignmentJs, /groupEvaluationConfig/);
  assert.match(createAssignmentJs, /evaluationBlock:/);
});

test('normalization keeps teacher-defined criterion names and sources', () => {
  const normalized = normalizeEvaluationCriteria({
    customKey: { name: 'Portfolio', weight: 25, source: 'manual', order: 1 }
  });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, 'customKey');
  assert.equal(normalized[0].name, 'Portfolio');
  assert.equal(normalized[0].source, 'manual');
});


test('evaluation UI contains no hard-coded CLE grading preset', () => {
  assert.doesNotMatch(enrollmentHtml, /CLE Otoño|CLE Fall|cle-fall-2026/i);
  assert.doesNotMatch(enrollmentJs, /CLE_FALL_2026/);
});

test('criterion short labels persist for configurable report columns', () => {
  const normalized = normalizeEvaluationCriteria(criteria);
  assert.equal(normalized[0].shortLabel, 'E');
  assert.equal(criteriaToFirebaseObject(criteria).written.shortLabel, 'E');
  assert.match(enrollmentJs, /data-criterion-short-label/);
});

test('manual custom criteria have a universal score-entry path', () => {
  assert.match(pointsHtml, /id="manualCriterionGroupSelect"/);
  assert.match(pointsHtml, /id="manualCriterionSelect"/);
  assert.match(pointsHtml, /id="manualCriterionScoreInput"/);
  assert.match(pointsJs, /evaluationCriterionScores/);
  assert.match(pointsJs, /criterion\.source === "manual"/);
});

test('block report is universal and generated from group criteria', () => {
  assert.match(blockReportHtml, /Block Report/);
  assert.match(blockReportHtml, /id="reportOrganizationInput"/);
  assert.match(blockReportHtml, /id="reportSignatureSelect"/);
  assert.match(blockReportJs, /groupEvaluationConfig/);
  assert.match(blockReportJs, /config\.criteria\.map/);
  assert.match(blockReportJs, /calculateStudentBlockGrade/);
  assert.match(blockReportJs, /reportCriterionLabel/);
  assert.doesNotMatch(blockReportJs, /CLE|35%|40%|15%|10%/);
});
