import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = readFileSync(join(root, 'functions/api/drive-upload-session.js'), 'utf8');

test('Drive resumable final PUT includes the exact PDF Content-Length', () => {
  assert.match(source, /const byteLength = Number\(bytes\?\.byteLength \|\| 0\)/);
  assert.match(source, /"Content-Length": String\(byteLength\)/);
  assert.match(source, /method: "PUT"/);
});

test('Drive upload errors expose the failing server stage', () => {
  assert.match(source, /let stage = "request-validation"/);
  assert.match(source, /stage = "google-drive-upload-session"/);
  assert.match(source, /stage = "google-drive-pdf-transfer"/);
  assert.match(source, /stage = "firebase-submission-write"/);
  assert.match(source, /error: `\$\{label\}: \$\{detail\}`/);
});
