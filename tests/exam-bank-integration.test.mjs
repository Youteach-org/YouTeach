import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function source(path) {
  const full = join(root, path);
  assert.equal(existsSync(full), true, `${path} should exist`);
  return readFileSync(full, 'utf8');
}

test('Exam Bank exposes manual upload and metadata controls only', () => {
  const html = source('exam-bank.html');

  for (const id of [
    'examBankForm', 'examFile', 'examTitle', 'examSubject', 'examUnit',
    'examTopic', 'examType', 'examDate', 'examVersion', 'examTags',
    'examBankSearch', 'examBankSubjectFilter', 'examBankTypeFilter',
    'examBankVersionFilter', 'examBankList'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.doesNotMatch(html, /Question Bank|Exam Creator|Answer Sheet Creator/i);
  assert.doesNotMatch(html, /generate|rearrange|question prompt/i);
});

test('Exam Bank client uploads originals and renders open/download actions', () => {
  const js = source('exam-bank.js');

  assert.match(js, /ref\(db, "examBank"\)/);
  assert.match(js, /\/api\/exam-bank-upload/);
  assert.match(js, /filterExamBankEntries/);
  assert.match(js, /data-exam-action="open"/);
  assert.match(js, /data-exam-action="download"/);
  assert.match(js, /\/api\/exam-bank-download\?entryId=/);
  assert.doesNotMatch(js, /QUESTION_TYPES|normalizeQuestion|answerKey|generateExam/i);
});

test('Exam Bank upload API stores original bytes in a dedicated Drive folder', () => {
  const api = source('functions/api/exam-bank-upload.js');

  assert.match(api, /YouTeach Exam Bank/);
  assert.match(api, /await request\.arrayBuffer\(\)/);
  assert.match(api, /uploadType", "resumable"/);
  assert.match(api, /kind: "exam-bank-original"/);
  assert.match(api, /firebasePatch\(\s*`examBank\//);
  assert.doesNotMatch(api, /parse.*question|extract.*question|generate/i);
});

test('Exam Bank download API retrieves the stored original Drive file', () => {
  const api = source('functions/api/exam-bank-download.js');

  assert.match(api, /firebaseGet\(`examBank\//);
  assert.match(api, /alt=media/);
  assert.match(api, /Content-Disposition/);
});

test('teacher navigation exposes Exam Bank and removes provisional exam tools', () => {
  for (const page of ['teacher.html', 'teacher-assignments.html']) {
    const html = source(page);
    assert.match(html, /href="exam-bank\.html">Exam Bank</);
    assert.doesNotMatch(html, />Question Bank</);
    assert.doesNotMatch(html, />Exam Creator</);
    assert.doesNotMatch(html, />Answer Sheet Creator</);
  }
});

test('provisional exam tool URLs redirect to the approved Exam Bank', () => {
  for (const page of ['exam-question-bank.html', 'exam-creator.html', 'answer-sheet-creator.html']) {
    const html = source(page);
    assert.match(html, /exam-bank\.html/);
    assert.match(html, /location\.replace/);
  }
});
