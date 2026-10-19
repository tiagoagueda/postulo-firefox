# postulo-firefox

**The Postulo browser extension for Firefox, Firefox for Android, and the forks —
LibreWolf, Zen, Waterfox, Floorp.** One button sends the job posting you are looking at to
your own [Postulo](https://source.tiagoagueda.com/postulo/postulo), for review.

The code is the same as the Chromium extension and lives in
[postulo-chromium](https://source.tiagoagueda.com/postulo/postulo-chromium), which
builds for both browsers from one source. This repository holds what Firefox and
addons.mozilla.org need and nothing else: the pin to the shared source (`source.json`), the
build that assembles the Firefox package from it, the signing and listing notes, and CI.
Everything in postulo-chromium's README about privacy and setup applies here.

## What Firefox does differently, and how the build handles it

- **Background.** Firefox runs an event page (`background.scripts`), not a service
  worker. The shared manifest lists both; the Firefox build keeps `scripts`.
- **Identity.** `browser_specific_settings.gecko.id` (`postulo@tiagoagueda.com`) is required
  for a Manifest V3 extension to be signed and to keep its storage across updates. It is in
  the shared manifest and stays in the Firefox build.
- **Host permissions are opt-in.** Firefox grants nothing at install. The extension asks for
  your instance's origin when you *Save* the settings, from that click, and says so if you
  refuse — then it can do nothing, and tells you why.
- **Signing is mandatory.** Release Firefox refuses unsigned extensions. `npm run sign`
  submits the build to addons.mozilla.org (needs `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`
  from your AMO account); Developer Edition and Nightly load `dist/` unsigned from
  `about:debugging` for development.
- **Android.** Firefox for Android installs from addons.mozilla.org, so a capture from a
  phone comes with the listing.
- **Minimum version.** The shared manifest declares `data_collection_permissions`
  (`required: ["none"]` — the extension collects nothing), which Firefox understands from
  140 and Firefox for Android from 142. `strict_min_version` says so: 140 on desktop, 142
  on Android. An older Firefox would install the extension and ignore the declaration,
  which is the one thing a declaration about data must not do. Both values live in
  postulo-chromium's `src/manifest.json`, the one manifest, and reach here through the pin.

## Build

```sh
npm ci
npm run check:pin  # source.json pins something that cannot move
npm run audit      # no new high or critical advisory in the development chain
npm run build      # clones postulo-chromium at the pinned ref and assembles dist/
npm run lint       # web-ext lint on dist/
npm run package    # a zip under web-ext-artifacts/
```

## The pin

`source.json` names the commit of postulo-chromium this package is built from, and it is
never a branch. addons.mozilla.org rebuilds a source submission and compares it to the
package: with `"ref": "main"` the reviewer's build is a later extension than the submitted
one, and the Firefox and Chromium extensions quietly stop being the same extension.
`npm run check:pin`, which CI runs before the build, refuses a branch, `HEAD`, a tag name or a
short SHA (a tag can be moved: the pin is always a full 40-hex commit), refuses any repository
but postulo-chromium's (the build runs that repository's `scripts/build.mjs`), and — once
postulo-chromium cuts its first tag — refuses any pin that is not the commit of the latest of them.
postulo-chromium has no tag yet, so the pin is the full commit SHA of its `main`; the check
fails when `main` is ahead of it by commits that change `src/` (naming them), so a fix to the
shared source cannot skip this package unnoticed, and the first tag replaces it. `npm test`
holds that rule against a throwaway repository.

To ship a new version: tag postulo-chromium, put the full SHA of the commit that tag points at in `source.json`, tag this
repository `vX.Y.Z` — CI then builds, lints and leaves the zip as an artifact — and run
`npm run sign` (or upload that zip on addons.mozilla.org). Signing is not done in CI: it
needs the AMO credentials.

## Licence

AGPL-3.0-or-later, like Postulo.
