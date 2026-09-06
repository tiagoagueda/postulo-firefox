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
  phone comes with the listing. `strict_min_version` is 128 for both.

## Build

```sh
npm ci
npm run build      # clones postulo-chromium at the pinned ref and assembles dist/
npm run lint       # web-ext lint on dist/
npm run package    # a zip under web-ext-artifacts/
```

To ship a new version: tag postulo-chromium, put the tag in `source.json`, and run
`npm run sign` (or upload the packaged zip on addons.mozilla.org).

## Licence

AGPL-3.0-or-later, like Postulo.
