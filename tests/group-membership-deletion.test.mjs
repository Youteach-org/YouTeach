import test from 'node:test';
import assert from 'node:assert/strict';
import { planStudentRemovalFromGroup } from '../group-membership-deletion.js';

test('removing a secondary group preserves the student and primary group', () => {
  const plan = planStudentRemovalFromGroup({
    student1: {
      groupName: 'GROUP-A',
      groupMemberships: { 'GROUP-A': true, 'GROUP-B': true }
    }
  }, 'GROUP-B');

  assert.deepEqual(plan.updates, {
    'students/student1/groupMemberships/GROUP-B': null
  });
  assert.deepEqual(plan.deletedStudentKeys, []);
});

test('removing the primary group promotes another active membership', () => {
  const plan = planStudentRemovalFromGroup({
    student1: {
      groupName: 'GROUP-A',
      groupMemberships: { 'GROUP-A': true, 'GROUP-B': true }
    }
  }, 'GROUP-A');

  assert.deepEqual(plan.updates, {
    'students/student1/groupMemberships/GROUP-A': null,
    'students/student1/groupName': 'GROUP-B'
  });
  assert.deepEqual(plan.deletedStudentKeys, []);
});

test('removing the only group deletes the student account', () => {
  const plan = planStudentRemovalFromGroup({
    student1: { groupName: 'GROUP-A', groupMemberships: { 'GROUP-A': true } }
  }, 'GROUP-A');

  assert.deepEqual(plan.updates, { 'students/student1': null });
  assert.deepEqual(plan.deletedStudentKeys, ['student1']);
});

test('former-student records do not make an active account eligible for deletion', () => {
  const plan = planStudentRemovalFromGroup({
    student1: { groupName: 'GROUP-B', groupMemberships: { 'GROUP-B': true } }
  }, 'GROUP-A');

  assert.deepEqual(plan.updates, {});
  assert.deepEqual(plan.deletedStudentKeys, []);
});
