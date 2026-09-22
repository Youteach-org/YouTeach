import test from 'node:test';
import assert from 'node:assert/strict';
import { studentGroupNames, studentInGroup } from '../student-groups.js';

test('student group helpers keep the primary group and additional memberships', () => {
  const student = {
    groupName: 'GROUP-A',
    groupMemberships: {
      'GROUP-A': true,
      'GROUP-B': true,
      'GROUP-C': false
    }
  };
  assert.deepEqual(studentGroupNames(student), ['GROUP-A', 'GROUP-B']);
  assert.equal(studentInGroup(student, 'GROUP-A'), true);
  assert.equal(studentInGroup(student, 'GROUP-B'), true);
  assert.equal(studentInGroup(student, 'GROUP-C'), false);
});
