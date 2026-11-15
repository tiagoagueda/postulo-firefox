// Sign what the tag built, and nothing else (SEC3-006).
//
//   npm run sign
//
// Signing stays a hand operation (it needs the AMO credentials), but it refuses to submit a
// working copy that is not the tag: the tree must be clean, HEAD must be a version tag
// (vX.Y.Z) that matches package.json's version, and the pin check must pass. Only then is the
// package built and handed to web-ext. Compare the SHA-256 list it prints with the one the
// release workflow printed for the same tag.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The reasons `state` may not be signed; empty when it may. */
export function problems({ status, tags, version }) {
  const out = [];
  if (String(status).trim()) {
    out.push("the working copy has uncommitted changes; sign from a clean checkout of the tag.");
  }
  const versionTags = tags.filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  if (!versionTags.length) {
    out.push("HEAD is not a version tag (vX.Y.Z); check out the tag first.");
  } else if (!versionTags.includes(`v${version}`)) {
    out.push(`HEAD is tagged ${versionTags.join(", ")}, but package.json's version is ${version}.`);
  }
  return out;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main() {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const found = problems({
    status: git("status", "--porcelain"),
    tags: git("tag", "--points-at", "HEAD").split(/\r?\n/).filter(Boolean),
    version,
  });
  if (found.length) {
    for (const line of found) {
      console.error(`Not signing: ${line}`);
    }
    process.exit(1);
  }
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const [command, args] of [
    [npm, ["run", "check:pin"]],
    [npm, ["run", "build"]],
  ]) {
    if (spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" }).status !== 0) {
      process.exit(1);
    }
  }
  const sha = spawnSync(process.execPath, ["scripts/digests.mjs", "dist"], { stdio: "inherit" });
  if (sha.status !== 0) {
    process.exit(1);
  }
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const signed = spawnSync(npx, ["web-ext", "sign", "--source-dir", "dist", "--channel", "unlisted"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(signed.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
