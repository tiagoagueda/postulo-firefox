// Runs with `node --test`: check-pin refuses a pin that is behind main by commits that change
// src/, against a throwaway repository standing in for postulo-chromium (no tag, as today).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-pin.mjs");
const root = mkdtempSync(join(tmpdir(), "pin-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
}

function commit(repo, file, text, message) {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), text);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function fixture() {
  const repo = mkdtempSync(join(root, "chromium-"));
  git(repo, "init", "-q", "-b", "main");
  return repo;
}

function run(repo, ref) {
  const cwd = mkdtempSync(join(root, "firefox-"));
  writeFileSync(join(cwd, "source.json"), JSON.stringify({ repository: repo, ref }));
  const done = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
  return { code: done.status, out: done.stdout + done.stderr };
}

test("a pin at the tip of main passes", () => {
  const repo = fixture();
  const tip = commit(repo, "src/a.js", "1", "first");
  assert.equal(run(repo, tip).code, 0);
});

test("a pin behind main by a commit that changes src/ fails, naming the commit", () => {
  const repo = fixture();
  const pinned = commit(repo, "src/a.js", "1", "first");
  commit(repo, "src/a.js", "2", "Fix the refusal summary");
  const { code, out } = run(repo, pinned);
  assert.equal(code, 1);
  assert.match(out, /Fix the refusal summary/);
});

test("a pin behind main only by commits that leave src/ alone passes", () => {
  const repo = fixture();
  const pinned = commit(repo, "src/a.js", "1", "first");
  commit(repo, "README.md", "x", "Words");
  commit(repo, "test/a.test.mjs", "x", "A test");
  const { code, out } = run(repo, pinned);
  assert.equal(code, 0, out);
  assert.match(out, /ahead of it by commits that leave src\/ alone/);
});
