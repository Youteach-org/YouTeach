export const COG_ASSIGNMENT_GAMES = Object.freeze([
  Object.freeze({
    id: 'verb-runner',
    name: 'Verb Runner',
    assignmentCertified: true,
    contractVersion: 1,
    publicPath: '/Verb-Runner/',
    modes: Object.freeze([
      Object.freeze({ id: 'verb', name: 'Verb Runner' }),
      Object.freeze({ id: 'sentence', name: 'Sentence Runner' }),
      Object.freeze({ id: 'time-clues', name: 'Time Clues' }),
      Object.freeze({ id: 'perfect-race', name: 'Perfect Running' }),
      Object.freeze({ id: 'final-race', name: 'Final Race' })
    ]),
    difficulties: Object.freeze([
      Object.freeze({ id: 'easy', name: 'Easy' }),
      Object.freeze({ id: 'medium', name: 'Medium' }),
      Object.freeze({ id: 'hard', name: 'Hard' })
    ])
  })
]);

export function getCertifiedCogGame(gameId) {
  const id = String(gameId || '').trim();
  return COG_ASSIGNMENT_GAMES.find((game) => game.assignmentCertified === true && game.id === id) || null;
}

function requiredSelection(game, field, values, value) {
  const normalized = String(value || '').trim();
  if (!values.some((item) => item.id === normalized)) {
    throw new Error(`Invalid COG ${field} for ${game.name}.`);
  }
  return normalized;
}

function optionalPercent(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error('COG minimum performance must be between 0 and 100.');
  }
  return numeric;
}

function positivePoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('COG task points must be greater than 0.');
  }
  return numeric;
}

export function validateCogAssignmentDraft(raw = {}) {
  const game = getCertifiedCogGame(raw.gameId);
  if (!game) throw new Error('Select a certified COG game.');

  return {
    gameId: game.id,
    modeId: requiredSelection(game, 'mode', game.modes, raw.modeId),
    difficultyId: requiredSelection(game, 'difficulty', game.difficulties, raw.difficultyId),
    pointValue: positivePoints(raw.pointValue),
    minimumPercent: optionalPercent(raw.minimumPercent),
    undoSubmissionEnabled: raw.undoSubmissionEnabled !== false,
    contractVersion: game.contractVersion
  };
}
