import test from "node:test";
import assert from "node:assert/strict";

import { onRequestOptions, onRequestPost } from "../functions/api/cog-live-teacher-resolve.js";

test("teacher resolver accepts utichgion.org as the production COG origin", async () => {
  const options=await onRequestOptions({
    request:new Request("https://youteach.pages.dev/api/cog-live-teacher-resolve",{
      method:"OPTIONS",
      headers:{Origin:"https://utichgion.org"}
    })
  });
  assert.equal(options.status,204);
  assert.equal(options.headers.get("Access-Control-Allow-Origin"),"https://utichgion.org");

  const post=await onRequestPost({
    request:new Request("https://youteach.pages.dev/api/cog-live-teacher-resolve",{
      method:"POST",
      headers:{
        Origin:"https://utichgion.org",
        "Content-Type":"application/json"
      },
      body:JSON.stringify({})
    }),
    env:{YOUTEACH_SESSION_SECRET:"test-session-secret-abcdefghijklmnopqrstuvwxyz-123456"}
  });
  assert.equal(post.status,400);
  assert.notEqual(post.status,403);
});
