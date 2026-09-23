import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("teacher-assignments browser module parses as an ES module", () => {
  const source = readFileSync(join(root, "teacher-assignments.js"), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "youteach-assignment-syntax-"));
  const target = join(dir, "teacher-assignments.mjs");

  try {
    writeFileSync(target, source, "utf8");
    const result = spawnSync(process.execPath, ["--check", target], {
      encoding: "utf8"
    });

    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join("\n")
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
