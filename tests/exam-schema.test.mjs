import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  QUESTION_TYPES,
  normalizeQuestion,
  snapshotQuestion,
  normalizeTemplate,
  buildExamVersion,
  answerKeyForVersion,
  createExamInstance
} from '../exam-schema.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,'..');
const creatorJs=readFileSync(join(root,'exam-creator.js'),'utf8');
const answerJs=readFileSync(join(root,'answer-sheet-creator.js'),'utf8');
const bankJs=readFileSync(join(root,'exam-question-bank.js'),'utf8');
const teacherHome=readFileSync(join(root,'teacher.html'),'utf8');

function sampleTemplate(){
  const q1=normalizeQuestion({
    id:'q1',
    type:QUESTION_TYPES.MULTIPLE_CHOICE,
    prompt:'First?',
    options:['A1','B1','C1','D1'],
    answerKey:1,
    pointValue:10
  });
  const q2=normalizeQuestion({
    id:'q2',
    type:QUESTION_TYPES.TRUE_FALSE,
    prompt:'Second?',
    answerKey:true,
    pointValue:20
  });
  const q3=normalizeQuestion({
    id:'q3',
    type:QUESTION_TYPES.OPEN_RESPONSE,
    prompt:'Third?',
    answerKey:'Expected third answer',
    pointValue:30
  });
  return normalizeTemplate({
    id:'exam-1',
    title:'Test Exam',
    sections:[
      {
        id:'section-1',
        title:'Section 1',
        questions:[snapshotQuestion(q1),snapshotQuestion(q2),snapshotQuestion(q3)]
      }
    ],
    versionRules:{A:'original',B:'reverse-within-section'}
  });
}

test('version B reverses questions and answer key numbering together',()=>{
  const template=sampleTemplate();
  const a=buildExamVersion(template,'A');
  const b=buildExamVersion(template,'B');
  const aKey=answerKeyForVersion(template,'A');
  const bKey=answerKeyForVersion(template,'B');

  assert.deepEqual(a.sections[0].questions.map(q=>q.bankQuestionId),['q1','q2','q3']);
  assert.deepEqual(b.sections[0].questions.map(q=>q.bankQuestionId),['q3','q2','q1']);
  assert.equal(aKey[0].bankQuestionId,'q1');
  assert.equal(aKey[0].answerKey,1);
  assert.equal(bKey[0].bankQuestionId,'q3');
  assert.equal(bKey[0].answerKey,'Expected third answer');
  assert.deepEqual(bKey.map(k=>k.number),[1,2,3]);
});

test('exam instance freezes template, version and answer key snapshots',()=>{
  const template=sampleTemplate();
  const instance=createExamInstance({
    template,
    version:'B',
    groupName:'G1',
    dueAt:123456,
    createdBy:'Teacher'
  });
  assert.equal(instance.templateId,'exam-1');
  assert.equal(instance.version,'B');
  assert.equal(instance.versionSnapshot.sections[0].questions[0].bankQuestionId,'q3');
  assert.equal(instance.answerKeySnapshot[0].bankQuestionId,'q3');
  assert.equal(instance.groupName,'G1');
  assert.equal(instance.dueAt,123456);
});

test('Question Bank stores answer key as part of the canonical question',()=>{
  assert.match(bankJs,/validateQuestion/);
  assert.match(bankJs,/answerKey/);
  assert.match(bankJs,/examQuestionBank/);
});

test('Exam Creator uses snapshots instead of live bank references only',()=>{
  assert.match(creatorJs,/snapshotQuestion/);
  assert.match(creatorJs,/createExamInstance/);
  assert.match(creatorJs,/examTemplates/);
  assert.match(creatorJs,/examInstances/);
  assert.match(creatorJs,/examTemplateId/);
  assert.match(creatorJs,/examInstanceId/);
});

test('Answer Sheet Creator derives teacher key from the same version builder',()=>{
  assert.match(answerJs,/buildExamVersion/);
  assert.match(answerJs,/answerKeyForVersion/);
  assert.doesNotMatch(answerJs,/set\(ref\(db,.*answerKey/);
});

test('Teacher Home exposes the new exam tools',()=>{
  assert.match(teacherHome,/exam-question-bank\.html/);
  assert.match(teacherHome,/exam-creator\.html/);
  assert.match(teacherHome,/answer-sheet-creator\.html/);
});


test('browser exam tool modules are syntactically valid after import stripping',()=>{
  for(const [name,source] of [
    ['Question Bank',bankJs],
    ['Exam Creator',creatorJs],
    ['Answer Sheet Creator',answerJs]
  ]){
    const stripped=source.replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];\s*$/gm,'');
    assert.doesNotThrow(()=>new Function(stripped), `${name} should parse`);
  }
});
