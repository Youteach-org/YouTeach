import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Talk Talk feature CI deploys only a YouTeach Cloudflare preview branch", async () => {
  const workflow=await readFile(new URL("../.github/workflows/talk-talk-v1.yml",import.meta.url),"utf8");
  assert.match(workflow,/deploy-preview:/);
  assert.match(workflow,/--project-name=youteach/);
  assert.match(workflow,/--branch=talk-talk-v1-20260921/);
  assert.doesNotMatch(workflow,/deploy-preview:[\s\S]*--branch=main/);
});
