import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDENT_DISPLAY_MODES,
  nextStudentDisplayMode,
  studentDisplayModeLabel,
  studentPrimaryDisplay
} from '../student-display-mode.js';

const student = {
  fullName: 'Diego Armando Anota Mendez',
  nickname: 'Diego'
};

test('display-mode button cycles through the same three modes as Group Management', () => {
  assert.deepEqual(STUDENT_DISPLAY_MODES, ['name', 'lastNames', 'nickname']);
  assert.equal(nextStudentDisplayMode('name'), 'lastNames');
  assert.equal(nextStudentDisplayMode('lastNames'), 'nickname');
  assert.equal(nextStudentDisplayMode('nickname'), 'name');
});

test('each mode exposes only its selected primary identity', () => {
  assert.equal(studentPrimaryDisplay(student, 'name'), 'Diego Armando Anota Mendez');
  assert.equal(studentPrimaryDisplay(student, 'lastNames'), 'Anota Mendez Diego Armando');
  assert.equal(studentPrimaryDisplay(student, 'nickname'), 'Diego');
});

test('button labels match Group Management', () => {
  assert.equal(studentDisplayModeLabel('name'), 'Names');
  assert.equal(studentDisplayModeLabel('lastNames'), 'Last names');
  assert.equal(studentDisplayModeLabel('nickname'), 'Nicknames');
});
