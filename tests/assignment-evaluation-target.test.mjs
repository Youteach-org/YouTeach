import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssignmentEvaluationTarget,
  evaluationTargetForAssignment,
  hasAiGradedSubmission,
  legacyAssignmentMigrationTarget,
  resolveAssignmentCriterion
} from '../assignment-evaluation-target.js';

const group = {
  evaluationUnitCount: 3,
  evaluationCriteria: {
    written: { id: 'written', name: 'Written exam', weight: 40, source: 'writtenExam', order: 0 },
    tasks: { id: 'tasks', name: 'Tasks', weight: 30, source: 'tasks', order: 1 },
    participation: { id: 'participation', name: 'Participation', weight: 30, source: 'participation', order: 2 }
  }
};

test('assignment criterion defaults prefer the group mapping and fall back to one task/assignment criterion', () => {
  assert.equal(resolveAssignmentCriterion(group, 'HW')?.id, 'tasks');
  const mapped = {
    ...group,
    assignmentCriterionDefaults: { PJ: 'participation' }
  };
  assert.equal(resolveAssignmentCriterion(mapped, 'PJ')?.id, 'participation');
});

test('evaluation targets keep block and criterion separate from assignment type', () => {
  const target = buildAssignmentEvaluationTarget({
    groupName: '533-2',
    block: 'Block 2',
    criterion: { id: 'tasks', name: 'Tasks' },
    assignment: { assignmentTypeCode: 'PJ' }
  });
  assert.deepEqual(target, {
    groupName: '533-2',
    block: 'Block 2',
    criterionId: 'tasks',
    criterionNameSnapshot: 'Tasks',
    mode: 'assignment'
  });
});

test('exams belong to a block but not to an assignment criterion', () => {
  const target = buildAssignmentEvaluationTarget({
    groupName: '533-2',
    block: 'Block 1',
    criterion: { id: 'tasks', name: 'Tasks' },
    assignment: { assignmentTypeCode: 'EX' }
  });
  assert.equal(target.block, 'Block 1');
  assert.equal(target.criterionId, '');
  assert.equal(target.mode, 'exam');
});

test('new target model reads before legacy fields and remains backward compatible', () => {
  assert.equal(
    evaluationTargetForAssignment({
      groupName: 'G',
      evaluationBlock: 'Block 1',
      groupEvaluationCriterionId: 'old',
      evaluationTarget: { groupName: 'G', block: 'Block 2', criterionId: 'new', mode: 'assignment' }
    }).criterionId,
    'new'
  );
  assert.equal(
    evaluationTargetForAssignment({
      groupName: 'G',
      evaluationBlock: 'Block 1',
      groupEvaluationCriterionId: 'old'
    }).criterionId,
    'old'
  );
});

test('AI grade detection requires a real score plus ChatGPT provenance', () => {
  assert.equal(hasAiGradedSubmission({
    s1: { grading: { totalScore: 87, gradedBy: 'ChatGPT' } }
  }), true);
  assert.equal(hasAiGradedSubmission({
    s1: { grading: { totalScore: 87, gradedBy: 'Teacher' } }
  }), false);
});

test('legacy AI graded non-exam assignments migrate to Block 1 and an unambiguous criterion', () => {
  const target = legacyAssignmentMigrationTarget({
    assignment: { groupName: 'G', assignmentTypeCode: 'HW' },
    group,
    groupName: 'G',
    submissions: {
      s1: { grading: { totalScore: 92, gradedBy: 'ChatGPT' } }
    }
  });
  assert.equal(target.block, 'Block 1');
  assert.equal(target.criterionId, 'tasks');
  assert.equal(target.needsReview, false);
});

test('ambiguous criterion migrations are flagged instead of guessed', () => {
  const ambiguousGroup = {
    evaluationUnitCount: 2,
    evaluationCriteria: {
      a: { id: 'a', name: 'Portfolio', weight: 50, source: 'manual', order: 0 },
      b: { id: 'b', name: 'Lab record', weight: 50, source: 'manual', order: 1 }
    }
  };
  const target = legacyAssignmentMigrationTarget({
    assignment: { groupName: 'G', assignmentTypeCode: 'HW' },
    group: ambiguousGroup,
    groupName: 'G',
    submissions: {
      s1: { grading: { totalScore: 80, gradedBy: 'ChatGPT' } }
    }
  });
  assert.equal(target.block, 'Block 1');
  assert.equal(target.criterionId, '');
  assert.equal(target.needsReview, true);
});
