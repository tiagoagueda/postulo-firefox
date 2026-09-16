// Check that source.json pins something that cannot move under us.
//
// An addons.mozilla.org source submission has to build to the byte from what is submitted
// with it, and the two extensions have to be the same extension. Neither holds while the
// pin is a branch: `main` today and `main` next week are different extensions, and the
// reviewer's build is not the one that was submitted. So:
//
//   - a branch name, or HEAD, is refused outright;
//   - when postulo-chromium has tags, the pin has to be the latest of them, by name or by
//     the commit it points at -- the Firefox package is the Chromium release, not a commit
//     somewhere near it;
//   - until postulo-chromium cuts its first tag the pin has to be a full commit SHA, and
//     this says how far that SHA is from the tip so the drift is at least visible.
//
// Existence is not checked here: the build in the same run clones and checks the pin out,
// which fails loudly on a ref that is not there.
//
//   node scripts/check-pin.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pin = JSON.parse(readFileSync("source.json", "utf8"));
const ref = String(pin.ref || "").trim();

function remote(...args) {
  const out = execFileSync("git", ["ls-remote", ...args, pin.repository], { encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, name] = line.split("\t");
      return { sha, name };
    });
}

function fail(...lines) {
  for (const line of lines) {
    console.error(line);
  }
  process.exit(1);
}

const heads = remote("--heads").map((entry) => ({ ...entry, name: entry.name.replace(/^refs\/heads\//, "") }));
const tags = remote("--tags", "--refs").map((entry) => ({ ...entry, name: entry.name.replace(/^refs\/tags\//, "") }));
tags.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
const latest = tags.at(-1) || null;
const isSha = /^[0-9a-f]{40}$/.test(ref);

if (!ref) {
  fail("source.json has no ref: pin the tag of postulo-chromium this package is built from.");
}

if (ref === "HEAD" || heads.some((head) => head.name === ref)) {
  fail(
    `source.json pins "${ref}", which is a branch and moves.`,
    latest
      ? `Pin ${latest.name} instead: a release is built from a release.`
      : "Pin the tag of a postulo-chromium release, or its full commit SHA until there is one.",
  );
}

if (latest) {
  if (ref !== latest.name && ref !== latest.sha) {
    fail(
      `source.json pins "${ref}", but postulo-chromium's latest tag is ${latest.name} (${latest.sha}).`,
      "The Firefox package and the Chromium release have drifted; move the pin.",
    );
  }
  console.log(`source.json pins ${ref}, which is postulo-chromium's latest tag ${latest.name}.`);
} else {
  if (!isSha) {
    fail(
      `source.json pins "${ref}", which is neither a tag of postulo-chromium -- it has none yet -- nor a full commit SHA.`,
    );
  }
  const tip = heads.find((head) => head.name === "main");
  const where = tip && tip.sha === ref ? "the tip of main" : `behind main, now at ${tip ? tip.sha : "an unknown commit"}`;
  console.log(`source.json pins the commit ${ref}: postulo-chromium has no tag yet, and this is ${where}.`);
}
