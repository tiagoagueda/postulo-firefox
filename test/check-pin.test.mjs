// Runs with `node --test`: check-pin refuses a pin that is behind main by commits that change
// src/, against a throwaway repository standing in for postulo-chromium (no tag, as today).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

// `allow` is what stands the throwaway repository in for postulo-chromium (scripts/pin.mjs).
function run(repo, ref, { allow = true, script = SCRIPT } = {}) {
  const cwd = mkdtempSync(join(root, "firefox-"));
  writeFileSync(join(cwd, "source.json"), JSON.stringify({ repository: repo, ref }));
  const env = { ...process.env, POSTULO_PIN_ALLOW: allow ? repo : "" };
  const done = spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env });
  return { code: done.status, out: done.stdout + done.stderr, cwd };
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

test("a tag name is refused as the pin once a tag exists, and the message names the commit to pin", () => {
  const repo = fixture();
  const tip = commit(repo, "src/a.js", "1", "first");
  git(repo, "tag", "v1.0.0");
  const { code, out } = run(repo, "v1.0.0");
  assert.equal(code, 1);
  assert.match(out, /not a full commit SHA/);
  assert.ok(out.includes(tip), out);
});

test("the commit of the latest tag passes, and an older commit does not", () => {
  const repo = fixture();
  const old = commit(repo, "src/a.js", "1", "first");
  git(repo, "tag", "v1.0.0");
  const second = commit(repo, "src/a.js", "2", "second");
  git(repo, "tag", "-a", "-m", "annotated", "v1.1.0");
  const ok = run(repo, second);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /latest tag v1\.1\.0/);
  const stale = run(repo, old);
  assert.equal(stale.code, 1);
  assert.match(stale.out, /latest tag is v1\.1\.0/);
});

test("a branch name and a short sha are refused", () => {
  const repo = fixture();
  const tip = commit(repo, "src/a.js", "1", "first");
  assert.equal(run(repo, "main").code, 1);
  const short = run(repo, tip.slice(0, 12));
  assert.equal(short.code, 1);
  assert.match(short.out, /not a full commit SHA/);
});

test("a source.json naming any other repository is refused by the pin check and by the build", () => {
  const repo = fixture();
  const tip = commit(repo, "src/a.js", "1", "first");
  const check = run(repo, tip, { allow: false });
  assert.equal(check.code, 1);
  assert.match(check.out, /not built from/);
  const build = run(repo, tip, { allow: false, script: join(dirname(SCRIPT), "build.mjs") });
  assert.notEqual(build.code, 0);
  assert.match(build.out, /not built from/);
  assert.equal(existsSync(join(build.cwd, ".source")), false, "nothing was cloned");
});

test("a tag exists and main is ahead of it by a commit that changes src/: the commit is named, the check passes", () => {
  const repo = fixture();
  const tagged = commit(repo, "src/a.js", "1", "first");
  git(repo, "tag", "v1.0.0");
  commit(repo, "src/a.js", "2", "Keep less of a sent capture");
  const { code, out } = run(repo, tagged);
  assert.equal(code, 0, out);
  assert.match(out, /ahead of v1\.0\.0 by 1 commit\(s\) that change src\//);
  assert.match(out, /Keep less of a sent capture/);
});

test("a tag and a commit on main since it that carries a Security: trailer fails, naming it", () => {
  const repo = fixture();
  const tagged = commit(repo, "src/a.js", "1", "first");
  git(repo, "tag", "v1.0.0");
  commit(repo, "src/a.js", "2", "Stop sending the token\n\nSecurity: SEC3-099");
  const { code, out } = run(repo, tagged);
  assert.equal(code, 1);
  assert.match(out, /Stop sending the token/);
  assert.match(out, /lacks a security fix/);
});

test("a commit since the tag that leaves src/ alone is not listed", () => {
  const repo = fixture();
  const tagged = commit(repo, "src/a.js", "1", "first");
  git(repo, "tag", "v1.0.0");
  commit(repo, "README.md", "x", "Security: words only");
  const { code, out } = run(repo, tagged);
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /ahead of/);
});

test("a tag that is not a version is ignored, even when it sorts last", () => {
  const repo = fixture();
  const tagged = commit(repo, "src/a.js", "1", "first");
  git(repo, "tag", "v1.0.0");
  commit(repo, "src/a.js", "2", "second");
  git(repo, "tag", "v1.1.0-rc1");
  git(repo, "tag", "zzz");
  const { code, out } = run(repo, tagged);
  assert.equal(code, 0, out);
  assert.match(out, /Ignoring the tag v1\.1\.0-rc1 .*not a version/);
  assert.match(out, /Ignoring the tag zzz/);
  assert.match(out, /latest tag v1\.0\.0/);
});

test("a version tag on a commit that is not on main is ignored", () => {
  const repo = fixture();
  const tagged = commit(repo, "src/a.js", "1", "first");
  git(repo, "tag", "v1.0.0");
  git(repo, "checkout", "-q", "-b", "side");
  commit(repo, "src/a.js", "evil", "Somebody's side branch");
  git(repo, "tag", "v9.0.0");
  git(repo, "checkout", "-q", "main");
  const { code, out } = run(repo, tagged);
  assert.equal(code, 0, out);
  assert.match(out, /Ignoring the tag v9\.0\.0 .*not on main/);
  assert.match(out, /latest tag v1\.0\.0/);
});

test("the workflow has a weekly schedule, so a new tag or a marked fix turns CI red without a push", () => {
  const ci = readFileSync(join(dirname(SCRIPT), "..", ".forgejo", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /^\s*schedule:\s*$/m);
  assert.match(ci, /cron:\s*"[^"]+"/);
});
