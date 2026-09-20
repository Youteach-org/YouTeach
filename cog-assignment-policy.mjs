function requirePercent(value, field = 'scorePercent') {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${field} must be a number between 0 and 100.`);
  }
  return Number(value);
}

function requirePoints(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('assignmentPoints must be a non-negative number.');
  }
  return Number(value);
}

function requireTimestamp(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a valid timestamp.`);
  }
  return Number(value);
}

function addUtcMonthsClamped(timestamp, months) {
  const source = new Date(requireTimestamp(timestamp, 'timestamp'));
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds()
  );
}

export function proportionalPoints(scorePercent, assignmentPoints) {
  const score = requirePercent(scorePercent);
  const points = requirePoints(assignmentPoints);
  return (score / 100) * points;
}

export function submissionLabel(resubmissionNumber = 0) {
  if (!Number.isInteger(resubmissionNumber) || resubmissionNumber < 0) {
    throw new RangeError('resubmissionNumber must be a non-negative integer.');
  }
  return resubmissionNumber === 0 ? 'Entrega' : `Reentrega ${resubmissionNumber}`;
}

export function canUndoSubmission({ assignmentOpen, undoEnabled } = {}) {
  return assignmentOpen === true && undoEnabled === true;
}

export function stateAfterUndo() {
  return {
    submissionStatus: 'awaiting-resubmission',
    officialScorePercent: null,
    earnedPoints: 0,
    receiptStatus: 'invalid'
  };
}

export function isOnTime({ submittedAt, dueAt } = {}) {
  const submitted = requireTimestamp(submittedAt, 'submittedAt');
  const due = requireTimestamp(dueAt, 'dueAt');
  return submitted <= due;
}

export function trashExpiresAt(deletedAt) {
  return addUtcMonthsClamped(deletedAt, 1);
}

export function restoredDraftState(assignment = {}) {
  return {
    ...assignment,
    status: 'draft',
    active: false,
    taskCode: '',
    assignedGroups: [],
    restoredFromTrash: true
  };
}
