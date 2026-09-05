// Build the Firefox package from the shared source.
//
// The extension's code lives in postulo-chromium, which builds for both browsers from one
// source; this repository carries what Firefox and addons.mozilla.org need — the listing,
// the signing notes, the CI — and assembles the Firefox build from that source at the
// commit pinned in source.json. Bumping the pin is how a new version reaches Firefox.
//
//   node scripts/build.mjs          # dist/ holds the loadable extension
//   npm run package                 # plus a zip under web-ext-artifacts/

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pin = JSON.parse(readFileSync("source.json", "utf8"));
const checkout = join(".source", "postulo-chromium");

rmSync(".source", { recursive: true, force: true });
mkdirSync(".source", { recursive: true });
execFileSync("git", ["clone", "--quiet", "--no-checkout", pin.repository, checkout], { stdio: "inherit" });
execFileSync("git", ["-C", checkout, "checkout", "--quiet", pin.ref], { stdio: "inherit" });

execFileSync("node", ["scripts/build.mjs", "firefox"], { cwd: checkout, stdio: "inherit" });

const built = join(checkout, "dist", "firefox");
if (!existsSync(join(built, "manifest.json"))) {
  throw new Error("The shared source did not produce a Firefox build.");
}
rmSync("dist", { recursive: true, force: true });
cpSync(built, "dist", { recursive: true });
console.log(`dist/ built from ${pin.repository} at ${pin.ref}`);
