function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function reusableProjectCheckpoints(checkpoints) {
  if (!checkpoints || typeof checkpoints !== 'object' || Array.isArray(checkpoints)) return undefined;

  const result = {};
  for (const [id, checkpoint] of Object.entries(checkpoints)) {
    if (!checkpoint || typeof checkpoint !== 'object') continue;
    const reusable = {};
    for (const key of ['title', 'instructions', 'requiredEvidenceTypes']) {
      if (checkpoint[key] !== undefined) reusable[key] = clone(checkpoint[key]);
    }
    result[id] = reusable;
  }
  return Object.keys(result).length ? result : undefined;
}

const REUSABLE_FIELDS = [
  'title',
  'instructions',
  'assignmentType',
  'assignmentTypeCode',
  'evaluationCriteria',
  'evaluationDistribution',
  'evaluationNotes',
  'subject',
  'course',
  'unit',
  'topic',
  'subtopic',
  'resources'
];

export function extractReusableAssignmentContent(assignment = {}) {
  const source = assignment && typeof assignment === 'object' ? assignment : {};
  const reusable = {};

  for (const key of REUSABLE_FIELDS) {
    if (source[key] !== undefined) reusable[key] = clone(source[key]);
  }

  const checkpoints = reusableProjectCheckpoints(source.projectCheckpoints);
  if (checkpoints) reusable.projectCheckpoints = checkpoints;

  const tags = normalizeTags(source.tags);
  if (tags.length) reusable.tags = tags;

  return reusable;
}

export function buildAssignmentTemplateRecord({ id, assignment, now = Date.now(), actor = '' } = {}) {
  const templateId = String(id || '').trim();
  if (!templateId) throw new Error('Assignment template id is required.');

  const content = extractReusableAssignmentContent(assignment);
  if (!String(content.title || '').trim()) {
    throw new Error('Assignment template title is required.');
  }

  const timestamp = Number(now);
  const by = String(actor || '').trim();

  return {
    id: templateId,
    schemaVersion: 1,
    version: 1,
    archived: false,
    usageCount: 0,
    content: clone(content),
    createdAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
    updatedAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
    createdBy: by,
    updatedBy: by
  };
}

export function buildAssignedInstanceFromTemplate({
  template,
  code,
  groupName,
  dueAt,
  now = Date.now(),
  actor = ''
} = {}) {
  if (!template || typeof template !== 'object' || !String(template.id || '').trim()) {
    throw new Error('Assignment template is required.');
  }
  if (!template.content || typeof template.content !== 'object') {
    throw new Error('Assignment template content is required.');
  }

  const taskCode = String(code || '').trim().toUpperCase();
  if (!taskCode) throw new Error('Task code is required.');

  const group = String(groupName || '').trim();
  if (!group) throw new Error('Group is required.');

  if (dueAt === null || dueAt === undefined || dueAt === '' || !Number.isFinite(Number(dueAt))) {
    throw new Error('Due date is required.');
  }

  const timestamp = Number(now);
  const snapshot = clone(template.content);

  return {
    ...clone(snapshot),
    templateId: String(template.id).trim(),
    templateVersion: Number(template.version || 1),
    templateSnapshot: clone(snapshot),
    code: taskCode,
    groupName: group,
    dueAt: Number(dueAt),
    active: true,
    storageProvider: 'google-drive',
    createdAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
    createdBy: String(actor || '').trim()
  };
}
