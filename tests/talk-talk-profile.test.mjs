import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTalkTalkProfile,
  mergeTalkTalkProfile
} from "../functions/_shared/talk-talk-profile.js";

test("profile normalizer keeps only skill aggregates and current focus", () => {
  const profile = normalizeTalkTalkProfile({
    studentKey: "forged-student",
    currentFocus: "past-ed-t",
    rawAudio: "must-not-survive",
    transcript: "must-not-survive",
    skills: {
      "past-ed-t": {
        state: "recurring",
        hits: 2,
        misses: 4,
        transferHits: 1,
        regressionMisses: 0,
        contexts: { word: 2, conversation: 2 },
        lastEvidenceAt: 1234,
        trend: "improving",
        rawAudio: "no"
      }
    }
  }, "canonical-student");

  assert.equal(profile.studentKey, "canonical-student");
  assert.equal(profile.currentFocus, "past-ed-t");
  assert.equal(profile.rawAudio, undefined);
  assert.equal(profile.transcript, undefined);
  assert.equal(profile.skills["past-ed-t"].rawAudio, undefined);
});

test("profile merge cannot switch student identity", () => {
  const merged = mergeTalkTalkProfile(
    { studentKey: "s1", skills: {} },
    { studentKey: "s2", currentFocus: "past-ed-t", skills: {} },
    "s1"
  );
  assert.equal(merged.studentKey, "s1");
});

test("profile rejects unknown skill states", () => {
  assert.throws(
    () => normalizeTalkTalkProfile({
      skills: { "past-ed-t": { state: "broken" } }
    }, "s1"),
    /skill state/i
  );
});
