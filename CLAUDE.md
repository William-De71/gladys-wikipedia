# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Wikipedia: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the public feeds of the Wikipedia REST
API (`https://<language>.wikipedia.org/api/rest_v1/feed/onthisday/all/MM/DD`
and `/feed/featured/YYYY/MM/DD`, no key) in English, French, German and
Spanish, and the thumbnails of Wikimedia Commons. Transport: cloud only. The
answers were checked against the real API on 2026-11-23 (the fixtures are
real answers, cut down).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js          SDK wiring only (new GladysIntegration + createApp)
src/app.js        every handler; one reading per language and day (date of TZ),
                  checked every 30 min; widgets, images, scene actions, device
src/wiki-api.js   HTTP client: User-Agent with the repository, one retry on 5xx /
                  network, images from Wikimedia hosts only, 300 KB at most
src/feed.js       feeds -> on this day (5 lists), featured (article, picture,
                  most read), plain texts
src/device.js     the "Wikipedia today" device (3 texts) and its states
src/widgets.js    on_this_day, picture, article, most_read (Wikipedia credited)
src/time.js       local date, day of the year in each language
src/config.js     configuration (language)
src/i18n.js       runtime texts, en / fr / de / es
test/helpers/fake-api.js   the fake Wikipedia behind the `fetchImpl` option
.github/scripts/release.mjs   version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: the device
  and feature external ids (`device:today:event|article|picture`), the keys of
  `config_schema` and the values of its selects, `actions`, the widgets and
  their settings (`kind` values), the scene actions (fields, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Licences**: Wikipedia texts are CC BY-SA 4.0: every widget credits
  Wikipedia; the picture of the day shows its author and licence (Commons).
  Never show an article thumbnail in the docs or the cover: many are non-free
  (fair use). The illustration uses a drawn gradient for it; `potd.jpg` is a
  CC BY-SA picture credited in NOTICE.
- **Trademark**: no Wikipedia logo (Wikimedia trademark policy); the name only,
  with the "not affiliated" notices.
- **Wikimedia API etiquette**: a User-Agent (and `Api-User-Agent`) naming the
  integration, its version and its repository; never a user detail. One
  reading per language and day: the feeds are cached by Wikimedia.
- **Day**: the date of Gladys (TZ). Just after midnight the featured feed of
  the day may not exist yet (Wikimedia follows UTC): the one of the day before
  serves, marked `partial`, read again after 30 minutes.
- **Images**: served by `onWidgetGetImage` (the browser never loads a third
  party); keys `potd-<date>` and `article-<lang>-<date>` change every day; a
  thumbnail over 300 KB is asked again at 500 px (a standard Wikimedia width:
  640 px answers 400).
- **Widget limits**: card titles 60, subtitles 60, link labels 24, image alt
  100, captions 80, 2 texts per card; a status line without a value is
  dropped by the core.
- **No scene trigger**: nothing happens that a scheduled scene cannot catch.
- **The container rootfs is read-only**; nothing is written to `/data`.
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `docs/*.md`, README) exists in English, French, German and Spanish;
  `test/i18n.test.js` checks it. German uses "du", Spanish "usted". The
  content itself comes from the Wikipedia of the language, never translated.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- Only the English and German Wikipedia have a `tfa` (featured article): the
  French and Spanish ones fall back to the most read article of yesterday
  (`most_read: true`).
- `onthisday/all` is 1 to 1.7 MB per language; only the kept fields stay in
  memory.
- The `selected` list may be empty some days: the events take its place.
- Thumbnails come from `thumb.wikimedia.org` (Commons) or
  `upload.wikimedia.org`; the API adds `utm_*` parameters, removed before the
  request.
- English day pages are "November_23", French "23_novembre", German
  "23._November", Spanish "23_de_noviembre" (`dayPageUrl`).
- `node --test` also runs `test/helpers/`: nothing starts on import.
