import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  COG_ASSIGNMENT_GAMES,
  getCertifiedCogGame,
  validateCogAssignmentDraft
} from '../cog-activity-catalog.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'assignment-create-module.html'), 'utf8');
const js = readFileSync(join(root, 'assignment-create-module.js'), 'utf8');
const buildScript = readFileSync(join(root, 'build-pages.sh'), 'utf8');

test('COG catalog exposes only explicitly certified assignable games', () => {
  assert.ok(COG_ASSIGNMENT_GAMES.length >= 1);
  assert.ok(COG_ASSIGNMENT_GAMES.every((game) => game.assignmentCertified === true));
  const verbRunner = getCertifiedCogGame('verb-runner');
  assert.equal(verbRunner?.name, 'Verb Runner');
  assert.deepEqual(verbRunner?.difficulties.map((item) => item.id), ['easy', 'medium', 'hard']);
  assert.deepEqual(
    verbRunner?.modes.map((item) => item.id),
    ['verb', 'sentence', 'time-clues', 'perfect-race', 'final-race']
  );
});

test('COG assignment draft validates game, mode, difficulty, points and optional minimum', () => {
  const value = validateCogAssignmentDraft({
    gameId: 'verb-runner',
    modeId: 'sentence',
    difficultyId: 'medium',
    pointValue: 15,
    minimumPercent: 70,
    undoSubmissionEnabled: true
  });
  assert.equal(value.gameId, 'verb-runner');
  assert.equal(value.pointValue, 15);
  assert.equal(value.minimumPercent, 70);
  assert.equal(value.undoSubmissionEnabled, true);

  const noMinimum = validateCogAssignmentDraft({
    gameId: 'verb-runner',
    modeId: 'verb',
    difficultyId: 'easy',
    pointValue: 10,
    minimumPercent: '',
    undoSubmissionEnabled: false
  });
  assert.equal(noMinimum.minimumPercent, null);
  assert.equal(noMinimum.undoSubmissionEnabled, false);

  assert.throws(() => validateCogAssignmentDraft({
    gameId: 'verb-runner',
    modeId: 'not-a-mode',
    difficultyId: 'easy',
    pointValue: 10
  }), /mode/i);
});

test('shared Create Assignment module exposes visible COG configuration controls', () => {
  assert.match(html, /<option value="COG">COG Activity \(COG\)<\/option>/);
  assert.match(html, /id="cogActivityConfigPanel"/);
  assert.match(html, /id="cogGame"/);
  assert.match(html, /id="cogMode"/);
  assert.match(html, /id="cogDifficulty"/);
  assert.match(html, /id="cogMinimumPercent"/);
  assert.match(html, /id="cogPointValue"/);
  assert.match(html, /id="cogUndoSubmissionEnabled"/);
});

test('shared Create Assignment module persists COG configuration and does not use Drive storage', () => {
  assert.match(js, /from "\.\/cog-activity-catalog\.mjs"/);
  assert.match(js, /validateCogAssignmentDraft/);
  assert.match(js, /cogActivity:/);
  assert.match(js, /pointValue:/);
  assert.match(js, /undoSubmissionEnabled:/);
  assert.match(js, /storageProvider:\s*typeCode === "COG" \? "cog" : "google-drive"/);
});

test('COG configuration panel appears only for COG assignment type', () => {
  assert.match(js, /cogActivityConfigPanel\.hidden = assignmentType\.value !== "COG"/);
});


test('Cloudflare build ships COG ES modules used by assignment pages', () => {
  assert.match(buildScript, /\*\.mjs/);
});
