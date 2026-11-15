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
//     name is only printed beside it. Only a tag that is a version (vX.Y.Z) and whose commit is
//     an ancestor of postulo-chromium's main counts: a pre-release, a tag that is not a
//     version, or a tag on a side branch is ignored (and said), so pushing one cannot move the pin;
//   - the watch goes on after the tag: the commits on main since it that change `src/` are
//     printed, and one that carries a `Security:` trailer fails the check, because a fix the
//     package lacks is the one thing this repository exists to notice (CI also runs it weekly);
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

let clonedDir = null;
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
const allTags = [...tagCommits].map(([name, sha]) => ({ name, sha }));
const VERSION = /^v\d+\.\d+\.\d+$/;
const mainTip = heads.find((head) => head.name === "main") || null;
const tags = allTags.filter((tag) => VERSION.test(tag.name));
for (const tag of allTags.filter((tag) => !VERSION.test(tag.name))) {
  console.log(`Ignoring the tag ${tag.name} of postulo-chromium: it is not a version (vX.Y.Z).`);
}
// A tag counts only when its commit is on main; whoever can push a tag must not be able to
// choose the commit this package is told to move to.
for (const tag of [...tags]) {
  if (mainTip && !isAncestor(tag.sha, mainTip.sha)) {
    console.log(`Ignoring the tag ${tag.name} of postulo-chromium: its commit ${tag.sha} is not on main.`);
    tags.splice(tags.indexOf(tag), 1);
  }
}
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
  if (mainTip && mainTip.sha !== latest.sha) {
    const since = sourceCommitsBetween(latest.sha, mainTip.sha);
    if (since.length) {
      console.log(`postulo-chromium's main is ahead of ${latest.name} by ${since.length} commit(s) that change src/:`);
      for (const commit of since) {
        console.log(`  ${commit.line}${commit.security ? "  [Security]" : ""}`);
      }
      const security = since.filter((commit) => commit.security);
      if (security.length) {
        fail(
          `${security.length} of them carry a Security: trailer, so the Firefox package lacks a security fix:`,
          ...security.map((commit) => `  ${commit.line}`),
          "Have postulo-chromium cut a tag that contains them, and move the pin to its commit.",
        );
      }
    }
  }
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
        ...between.map((commit) => `  ${commit.line}`),
        "Move the pin to a commit that has them: until postulo-chromium cuts a tag, a fix to the shared source skips the Firefox package unless this fails.",
      );
    }
    console.log(`source.json pins the commit ${ref}: postulo-chromium has no tag yet, and main is ahead of it by commits that leave src/ alone.`);
  }
}

/** A blobless bare clone of main in a temporary directory, made once: names of files and
 *  messages are enough. Removed when the process exits. */
function clone() {
  if (!clonedDir) {
    clonedDir = mkdtempSync(join(tmpdir(), "postulo-pin-"));
    process.on("exit", () => rmSync(clonedDir, { recursive: true, force: true }));
    execFileSync("git", ["-c", "core.autocrlf=false", "-c", "core.eol=lf", "clone", "--quiet", "--bare", "--filter=blob:none", "--no-tags", pin.repository, clonedDir], { stdio: "pipe" });
  }
  return clonedDir;
}

/** Whether `commit` is an ancestor of `tip`; a commit the clone of main does not hold is not. */
function isAncestor(commit, tip) {
  try {
    execFileSync("git", ["--git-dir", clone(), "merge-base", "--is-ancestor", commit, tip], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** The commits after `from` up to `to` that change anything under src/, as { line: "sha subject",
 *  security: carries a Security: trailer }. */
function sourceCommitsBetween(from, to) {
  if (!isAncestor(from, to)) {
    fail(`source.json pins ${from}, which is not an ancestor of postulo-chromium's main (${to}).`);
  }
  return execFileSync("git", ["--git-dir", clone(), "log", "--format=%h %s%x1f%B%x1e", `${from}..${to}`, "--", "src"], { encoding: "utf8" })
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [line, body] = entry.split("\x1f");
      return { line, security: /^Security:/im.test(body || "") };
    });
}
