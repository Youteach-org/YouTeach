import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Talk Talk profile endpoints verify signed student session and never trust body studentKey", async () => {
  const getSource = await readFile(new URL("../functions/api/talk-talk-profile-get.js", import.meta.url), "utf8");
  const upsertSource = await readFile(new URL("../functions/api/talk-talk-profile-upsert.js", import.meta.url), "utf8");

  for (const source of [getSource, upsertSource]) {
    assert.match(source, /verifyCogLiveToken/);
    assert.match(source, /cog-live-student-session/);
    assert.match(source, /grant\.studentKey/);
  }

  assert.doesNotMatch(upsertSource, /body\.studentKey\s*\|\|/);
  assert.match(upsertSource, /talkTalkProfiles/);
});
