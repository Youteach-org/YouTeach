import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("COG result model preserves attempt history and game-specific metrics", async () => {
  const model = await import("../cog-assignment-results.mjs").catch(() => null);
  assert.ok(model, "cog-assignment-results.mjs must exist");

  const results = {
    "ghost-key-1": {
      older: {
        resultId: "older",
        studentKey: "ghost-key-1",
        gameId: "verb-runner",
        completedAt: 100,
        acceptedAt: 110,
        percentage: 70,
        metrics: { correct: 14, errors: 6 }
      },
      newer: {
        resultId: "newer",
        studentKey: "ghost-key-1",
        gameId: "verb-runner",
        completedAt: 200,
        acceptedAt: 210,
        percentage: 90,
        metrics: { correct: 18, errors: 2, bestStreak: 7 }
      }
    }
  };

  const history = model.cogResultHistoryForStudent(results, "ghost-key-1");
  assert.deepEqual(history.map((item) => item.resultId), ["newer", "older"]);
  assert.equal(model.studentHasCogResult(results, "ghost-key-1"), true);
  assert.equal(model.studentHasCogResult(results, "ghost-key-2"), false);
  assert.equal(model.cogResultStudentCount(results), 1);
  assert.deepEqual(
    model.cogMetricEntries(history[0]).map((entry) => entry.label),
    ["Correct", "Errors", "Best streak"]
  );
});

test("Teacher Assignments reads COG result receipts directly from Firebase and never treats them as automatic grades", async () => {
  const [js, html] = await Promise.all([
    readFile(new URL("../teacher-assignments.js", import.meta.url), "utf8"),
    readFile(new URL("../teacher-assignments.html", import.meta.url), "utf8")
  ]);

  assert.match(js, /from "\.\/cog-assignment-results\.mjs"/);
  assert.match(js, /onValue\(ref\(db, "classroomGameResultsByAssignment"\)/);
  assert.doesNotMatch(js, /\/api\/cog-assignment-results/);
  assert.doesNotMatch(js, /getTeacherSessionToken/);
  assert.match(js, /cogResultHistoryForStudent/);
  assert.match(js, /assignmentTypeCodeFor\(assignment\)\s*===\s*"COG"/);
  assert.match(js, /submissionList\.hidden\s*=\s*isCogAssignment/);
  assert.match(js, /syncAiGradesBtn\.disabled\s*=\s*isCogAssignment/);
  assert.match(js, /openDriveFolderBtn\.disabled\s*=\s*isCogAssignment/);
  assert.match(js, /submittedCountLabel.*Results/s);
  assert.match(js, /missingCountLabel.*No result/s);
  assert.match(js, /evaluation\.complete\s*&&\s*!evaluation\.isCog/);
  assert.match(js, /assignmentHasSubmissions\(selectedAssignmentId\)\s*\|\|\s*\(isCogAssignment\s*&&\s*cogResultKeys\.size\s*>\s*0\)/);

  assert.match(html, /id="eligibleCountLabel"/);
  assert.match(html, /id="submittedCountLabel"/);
  assert.match(html, /id="missingCountLabel"/);
  assert.match(html, /id="cogResultsPanel"/);
  assert.match(html, /id="cogResultsList"/);
  assert.match(html, /Verified game receipts/);
  assert.doesNotMatch(html, /COG grade/i);
});
