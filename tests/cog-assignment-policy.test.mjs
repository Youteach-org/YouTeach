import test from 'node:test';
import assert from 'node:assert/strict';

import {
  proportionalPoints,
  submissionLabel,
  canUndoSubmission,
  stateAfterUndo,
  isOnTime,
  trashExpiresAt,
  restoredDraftState
} from '../cog-assignment-policy.mjs';

test('COG percentage converts proportionally into assignment points', () => {
  assert.equal(proportionalPoints(92, 15), 13.8);
  assert.equal(proportionalPoints(100, 20), 20);
  assert.equal(proportionalPoints(0, 20), 0);
});

test('visible resubmission numbering is separate from first submission', () => {
  assert.equal(submissionLabel(0), 'Entrega');
  assert.equal(submissionLabel(1), 'Reentrega 1');
  assert.equal(submissionLabel(3), 'Reentrega 3');
});

test('Undo Submission depends on open task and assignment-level toggle', () => {
  assert.equal(canUndoSubmission({ assignmentOpen: true, undoEnabled: true }), true);
  assert.equal(canUndoSubmission({ assignmentOpen: false, undoEnabled: true }), false);
  assert.equal(canUndoSubmission({ assignmentOpen: true, undoEnabled: false }), false);
});

test('Undo clears active official grade while waiting for replacement', () => {
  assert.deepEqual(stateAfterUndo(), {
    submissionStatus: 'awaiting-resubmission',
    officialScorePercent: null,
    earnedPoints: 0,
    receiptStatus: 'invalid'
  });
});

test('timeliness recalculates against current due date', () => {
  const submittedAt = Date.UTC(2026, 8, 16, 18, 0);
  assert.equal(isOnTime({ submittedAt, dueAt: Date.UTC(2026, 8, 16, 19, 0) }), true);
  assert.equal(isOnTime({ submittedAt, dueAt: Date.UTC(2026, 8, 16, 17, 0) }), false);
});

test('trash expires one calendar month after deletion', () => {
  const deletedAt = Date.UTC(2026, 8, 16, 18, 30);
  assert.equal(new Date(trashExpiresAt(deletedAt)).toISOString(), '2026-10-16T18:30:00.000Z');
});

test('restored assignment returns as an unpublished draft without prior targeting or code', () => {
  const restored = restoredDraftState({
    title: 'Verb practice',
    instructions: 'Practice and submit.',
    pointValue: 20,
    dueAt: Date.UTC(2026, 8, 20),
    rubric: [{ id: 'accuracy', points: 100 }],
    cogConfig: {
      gameId: 'verb-runner',
      modeId: 'sentence-run',
      difficultyId: 'medium',
      minimumPercent: 70
    }
  });

  assert.equal(restored.status, 'draft');
  assert.equal(restored.taskCode, '');
  assert.deepEqual(restored.assignedGroups, []);
  assert.equal(restored.pointValue, 20);
  assert.equal(restored.cogConfig.gameId, 'verb-runner');
});
