import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReusableAssignmentContent,
  buildAssignmentTemplateRecord,
  buildAssignedInstanceFromTemplate,
  filterAssignmentTemplates,
  buildAssignmentTemplateArchivePatch
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

test('buildAssignedInstanceFromTemplate creates a clean run with frozen snapshot', () => {
  const template = buildAssignmentTemplateRecord({
    id: 'tpl-1',
    assignment: {
      title: 'Respiratory system',
      instructions: 'Create a diagram',
      assignmentType: 'Classwork',
      assignmentTypeCode: 'CT'
    },
    now: 100,
    actor: 'Teacher'
  });

  const instance = buildAssignedInstanceFromTemplate({
    template,
    code: 'CT-RESP-G1-160926',
    groupName: 'G1',
    dueAt: 200,
    now: 150,
    actor: 'Teacher'
  });

  assert.equal(instance.templateId, 'tpl-1');
  assert.equal(instance.templateVersion, 1);
  assert.equal(instance.code, 'CT-RESP-G1-160926');
  assert.equal(instance.groupName, 'G1');
  assert.equal(instance.dueAt, 200);
  assert.equal(instance.title, 'Respiratory system');
  assert.equal(instance.assignmentTypeCode, 'CT');
  assert.equal(instance.active, true);
  assert.equal(instance.storageProvider, 'google-drive');
  assert.equal(instance.createdAt, 150);
  assert.equal(instance.createdBy, 'Teacher');
  assert.equal('grading' in instance, false);
  assert.equal('gradePublished' in instance, false);
  assert.equal('assignmentSubmissions' in instance, false);

  template.content.title = 'Changed later';
  assert.equal(instance.templateSnapshot.title, 'Respiratory system');
  assert.equal(instance.title, 'Respiratory system');
});

test('buildAssignedInstanceFromTemplate validates run identity', () => {
  const template = buildAssignmentTemplateRecord({
    id: 'tpl-1',
    assignment: { title: 'Valid' },
    now: 1,
    actor: 'Teacher'
  });

  assert.throws(() => buildAssignedInstanceFromTemplate({
    template,
    code: '',
    groupName: 'G1',
    dueAt: 2
  }), /task code/i);

  assert.throws(() => buildAssignedInstanceFromTemplate({
    template,
    code: 'CT-VALID-G1-160926',
    groupName: '',
    dueAt: 2
  }), /group/i);

  assert.throws(() => buildAssignedInstanceFromTemplate({
    template,
    code: 'CT-VALID-G1-160926',
    groupName: 'G1',
    dueAt: Number.NaN
  }), /due date/i);
});


test('filterAssignmentTemplates searches metadata and respects exact filters', () => {
  const templates = {
    a: {
      id: 'a',
      archived: false,
      usageCount: 3,
      content: {
        title: 'Circulatory system model',
        assignmentType: 'Project',
        assignmentTypeCode: 'PJ',
        course: 'Anatomy',
        subject: 'Health Sciences',
        unit: 'Unit 2',
        topic: 'Circulation',
        tags: ['model', 'heart']
      }
    },
    b: {
      id: 'b',
      archived: true,
      usageCount: 0,
      content: {
        title: 'Nutrition worksheet',
        assignmentType: 'Homework',
        assignmentTypeCode: 'HW',
        course: 'Nutrition',
        subject: 'Health Sciences',
        unit: 'Unit 1',
        topic: 'Macronutrients',
        tags: ['worksheet']
      }
    }
  };

  assert.deepEqual(
    filterAssignmentTemplates(templates, { query: 'heart', status: 'active' }).map(([id]) => id),
    ['a']
  );
  assert.deepEqual(
    filterAssignmentTemplates(templates, { type: 'PJ', course: 'Anatomy', usage: 'used' }).map(([id]) => id),
    ['a']
  );
  assert.deepEqual(
    filterAssignmentTemplates(templates, { subject: 'Health Sciences', status: 'archived', usage: 'unused' }).map(([id]) => id),
    ['b']
  );
  assert.deepEqual(
    filterAssignmentTemplates(templates, { topic: 'Macronutrients', tag: 'worksheet', status: 'all' }).map(([id]) => id),
    ['b']
  );
});

test('buildAssignmentTemplateArchivePatch changes archive metadata only', () => {
  const template = {
    id: 'tpl-1',
    version: 4,
    usageCount: 9,
    content: { title: 'Keep me intact' }
  };
  const patch = buildAssignmentTemplateArchivePatch({
    template,
    archived: true,
    now: 500,
    actor: 'Teacher'
  });

  assert.deepEqual(patch, {
    archived: true,
    updatedAt: 500,
    updatedBy: 'Teacher'
  });
  assert.equal(template.version, 4);
  assert.equal(template.usageCount, 9);
  assert.equal(template.content.title, 'Keep me intact');
});
