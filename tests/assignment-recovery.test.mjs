import test from "node:test";
import assert from "node:assert/strict";

import {
  assignmentMatchesGroupEvidence,
  buildRecoveredAssignmentFromSubmissions
} from "../assignment-recovery.js";

const groups = {
  FANTASMA: { name: "FANTASMA" },
  "E6C Fall 2026": { name: "E6C Fall 2026" }
};

test("submission history can recover active-group visibility when stored assignment group is stale", () => {
  const matches = assignmentMatchesGroupEvidence({
    assignment: { groupName: "OLD-FANTASMA" },
    submissions: {
      ghost01: {
        groupName: "FANTASMA",
        assignmentId: "a1",
        assignmentCode: "PJ-CIRMAY-FAN-151026",
        assignmentTitle: "CIRCULACION MAYOR Y CIRCULACION MENOR",
        driveFileId: "file-1"
      }
    },
    workingGroup: "FANTASMA",
    groups
  });

  assert.equal(matches, true);
});

test("stored ALL assignments remain visible to every active group", () => {
  assert.equal(assignmentMatchesGroupEvidence({
    assignment: { groupName: "ALL" },
    submissions: {},
    workingGroup: "FANTASMA",
    groups
  }), true);
});

test("orphan assignment metadata is recovered from existing submissions without changing the assignment id", () => {
  const recovered = buildRecoveredAssignmentFromSubmissions({
    assignmentId: "assignment-123",
    submissions: {
      ghost01: {
        groupName: "FANTASMA",
        assignmentId: "assignment-123",
        assignmentCode: "PJ-CIRMAY-FAN-151026",
        assignmentTitle: "CIRCULACION MAYOR Y CIRCULACION MENOR",
        submittedAt: 1790000000000,
        driveFileId: "file-1"
      },
      ghost02: {
        groupName: "FANTASMA",
        assignmentId: "assignment-123",
        assignmentCode: "PJ-CIRMAY-FAN-151026",
        assignmentTitle: "CIRCULACION MAYOR Y CIRCULACION MENOR",
        submittedAt: 1790000100000,
        driveFileId: "file-2"
      }
    },
    groups,
    recoveredAt: 1791000000000,
    recoveredBy: "Teacher"
  });

  assert.ok(recovered);
  assert.equal(recovered.groupName, "FANTASMA");
  assert.equal(recovered.code, "PJ-CIRMAY-FAN-151026");
  assert.equal(recovered.title, "CIRCULACION MAYOR Y CIRCULACION MENOR");
  assert.equal(recovered.assignmentTypeCode, "PJ");
  assert.equal(recovered.active, false);
  assert.equal(recovered.recoveredFromSubmissionHistory, true);
  assert.equal(recovered.recoveredAssignmentId, "assignment-123");
});

test("task code ALL segment is preserved when recovering an orphan assignment", () => {
  const recovered = buildRecoveredAssignmentFromSubmissions({
    assignmentId: "assignment-all",
    submissions: {
      ghost01: {
        groupName: "FANTASMA",
        assignmentCode: "HW-REVIEW-ALL-151026",
        assignmentTitle: "Review",
        driveFileId: "file-1"
      }
    },
    groups,
    recoveredAt: 1,
    recoveredBy: "Teacher"
  });

  assert.ok(recovered);
  assert.equal(recovered.groupName, "ALL");
});

test("ambiguous orphan submission metadata is not auto-recovered", () => {
  const recovered = buildRecoveredAssignmentFromSubmissions({
    assignmentId: "assignment-ambiguous",
    submissions: {
      s1: {
        groupName: "FANTASMA",
        assignmentCode: "PJ-TEST-XXX-151026",
        assignmentTitle: "Test",
        driveFileId: "file-1"
      },
      s2: {
        groupName: "E6C Fall 2026",
        assignmentCode: "PJ-TEST-XXX-151026",
        assignmentTitle: "Test",
        driveFileId: "file-2"
      }
    },
    groups,
    recoveredAt: 1,
    recoveredBy: "Teacher"
  });

  assert.equal(recovered, null);
});
