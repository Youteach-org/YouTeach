import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEM_CATEGORIES,
  activityDefinition,
  activityMetadataForAssignment,
  activitySubtypeForLegacyCode,
  activityTypesForSystemCategory,
  defaultGradingForActivity,
  systemCategoryForLegacyTypeCode
} from '../assignment-activity-model.js';

test('system families stay intentionally small and stable', () => {
  assert.deepEqual(
    SYSTEM_CATEGORIES.map((category) => category.key),
    ['EXAM', 'TASK', 'PARTICIPATION', 'ATTENDANCE', 'OTHER']
  );
});

test('legacy assignment codes map to the approved system family and subtype', () => {
  assert.equal(activitySubtypeForLegacyCode('EX'), 'GENERIC_EXAM');
  assert.equal(activitySubtypeForLegacyCode('CT'), 'CLASSWORK');
  assert.equal(activitySubtypeForLegacyCode('HW'), 'HOMEWORK');
  assert.equal(activitySubtypeForLegacyCode('PJ'), 'PROJECT');
  assert.equal(activitySubtypeForLegacyCode('PC'), 'PRACTICE');
  assert.equal(activitySubtypeForLegacyCode('RS'), 'RESEARCH');
  assert.equal(activitySubtypeForLegacyCode('PT'), 'PRESENTATION');
  assert.equal(activitySubtypeForLegacyCode('COG'), 'COG');

  assert.equal(systemCategoryForLegacyTypeCode('EX'), 'EXAM');
  assert.equal(systemCategoryForLegacyTypeCode('PJ'), 'TASK');
  assert.equal(systemCategoryForLegacyTypeCode('COG'), 'PARTICIPATION');
});

test('exam and task families expose configurable activity subtypes', () => {
  const exams = activityTypesForSystemCategory('EXAM').map((item) => item.key);
  const tasks = activityTypesForSystemCategory('TASK').map((item) => item.key);

  for (const subtype of ['GENERIC_EXAM', 'WRITTEN_EXAM', 'ORAL_EXAM', 'VERBS_EXAM', 'ONLINE_EXAM']) {
    assert.ok(exams.includes(subtype));
  }
  for (const subtype of ['CLASSWORK', 'HOMEWORK', 'PROJECT', 'PRACTICE', 'RESEARCH', 'PRESENTATION', 'PORTFOLIO']) {
    assert.ok(tasks.includes(subtype));
  }
});

test('activity subtype supplies grading defaults without replacing the evaluation category', () => {
  assert.deepEqual(defaultGradingForActivity('ORAL_EXAM'), {
    gradingScheme: 'ORAL_RUBRIC',
    gradingWorkflow: 'HYBRID'
  });
  assert.deepEqual(defaultGradingForActivity('PRACTICE'), {
    gradingScheme: 'CHECKLIST',
    gradingWorkflow: 'MANUAL'
  });
});

test('new metadata wins while legacy assignments still receive deterministic activity metadata', () => {
  assert.deepEqual(activityMetadataForAssignment({
    assignmentTypeCode: 'PJ',
    activitySubtype: 'PROJECT',
    activitySubtypeLabel: 'Capstone project',
    systemCategory: 'TASK',
    gradingScheme: 'RUBRIC',
    gradingWorkflow: 'AI_ASSISTED'
  }), {
    systemCategory: 'TASK',
    activitySubtype: 'PROJECT',
    activitySubtypeLabel: 'Capstone project',
    assignmentTypeCode: 'PJ',
    gradingScheme: 'RUBRIC',
    gradingWorkflow: 'AI_ASSISTED'
  });

  const legacy = activityMetadataForAssignment({
    assignmentTypeCode: 'HW',
    assignmentType: 'Homework'
  });
  assert.equal(legacy.systemCategory, 'TASK');
  assert.equal(legacy.activitySubtype, 'HOMEWORK');
  assert.equal(legacy.assignmentTypeCode, 'HW');
});

test('activity definitions preserve legacy task-code compatibility', () => {
  assert.equal(activityDefinition('WRITTEN_EXAM')?.legacyCode, 'EX');
  assert.equal(activityDefinition('PROJECT')?.legacyCode, 'PJ');
  assert.equal(activityDefinition('COG')?.legacyCode, 'COG');
});
