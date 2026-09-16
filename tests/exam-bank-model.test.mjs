import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const modelPath = join(root, 'exam-bank-model.js');

async function loadModel() {
  assert.equal(existsSync(modelPath), true, 'exam-bank-model.js should exist');
  return import(pathToFileURL(modelPath).href + `?test=${Date.now()}`);
}

test('normalizeExamBankMetadata keeps only manual Exam Bank metadata', async () => {
  const { normalizeExamBankMetadata } = await loadModel();
  assert.equal(typeof normalizeExamBankMetadata, 'function');

  const result = normalizeExamBankMetadata({
    title: '  First Epidemiology Exam  ',
    subject: ' Epidemiology ',
    unit: ' Unit 1 ',
    topic: ' Incidence ',
    examType: ' Monthly ',
    examDate: '2026-09-15',
    version: ' A ',
    tags: 'diagnostic, incidence, 2026',
    prompt: 'must not be parsed',
    questions: [{ prompt: 'must not survive' }]
  });

  assert.deepEqual(result, {
    title: 'First Epidemiology Exam',
    subject: 'Epidemiology',
    unit: 'Unit 1',
    topic: 'Incidence',
    examType: 'Monthly',
    examDate: '2026-09-15',
    version: 'A',
    tags: ['diagnostic', 'incidence', '2026']
  });
});

test('buildExamBankEntry references the original uploaded file unchanged', async () => {
  const { buildExamBankEntry } = await loadModel();
  assert.equal(typeof buildExamBankEntry, 'function');

  const entry = buildExamBankEntry({
    id: 'exam-1',
    metadata: {
      title: 'Anatomy Exam',
      subject: 'Anatomy',
      unit: 'Unit 2',
      topic: 'Circulation',
      examType: 'Partial',
      examDate: '2026-09-16',
      version: 'B',
      tags: ['heart']
    },
    file: {
      id: 'drive-123',
      name: 'Primer-Examen-Anatomia-B.docx',
      url: 'https://drive.google.com/file/d/drive-123/view',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 12345
    },
    now: 500,
    actor: 'Teacher'
  });

  assert.equal(entry.id, 'exam-1');
  assert.equal(entry.schemaVersion, 1);
  assert.equal(entry.title, 'Anatomy Exam');
  assert.equal(entry.version, 'B');
  assert.equal(entry.originalFileName, 'Primer-Examen-Anatomia-B.docx');
  assert.equal(entry.driveFileId, 'drive-123');
  assert.equal(entry.driveFileUrl, 'https://drive.google.com/file/d/drive-123/view');
  assert.equal(entry.size, 12345);
  assert.equal(entry.createdAt, 500);
  assert.equal(entry.updatedAt, 500);
  assert.equal(entry.createdBy, 'Teacher');
  assert.equal('questions' in entry, false);
  assert.equal('sections' in entry, false);
  assert.equal('generatedContent' in entry, false);
});

test('filterExamBankEntries searches and filters manual exam metadata', async () => {
  const { filterExamBankEntries } = await loadModel();
  assert.equal(typeof filterExamBankEntries, 'function');

  const entries = {
    a: {
      id: 'a', title: 'Epidemiology Exam', subject: 'Epidemiology',
      unit: 'Unit 1', topic: 'Incidence', examType: 'Monthly',
      examDate: '2026-09-15', version: 'A', tags: ['incidence'], updatedAt: 20
    },
    b: {
      id: 'b', title: 'Anatomy Exam', subject: 'Anatomy',
      unit: 'Unit 2', topic: 'Circulation', examType: 'Partial',
      examDate: '2026-09-16', version: 'B', tags: ['heart'], updatedAt: 30
    }
  };

  assert.deepEqual(
    filterExamBankEntries(entries, { query: 'heart' }).map(([id]) => id),
    ['b']
  );
  assert.deepEqual(
    filterExamBankEntries(entries, { subject: 'Epidemiology', version: 'A' }).map(([id]) => id),
    ['a']
  );
  assert.deepEqual(
    filterExamBankEntries(entries, { examType: 'Partial', topic: 'Circulation' }).map(([id]) => id),
    ['b']
  );
});
