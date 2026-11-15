// Runs with `node --test`: the bug form must say what the downloadable log names (SEC3-007).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the bug form says the log names the captured sites and the instance's address", () => {
  const form = readFileSync(new URL("../.forgejo/ISSUE_TEMPLATE/bug.yaml", import.meta.url), "utf8");
  const logs = form.slice(form.indexOf("id: logs"));
  assert.match(logs, /name the site of each page you captured/);
  assert.match(logs, /address of your Postulo/);
  assert.doesNotMatch(logs, /without the token or anything from the pages/);
});
