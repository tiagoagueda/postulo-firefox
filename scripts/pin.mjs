// What source.json may name, shared by the build (which runs the named repository's code) and
// by the pin check.
//
// The build clones `repository` and executes its scripts/build.mjs, so a pull request that
// edits that one line would run a repository of its choosing in CI. Only the one repository
// this package is the Firefox build of is accepted. POSTULO_PIN_ALLOW (comma separated) adds
// to the list for the tests, which stand a throwaway repository in for it; nothing in the
// workflows sets it.

export const CHROMIUM = "https://source.tiagoagueda.com/postulo/postulo-chromium.git";

export function allowedRepositories(env = process.env) {
  const extra = String(env.POSTULO_PIN_ALLOW || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [CHROMIUM, ...extra];
}

/** Throws when `repository` is not one the build may clone and run. */
export function assertAllowedRepository(repository, env = process.env) {
  if (!allowedRepositories(env).includes(repository)) {
    throw new Error(
      `source.json names the repository "${repository}", which this package is not built from. ` +
        `Only ${CHROMIUM} is accepted: the build runs that repository's scripts/build.mjs.`,
    );
  }
}

/** A pin is a full commit SHA, always: a branch or a tag name can be moved. */
export function isFullSha(ref) {
  return /^[0-9a-f]{40}$/.test(String(ref));
}
