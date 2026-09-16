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
