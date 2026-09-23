import test from "node:test";
import assert from "node:assert/strict";

import {
  criterionValue,
  taskCriterionContribution
} from "../group-grade-runtime.js";

const taskCriterion = {
  id: "tasks",
  name: "Tasks",
  shortLabel: "T",
  weight: 20,
  source: "tasks",
  order: 0
};

const projectCriterion = {
  id: "project",
  name: "Project",
  shortLabel: "PJ",
  weight: 30,
  source: "assignments",
  order: 1
};

const config = { criteria: [taskCriterion, projectCriterion] };
const student = { groupName: "G" };

function taskAssignment(id) {
  return {
    code: `HW-${id}-G-220926`,
    groupName: "G",
    evaluationBlock: "Block 1",
    groupEvaluationCriterionId: "tasks",
    evaluationTarget: {
      groupName: "G",
      block: "Block 1",
      criterionId: "tasks",
      mode: "assignment"
    }
  };
}

function projectAssignment() {
  return {
    code: "PJ-MODEL-G-220926",
    assignmentTypeCode: "PJ",
    groupName: "G",
    evaluationBlock: "Block 1",
    groupEvaluationCriterionId: "project",
    evaluationTarget: {
      groupName: "G",
      block: "Block 1",
      criterionId: "project",
      mode: "assignment"
    }
  };
}

const assignments = {
  t1: taskAssignment("ONE"),
  t2: taskAssignment("TWO"),
  t3: taskAssignment("THREE"),
  t4: taskAssignment("FOUR"),
  t5: taskAssignment("FIVE"),
  project1: projectAssignment()
};

test("five task assignments split a 20-point T criterion equally, so one 80 grade contributes 3.2", () => {
  const result = taskCriterionContribution({
    studentKey: "s1",
    student,
    blockName: "Block 1",
    criterion: taskCriterion,
    config,
    assignments,
    submissions: {
      t1: { s1: { grading: { totalScore: 80 } } },
      project1: { s1: { grading: { totalScore: 100 } } }
    }
  });

  assert.deepEqual(result, {
    contribution: 3.2,
    assignmentCount: 5,
    gradedCount: 1
  });
});

test("a project linked to its own criterion never enters the T denominator", () => {
  const value = criterionValue({
    studentKey: "s1",
    student,
    blockName: "Block 1",
    criterion: projectCriterion,
    config,
    assignments,
    submissions: {
      project1: { s1: { grading: { totalScore: 90 } } }
    }
  });

  assert.deepEqual(value, { value: 90, mode: "score" });

  const tasks = taskCriterionContribution({
    studentKey: "s1",
    student,
    blockName: "Block 1",
    criterion: taskCriterion,
    config,
    assignments,
    submissions: {
      t1: { s1: { grading: { totalScore: 80 } } },
      project1: { s1: { grading: { totalScore: 100 } } }
    }
  });

  assert.equal(tasks.assignmentCount, 5);
  assert.equal(tasks.contribution, 3.2);
});

test("two graded tasks accumulate their equal shares while ungraded tasks remain zero", () => {
  const result = taskCriterionContribution({
    studentKey: "s1",
    student,
    blockName: "Block 1",
    criterion: taskCriterion,
    config,
    assignments,
    submissions: {
      t1: { s1: { grading: { totalScore: 80 } } },
      t2: { s1: { grading: { totalScore: 50 } } }
    }
  });

  assert.equal(result.assignmentCount, 5);
  assert.equal(result.gradedCount, 2);
  assert.equal(result.contribution, 5.2);
});

test("student-facing T uses only published grades but keeps all task assignments in the denominator", () => {
  const unpublished = taskCriterionContribution({
    studentKey: "s1",
    student,
    blockName: "Block 1",
    criterion: taskCriterion,
    config,
    assignments,
    submissions: {
      t1: { s1: { grading: { totalScore: 80 }, gradePublished: false } }
    },
    requirePublished: true
  });

  assert.deepEqual(unpublished, {
    contribution: 0,
    assignmentCount: 5,
    gradedCount: 0
  });

  const published = taskCriterionContribution({
    studentKey: "s1",
    student,
    blockName: "Block 1",
    criterion: taskCriterion,
    config,
    assignments,
    submissions: {
      t1: { s1: { grading: { totalScore: 80 }, gradePublished: true } }
    },
    requirePublished: true
  });

  assert.equal(published.contribution, 3.2);
  assert.equal(published.gradedCount, 1);
});

test("legacy task points remain the fallback only when the block has no task assignments", () => {
  const value = criterionValue({
    studentKey: "s1",
    student: {
      groupName: "G",
      taskPoints: { "Block 1": 7 }
    },
    blockName: "Block 1",
    criterion: taskCriterion,
    config,
    assignments: { project1: projectAssignment() },
    submissions: {}
  });

  assert.deepEqual(value, { value: 7, mode: "contribution" });
});


