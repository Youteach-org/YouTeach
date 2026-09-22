import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Cloudflare Pages build copies root browser .mjs modules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "youteach-build-pages-"));
  try {
    const script = await readFile(new URL("../build-pages.sh", import.meta.url), "utf8");
    await writeFile(join(dir, "build-pages.sh"), script);
    await writeFile(join(dir, "index.html"), "<!doctype html><title>test</title>");
    await writeFile(join(dir, "browser-policy.mjs"), "export const ok = true;");

    await execFileAsync("sh", ["build-pages.sh"], { cwd: dir });

    await access(join(dir, "dist", "browser-policy.mjs"));
    assert.ok(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
