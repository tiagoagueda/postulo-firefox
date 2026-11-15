// Runs with `node --test`: npm run sign refuses anything but a clean checkout of the tag, and
// the build does not depend on the machine's git settings or hand its environment on (SEC3-006).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { digests } from "../scripts/digests.mjs";
import { problems } from "../scripts/sign.mjs";

test("a clean checkout of the matching tag may be signed", () => {
  assert.deepEqual(problems({ status: "", tags: ["v0.5.0"], version: "0.5.0" }), []);
});

test("a dirty tree, an untagged HEAD and a tag that is not the version are each refused", () => {
  assert.match(problems({ status: " M scripts/build.mjs\n", tags: ["v0.5.0"], version: "0.5.0" })[0], /uncommitted/);
  assert.match(problems({ status: "", tags: [], version: "0.5.0" })[0], /not a version tag/);
  assert.match(problems({ status: "", tags: ["nightly"], version: "0.5.0" })[0], /not a version tag/);
  assert.match(problems({ status: "", tags: ["v0.6.0"], version: "0.5.0" })[0], /package\.json's version is 0\.5\.0/);
});

test("npm run sign goes through the guard, not through a bare rebuild", () => {
  const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  assert.equal(scripts.sign, "node scripts/sign.mjs");
});

test("the build checks out LF whatever the machine says, and passes its children no credentials", () => {
  const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /core\.autocrlf=false/);
  assert.match(build, /core\.eol=lf/);
  assert.doesNotMatch(build, /env: process\.env/);
  assert.equal((build.match(/env: childEnv/g) || []).length, 3);
  assert.doesNotMatch(build, /WEB_EXT/);
});

test("the digests list every file by relative path, sorted", () => {
  const root = mkdtempSync(join(tmpdir(), "digests-"));
  try {
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "b.js"), "b");
    writeFileSync(join(root, "lib", "a.js"), "a");
    const lines = digests(root);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^[0-9a-f]{64} {2}b\.js$/);
    assert.match(lines[1], /^[0-9a-f]{64} {2}lib\/a\.js$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