test("manual-source criterion named Task is treated as the Tasks criterion", () => {
  const manualTaskCriterion = {
    id: "task-manual",
    name: "Task",
    shortLabel: "T.",
    weight: 10,
    source: "manual",
    order: 3
  };
  const manualConfig = {
    criteria: [
      { id: "written", name: "Written Exam", shortLabel: "E.", weight: 35, source: "manual", order: 0 },
      { id: "oral", name: "Oral Exam", shortLabel: "Pr. O.", weight: 40, source: "manual", order: 1 },
      { id: "verbs", name: "Verb Exam", shortLabel: "V.", weight: 15, source: "manual", order: 2 },
      manualTaskCriterion
    ]
  };

  const result = taskCriterionContribution({
    studentKey: "s1",
    student: { groupName: "G", groupMemberships: { G: true } },
    blockName: "Block 1",
    criterion: manualTaskCriterion,
    config: manualConfig,
    assignments: {
      a1: {
        code: "HW-ONE-G-220926",
        groupName: "G",
        evaluationBlock: "Block 1",
        evaluationTarget: { groupName: "G", block: "Block 1", criterionId: "", mode: "assignment" }
      }
    },
    submissions: {
      a1: { s1: { gradePublished: true, grading: { totalScore: 50 } } }
    }
  });

  assert.deepEqual(result, {
    contribution: 5,
    assignmentCount: 1,
    gradedCount: 1
  });
});

test("an untagged project can fall into Task only when no separate Project criterion exists", () => {
  const manualTaskCriterion = {
    id: "task-manual",
    name: "Task",
    shortLabel: "T.",
    weight: 10,
    source: "manual",
    order: 0
  };
  const project = {
    code: "PJ-MODEL-G-220926",
    groupName: "G",
    evaluationBlock: "Block 1",
    evaluationTarget: { groupName: "G", block: "Block 1", criterionId: "", mode: "assignment" }
  };

  const withoutProjectCriterion = taskCriterionContribution({
    studentKey: "s1",
    student: { groupName: "G", groupMemberships: { G: true } },
    blockName: "Block 1",
    criterion: manualTaskCriterion,
    config: { criteria: [manualTaskCriterion] },
    assignments: { p1: project },
    submissions: { p1: { s1: { grading: { totalScore: 50 } } } }
  });
  assert.equal(withoutProjectCriterion.assignmentCount, 1);
  assert.equal(withoutProjectCriterion.contribution, 5);

  const withProjectCriterion = taskCriterionContribution({
    studentKey: "s1",
    student: { groupName: "G", groupMemberships: { G: true } },
    blockName: "Block 1",
    criterion: manualTaskCriterion,
    config: {
      criteria: [
        manualTaskCriterion,
        { id: "project", name: "Project", shortLabel: "PJ", weight: 20, source: "manual", order: 1 }
      ]
    },
    assignments: { p1: project },
    submissions: { p1: { s1: { grading: { totalScore: 50 } } } }
  });
  assert.equal(withProjectCriterion, null);
});

test("a PJ explicitly linked to a Project criterion never affects T even when Task is manual-source", () => {
  const manualTaskCriterion = {
    id: "task-manual",
    name: "Task",
    shortLabel: "T.",
    weight: 10,
    source: "manual",
    order: 0
  };
  const projectCriterionManual = {
    id: "project-manual",
    name: "Project",
    shortLabel: "PJ",
    weight: 20,
    source: "manual",
    order: 1
  };
  const result = taskCriterionContribution({
    studentKey: "s1",
    student: { groupName: "G", groupMemberships: { G: true } },
    blockName: "Block 1",
    criterion: manualTaskCriterion,
    config: { criteria: [manualTaskCriterion, projectCriterionManual] },
    assignments: {
      p1: {
        code: "PJ-MODEL-G-220926",
        groupName: "G",
        evaluationBlock: "Block 1",
        evaluationTarget: {
          groupName: "G",
          block: "Block 1",
          criterionId: "project-manual",
          mode: "assignment"
        }
      }
    },
    submissions: { p1: { s1: { grading: { totalScore: 100 } } } }
  });

  assert.equal(result, null);
});


test("tagged Task assignments and eligible legacy untagged assignments share the same T denominator", () => {
  const manualTaskCriterion = {
    id: "task-manual",
    name: "Task",
    shortLabel: "T.",
    weight: 10,
    source: "manual",
    order: 0
  };

  const result = taskCriterionContribution({
    studentKey: "s1",
    student: { groupName: "G", groupMemberships: { G: true } },
    blockName: "Block 1",
    criterion: manualTaskCriterion,
    config: { criteria: [manualTaskCriterion] },
    assignments: {
      tagged: {
        code: "HW-TAGGED-G-AAA11",
        groupName: "G",
        evaluationBlock: "Block 1",
        groupEvaluationCriterionId: "task-manual",
        evaluationTarget: {
          groupName: "G",
          block: "Block 1",
          criterionId: "task-manual",
          mode: "assignment"
        }
      },
      legacy: {
        code: "PJ-LEGACY-G-220926",
        groupName: "G",
        evaluationBlock: "Block 1",
        evaluationTarget: {
          groupName: "G",
          block: "Block 1",
          criterionId: "",
          mode: "assignment"
        }
      }
    },
    submissions: {
      tagged: { s1: { gradePublished: true, grading: { totalScore: 100 } } },
      legacy: { s1: { gradePublished: true, grading: { totalScore: 50 } } }
    },
    requirePublished: true
  });

  assert.deepEqual(result, {
    contribution: 7.5,
    assignmentCount: 2,
    gradedCount: 2
  });
});
