import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReusableAssignmentContent,
  buildAssignmentTemplateRecord
} from '../assignment-library-model.js';

test('extractReusableAssignmentContent excludes assigned-instance state', () => {
  const reusable = extractReusableAssignmentContent({
    code: 'PJ-MODEL-G1-160926',
    title: 'Anatomical model',
    groupName: 'G1',
    dueAt: 1790000000000,
    active: false,
    instructions: 'Build the model',
    assignmentType: 'Project',
    assignmentTypeCode: 'PJ',
    evaluationCriteria: [{ id: 'c1', title: 'Form', maxPoints: 100 }],
    evaluationDistribution: 'manual',
    evaluationNotes: 'Teacher notes',
    assignmentSubmissions: { student1: { driveFileId: 'old-file' } },
    grading: { totalScore: 90 },
    gradePublished: true
  });

  assert.equal(reusable.title, 'Anatomical model');
  assert.equal(reusable.instructions, 'Build the model');
  assert.equal(reusable.assignmentTypeCode, 'PJ');
  assert.equal('code' in reusable, false);
  assert.equal('groupName' in reusable, false);
  assert.equal('dueAt' in reusable, false);
  assert.equal('active' in reusable, false);
  assert.equal('assignmentSubmissions' in reusable, false);
  assert.equal('grading' in reusable, false);
  assert.equal('gradePublished' in reusable, false);
});

test('project checkpoint templates keep instructions but drop run-specific dates', () => {
  const reusable = extractReusableAssignmentContent({
    title: 'Project',
    projectCheckpoints: {
      cp1: {
        title: 'Draft',
        instructions: 'Upload progress',
        requiredEvidenceTypes: ['image'],
        reviewAt: 1790000000000,
        dueAt: 1790000000000
      }
    }
  });

  assert.deepEqual(reusable.projectCheckpoints.cp1.requiredEvidenceTypes, ['image']);
  assert.equal(reusable.projectCheckpoints.cp1.title, 'Draft');
  assert.equal('reviewAt' in reusable.projectCheckpoints.cp1, false);
  assert.equal('dueAt' in reusable.projectCheckpoints.cp1, false);
});

test('buildAssignmentTemplateRecord creates a reusable versioned template', () => {
  const template = buildAssignmentTemplateRecord({
    id: 'tpl-1',
    assignment: {
      title: 'Respiratory system',
      groupName: '3A',
      dueAt: 1790000000000,
      instructions: 'Create a diagram'
    },
    now: 12345,
    actor: 'Teacher'
  });

  assert.equal(template.id, 'tpl-1');
  assert.equal(template.schemaVersion, 1);
  assert.equal(template.version, 1);
  assert.equal(template.archived, false);
  assert.equal(template.usageCount, 0);
  assert.equal(template.createdAt, 12345);
  assert.equal(template.updatedAt, 12345);
  assert.equal(template.createdBy, 'Teacher');
  assert.equal(template.updatedBy, 'Teacher');
  assert.equal(template.content.title, 'Respiratory system');
  assert.equal('groupName' in template.content, false);
  assert.equal('dueAt' in template.content, false);
});

test('buildAssignmentTemplateRecord rejects missing ids and titles', () => {
  assert.throws(() => buildAssignmentTemplateRecord({
    id: '',
    assignment: { title: 'Valid title' },
    now: 1,
    actor: 'Teacher'
  }), /template id/i);

  assert.throws(() => buildAssignmentTemplateRecord({
    id: 'tpl-1',
    assignment: { title: '   ' },
    now: 1,
    actor: 'Teacher'
  }), /title/i);
});
