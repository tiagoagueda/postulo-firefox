// At a release, the built package must carry every language the core selects for the release
// it ships beside (postulo/postulo-firefox#5; the core's SELECTED table in messages_tool.py).
// The shared source's build leaves a catalogue out of the package while it is incomplete, so
// a pin whose catalogue lags would otherwise produce a package that quietly lacks a language.
//
//   node scripts/check-locales.mjs [dist]
//
// release-languages.json holds, per release line (X.Y), the _locales folders the package must
// have; copy a new line from the core when it selects one. A development build does not run
// this: it needs only English, French and Portuguese, which the shared source's tests hold.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The required folders for `version` ("0.5.3" -> line "0.5"); throws when the line is unknown. */
export function requiredFolders(version, table) {
  const line = String(version).split(".").slice(0, 2).join(".");
  if (!Array.isArray(table[line])) {
    throw new Error(`release-languages.json has no list for the ${line} line: copy the core's selected languages for it.`);
  }
  return table[line];
}

/** The required folders of `dist/_locales` that are missing, or present without a messages.json. */
export function missingLanguages(dist, required) {
  return required.filter((folder) => !existsSync(join(dist, "_locales", folder, "messages.json")));
}

function main() {
  const dist = process.argv[2] || "dist";
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const table = JSON.parse(readFileSync("release-languages.json", "utf8"));
  const missing = missingLanguages(dist, requiredFolders(version, table));
  if (missing.length) {
    console.error(`The package lacks ${missing.length} language(s) release ${version} must carry: ${missing.join(", ")}.`);
    console.error("Pin a postulo-chromium commit whose catalogues for them are complete (drafts count).");
    process.exit(1);
  }
  console.log(`Every language selected for ${version} is in the package (${readdirSync(join(dist, "_locales")).length} folders).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
