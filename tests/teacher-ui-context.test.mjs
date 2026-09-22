import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shared = readFileSync(join(root, 'shared-ui-fixes.js'), 'utf8');
const moduleHtml = readFileSync(join(root, 'assignment-create-module.html'), 'utf8');
const moduleJs = readFileSync(join(root, 'assignment-create-module.js'), 'utf8');

test('teacher pages show the active working group beside the teacher identity', () => {
  assert.match(shared, /activeGroupIdentity/);
  assert.match(shared, /sessionStorage\.getItem\("youteachWorkingGroup"\)/);
  assert.match(shared, /teacherIdentity\.insertAdjacentElement\("afterend", groupIdentity\)/);
  assert.match(shared, /youteach:working-group-changed/);
});

test('Create Assignment selects a template by clicking the card and shows only a Use label', () => {
  assert.doesNotMatch(moduleJs, /Use as base|data-use-library-item/);
  assert.match(moduleJs, /<span class="library-use-label">Use<\/span>/);
  assert.match(moduleJs, /data-library-key=/);
  assert.match(moduleJs, /event\.target\.closest\("\[data-library-key\]"\)/);
  assert.match(moduleJs, /loadLibraryEntry\(String\(card\.dataset\.libraryKey/);
  assert.match(moduleHtml, /\.library-use-label/);
});
