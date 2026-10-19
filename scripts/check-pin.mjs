// Check that source.json pins something that cannot move under us.
//
// An addons.mozilla.org source submission has to build to the byte from what is submitted
// with it, and the two extensions have to be the same extension. Neither holds while the
// pin is a branch: `main` today and `main` next week are different extensions, and the
// reviewer's build is not the one that was submitted. So:
//
//   - a branch name, or HEAD, is refused outright;
//   - the pin is a full 40-hex commit SHA, always, never a tag name: a tag can be deleted and
//     created again on another commit, and the build clones over the network at build time;
//   - the repository is postulo-chromium's, the only one this package is built from (the
//     build runs that repository's scripts/build.mjs);
//   - when postulo-chromium has tags, the pin has to be the commit of the latest of them --
//     the Firefox package is the Chromium release, not a commit somewhere near it; the tag's
//     name is only printed beside it;
//   - until postulo-chromium cuts its first tag the pin has to be current: a pin behind main by commits that change `src/` is refused,
//     naming them, because those are changes the Firefox package would silently lack.
//     Behind main by commits that touch nothing the extension is built from (its tests,
//     its CI, its README) is only said.
//
// Existence is not checked here: the build in the same run clones and checks the pin out,
// which fails loudly on a ref that is not there.
//
//   node scripts/check-pin.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertAllowedRepository, isFullSha } from "./pin.mjs";

const pin = JSON.parse(readFileSync("source.json", "utf8"));
try {
  assertAllowedRepository(pin.repository);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
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
// An annotated tag is listed twice: the tag object, and `name^{}`, the commit it points at. The
// commit is what a pin is compared with.
const tagCommits = new Map();
for (const entry of remote("--tags")) {
  const name = entry.name.replace(/^refs\/tags\//, "");
  const peeled = name.endsWith("^{}");
  const key = peeled ? name.slice(0, -3) : name;
  if (peeled || !tagCommits.has(key)) {
    tagCommits.set(key, entry.sha);
  }
}
const tags = [...tagCommits].map(([name, sha]) => ({ name, sha }));
tags.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
const latest = tags.at(-1) || null;

if (!ref) {
  fail("source.json has no ref: pin the full commit SHA of postulo-chromium this package is built from.");
}

if (ref === "HEAD" || heads.some((head) => head.name === ref)) {
  fail(
    `source.json pins "${ref}", which is a branch and moves.`,
    latest
      ? `Pin the commit of ${latest.name} (${latest.sha}) instead: a release is built from a release.`
      : "Pin the full commit SHA of a postulo-chromium commit.",
  );
}

if (!isFullSha(ref)) {
  const named = tags.find((tag) => tag.name === ref);
  fail(
    `source.json pins "${ref}", which is not a full commit SHA.`,
    named
      ? `That is the tag ${named.name}, and a tag can be moved: pin the commit it points at today, ${named.sha}.`
      : "Pin the full 40-hex commit SHA; a branch or a tag name can be moved under the build.",
  );
}

if (latest) {
  if (ref !== latest.sha) {
    fail(
      `source.json pins ${ref}, but postulo-chromium's latest tag is ${latest.name} (${latest.sha}).`,
      "The Firefox package and the Chromium release have drifted; move the pin to that commit.",
    );
  }
  console.log(`source.json pins ${ref}, the commit of postulo-chromium's latest tag ${latest.name}.`);
} else {
  const tip = heads.find((head) => head.name === "main");
  if (tip && tip.sha === ref) {
    console.log(`source.json pins the commit ${ref}: postulo-chromium has no tag yet, and this is the tip of main.`);
  } else if (!tip) {
    console.log(`source.json pins the commit ${ref}: postulo-chromium has no tag yet, and no main to compare it with.`);
  } else {
    const between = sourceCommitsBetween(ref, tip.sha);
    if (between.length) {
      fail(
        `source.json pins ${ref}, which is behind postulo-chromium's main (${tip.sha}) by ${between.length} commit(s) that change src/:`,
        ...between.map((line) => `  ${line}`),
        "Move the pin to a commit that has them: until postulo-chromium cuts a tag, a fix to the shared source skips the Firefox package unless this fails.",
      );
    }
    console.log(`source.json pins the commit ${ref}: postulo-chromium has no tag yet, and main is ahead of it by commits that leave src/ alone.`);
  }
}

/** The commits after `from` up to `to` that change anything under src/, as "sha subject". Reads
 *  history from a blobless clone in a temporary directory: names of files are enough. */
function sourceCommitsBetween(from, to) {
  const dir = mkdtempSync(join(tmpdir(), "postulo-pin-"));
  try {
    execFileSync("git", ["clone", "--quiet", "--bare", "--filter=blob:none", "--no-tags", pin.repository, dir], { stdio: "pipe" });
    try {
      execFileSync("git", ["--git-dir", dir, "merge-base", "--is-ancestor", from, to], { stdio: "pipe" });
    } catch {
      fail(`source.json pins ${from}, which is not an ancestor of postulo-chromium's main (${to}).`);
    }
    return execFileSync("git", ["--git-dir", dir, "log", "--format=%h %s", `${from}..${to}`, "--", "src"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
