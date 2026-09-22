import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Student Buzzer keeps hidden live-game cards visually hidden", async () => {
  const html = await readFile(new URL("../student-buzzer.html", import.meta.url), "utf8");

  assert.match(
    html,
    /\.live-game-card\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important\s*;?[^}]*\}/s
  );
});
