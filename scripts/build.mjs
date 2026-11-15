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
import { assertAllowedRepository, isFullSha } from "./pin.mjs";

const pin = JSON.parse(readFileSync("source.json", "utf8"));

// Before anything is cloned or run: the repository is the one this package is built from, and
// the pin is a commit that cannot move (see scripts/pin.mjs).
assertAllowedRepository(pin.repository);
if (!isFullSha(pin.ref)) {
  throw new Error(`source.json pins "${pin.ref}", which is not a full commit SHA; a branch or a tag can be moved.`);
}

const checkout = join(".source", "postulo-chromium");

// The bytes of the package must not depend on the machine that builds it: git is told to check
// out LF whatever core.autocrlf says (a Windows checkout would otherwise copy CRLF into the
// package), and the child processes get the few variables they need, not the environment --
// under `npm run sign` that holds the AMO credentials (SEC3-006).
const gitConfig = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];
const childEnv = Object.fromEntries(
  ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE"]
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]]),
);

rmSync(".source", { recursive: true, force: true });
mkdirSync(".source", { recursive: true });
execFileSync("git", [...gitConfig, "clone", "--quiet", "--no-checkout", pin.repository, checkout], { stdio: "inherit", env: childEnv });
execFileSync("git", [...gitConfig, "-C", checkout, "checkout", "--quiet", pin.ref], { stdio: "inherit", env: childEnv });

// Which commit that actually was. A pin that moved between two builds is the one thing
// this repository exists to prevent, so the build says what it built and refuses a pin
// that turned out to be a branch: see scripts/check-pin.mjs, which CI runs first.
const at = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const branches = execFileSync("git", ["-C", checkout, "branch", "--remotes", "--list", `origin/${pin.ref}`], {
  encoding: "utf8",
}).trim();
if (branches) {
  throw new Error(`source.json pins "${pin.ref}", which is a branch and moves; pin a tag or a commit SHA.`);
}

execFileSync(process.execPath, ["scripts/build.mjs", "firefox"], { cwd: checkout, stdio: "inherit", env: childEnv });

const built = join(checkout, "dist", "firefox");
if (!existsSync(join(built, "manifest.json"))) {
  throw new Error("The shared source did not produce a Firefox build.");
}
rmSync("dist", { recursive: true, force: true });
cpSync(built, "dist", { recursive: true });
console.log(`dist/ built from ${pin.repository} at ${pin.ref} (${at})`);
