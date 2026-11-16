import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { missingLanguages, requiredFolders } from "../scripts/check-locales.mjs";

test("the list for a release is its line's, and an unknown line is refused", () => {
  assert.deepEqual(requiredFolders("0.5.2", { "0.5": ["en", "fr"] }), ["en", "fr"]);
  assert.throws(() => requiredFolders("0.6.0", { "0.5": ["en"] }), /no list for the 0\.6 line/);
});

test("a language without its catalogue is named", () => {
  const root = mkdtempSync(join(tmpdir(), "locales-"));
  try {
    for (const folder of ["en", "fr"]) {
      mkdirSync(join(root, "_locales", folder), { recursive: true });
      writeFileSync(join(root, "_locales", folder, "messages.json"), "{}");
    }
    assert.deepEqual(missingLanguages(root, ["en", "fr", "fr_CA"]), ["fr_CA"]);
    assert.deepEqual(missingLanguages(root, ["en", "fr"]), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the table covers the package's own version line", () => {
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  const table = JSON.parse(readFileSync(new URL("../release-languages.json", import.meta.url), "utf8"));
  assert.ok(requiredFolders(version, table).includes("fr"));
});
