// -----------------------------------------------------------------------------
// The Wikipedia integration: every handler, registered on a Gladys client.
//
// Brings "on this day" and the featured content of Wikipedia into Gladys,
// through the REST API of the Wikimedia Foundation (no key, no account), in
// the Wikipedia of each language (English, French, German, Spanish):
//   - a device (device.js): today's anniversary, article and picture, as texts
//     for the dashboards and the scenes;
//   - scene actions: on this day, the picture of the day, the article of the
//     day, ready to send or to speak;
//   - dashboard widgets (widgets.js): on this day, picture of the day, article
//     of the day, most read.
//
// The feeds change once a day: each language in use is read once a day, at
// the first need after midnight (timezone of Gladys) and checked every 30
// minutes. Nothing is written to /data. Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK and a fake Wikipedia (test/helpers/fake-api.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import {
  createWikiClient,
  ERROR_KINDS,
  smallerThumbnail,
  wikipediaRoot,
  WikiError,
} from './wiki-api.js';
import { readOnThisDay, readFeatured, KINDS } from './feed.js';
import { buildDevice, buildStates, articleOfTheDay } from './device.js';
import {
  WIDGETS,
  messageContent,
  dayPageUrl,
  buildOnThisDayWidget,
  buildPictureWidget,
  buildArticleWidget,
  buildMostReadWidget,
} from './widgets.js';
import { defaultTimeZone, localDate, monthDay, formatDayOfYear, MINUTE_MS } from './time.js';
import { LANGUAGES, t, all } from './i18n.js';

const ACTIONS = { CHECK: 'check' };
const SCENE_ACTIONS = {
  ON_THIS_DAY: 'on_this_day',
  PICTURE: 'picture_of_the_day',
  ARTICLE: 'article_of_the_day',
};
const TICK_MS = 30 * MINUTE_MS;
const PARTIAL_RETRY_MS = 30 * MINUTE_MS;
// A language not asked for by a widget for a week is not read any more.
const LANGUAGE_IDLE_MS = 7 * 24 * 60 * MINUTE_MS;
const IMAGE_CACHE = 12;
const {
  name: NAME,
  version: VERSION,
  homepage: HOMEPAGE,
} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * @description The message key and values of a failure.
 * @param {Error} err - A WikiError.
 * @returns {{ key: string, values: object }} The message.
 */
function problemOf(err) {
  switch (err?.kind) {
    case ERROR_KINDS.RATE_LIMIT:
      return { key: 'statusRateLimited', values: {} };
    case ERROR_KINDS.UNREACHABLE:
      return { key: 'statusUnreachable', values: {} };
    default:
      return { key: 'statusApiError', values: { detail: err?.message ?? String(err) } };
  }
}

/**
 * @description The day before a date.
 * @param {string} date - "2026-11-23".
 * @returns {string} "2026-11-22".
 */
const dayBefore = (date) =>
  new Date(Date.parse(`${date}T12:00:00Z`) - 24 * 60 * MINUTE_MS).toISOString().slice(0, 10);

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Test seams.
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {(language: string) => string} [options.rootOf] - The API root of a language.
 * @param {() => number} [options.now] - Clock.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Wait before a retry.
 * @param {string} [options.timeZone] - The timezone of Gladys.
 * @param {boolean} [options.timer] - Check on a timer (false in the tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetchImpl = globalThis.fetch,
    rootOf = wikipediaRoot,
    now = () => Date.now(),
    sleep,
    timeZone = defaultTimeZone(),
    timer = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let language = 'en';
  let createdDevices = new Set();
  let lastStatus = null;
  let tickTimer = null;
  // language -> { date, onThisDay, featured } of the last good reading.
  const days = new Map();
  const pending = new Map();
  // language -> last time a widget asked for it.
  const asked = new Map();
  const images = new Map();

  const client = createWikiClient({
    userAgent: `${NAME}/${VERSION} (+${HOMEPAGE})`,
    rootOf,
    fetchImpl,
    sleep,
  });

  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);
  const today = () => localDate(now(), timeZone);

  function rememberLanguage(next) {
    if (!LANGUAGES.includes(next)) {
      return;
    }
    asked.set(next, now());
    if (next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  // --- Reading ------------------------------------------------------------------

  /**
   * @description The featured feed of a date; just after midnight the feed of
   * the day may not exist yet on the servers of Wikimedia (they follow UTC):
   * the one of the day before then serves, and the day is read again later.
   * @param {string} lang - The language.
   * @param {string} date - The date.
   * @returns {Promise<{ featured: object, partial: boolean }>} The feed.
   */
  async function readFeaturedOf(lang, date) {
    try {
      return { featured: readFeatured(await client.featured(lang, date)), partial: false };
    } catch (err) {
      if (err.kind !== ERROR_KINDS.REQUEST) {
        throw err;
      }
      return {
        featured: readFeatured(await client.featured(lang, dayBefore(date))),
        partial: true,
      };
    }
  }

  /**
   * @description The content of a language for today, read when needed.
   * @param {string} lang - The language.
   * @returns {Promise<object>} `{ date, onThisDay, featured }`.
   */
  function ensureDay(lang) {
    const date = today();
    const known = days.get(lang);
    // A day read with the featured feed of the day before is read again
    // after 30 minutes (Wikimedia publishes the new one after midnight UTC).
    if (known?.date === date && (!known.partial || now() - known.readAt < PARTIAL_RETRY_MS)) {
      return Promise.resolve(known);
    }
    if (!pending.has(lang)) {
      pending.set(
        lang,
        (async () => {
          try {
            const { month, day } = monthDay(date);
            const [onThisDay, { featured, partial }] = await Promise.all([
              client.onThisDay(lang, month, day).then(readOnThisDay),
              readFeaturedOf(lang, date),
            ]);
            const fresh = { date, onThisDay, featured, partial, readAt: now() };
            days.set(lang, fresh);
            logger.info(
              `Wikipedia (${lang}) for ${date}: ${onThisDay.selected.length} anniversaries, ` +
                `${featured.article ? 'featured article' : 'no featured article'}, ` +
                `${featured.picture ? 'picture' : 'no picture'}, ${featured.mostRead.length} most read`,
            );
            return fresh;
          } finally {
            pending.delete(lang);
          }
        })(),
      );
    }
    return pending.get(lang);
  }

  // --- Device -------------------------------------------------------------------

  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  async function offerDevice() {
    await gladys
      .publishDiscoveredDevices([buildDevice(gladys, textLanguage())])
      .catch((err) => logger.warn(`Unable to offer the device: ${err.message}`));
  }

  async function publishStates() {
    const lang = textLanguage();
    const device = buildDevice(gladys, lang);
    const day = days.get(lang);
    if (!day || !createdDevices.has(device.external_id)) {
      return;
    }
    await gladys
      .publishChangedStates(buildStates(gladys, day, lang))
      .catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));
  }

  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) =>
      Promise.resolve()
        .then(() => gladys.requestWidgetRefresh(key))
        .catch(() => {}),
    );
  }

  /**
   * @description Read the languages in use for today, when the day changed:
   * the one of the texts, and those of the widgets of the last week.
   * @returns {Promise<boolean>} Whether everything was read.
   */
  async function refresh() {
    const languages = new Set([textLanguage()]);
    for (const [lang, at] of asked) {
      if (now() - at < LANGUAGE_IDLE_MS) {
        languages.add(lang);
      }
    }
    const date = today();
    const stale = [...languages].filter(
      (lang) => days.get(lang)?.date !== date || days.get(lang).partial,
    );
    if (stale.length === 0) {
      return true;
    }
    try {
      for (const lang of stale) {
        await ensureDay(lang);
      }
      await publishStates();
      refreshWidgets();
      await reportStatus(
        true,
        all('statusConnected', (lang) => ({
          languages: [...languages].sort().join(', '),
          date: formatDayOfYear(date, lang),
        })),
      );
      return true;
    } catch (err) {
      logger.warn(`Wikipedia reading failed (${err.kind ?? 'error'}): ${err.message}`);
      const { key, values } = problemOf(err);
      await reportStatus(false, all(key, values));
      return false;
    }
  }

  function schedule() {
    clearTimeout(tickTimer);
    if (!timer) {
      return;
    }
    tickTimer = setTimeout(async () => {
      await refresh();
      schedule();
    }, TICK_MS);
    tickTimer.unref?.();
  }

  // --- Dashboard widgets --------------------------------------------------------

  /**
   * @description The content of today for a widget, or the message to show.
   * @param {string} lang - The language of the widget.
   * @returns {Promise<{ day?: object, problem?: object }>} One or the other.
   */
  async function widgetDay(lang) {
    const target = LANGUAGES.includes(lang) ? lang : 'en';
    rememberLanguage(target);
    try {
      return { day: await ensureDay(target), lang: target };
    } catch (err) {
      const known = days.get(target);
      if (known) {
        return { day: known, lang: target };
      }
      const { key, values } = problemOf(err);
      return { problem: messageContent(t(key, target, values)) };
    }
  }

  gladys.onWidgetGet(WIDGETS.ON_THIS_DAY, async ({ settings = {}, language: lang } = {}) => {
    const { day, problem, lang: target } = await widgetDay(lang);
    return problem ?? buildOnThisDayWidget({ day, language: target, kind: settings.kind });
  });

  gladys.onWidgetGet(WIDGETS.PICTURE, async ({ language: lang } = {}) => {
    const { day, problem, lang: target } = await widgetDay(lang);
    return problem ?? buildPictureWidget({ day, language: target });
  });

  gladys.onWidgetGet(WIDGETS.ARTICLE, async ({ language: lang } = {}) => {
    const { day, problem, lang: target } = await widgetDay(lang);
    return problem ?? buildArticleWidget({ day, language: target });
  });

  gladys.onWidgetGet(WIDGETS.MOST_READ, async ({ language: lang } = {}) => {
    const { day, problem, lang: target } = await widgetDay(lang);
    return problem ?? buildMostReadWidget({ day, language: target });
  });

  /**
   * @description The thumbnail behind an image key of a widget.
   * @param {string} key - "potd-2026-11-23", "article-fr-2026-11-23".
   * @returns {string|null} Its URL.
   */
  function thumbnailOf(key) {
    const potd = /^potd-(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (potd) {
      for (const day of days.values()) {
        if (day.date === potd[1] && day.featured.picture) {
          return day.featured.picture.thumbnail.source;
        }
      }
      return null;
    }
    const article = /^article-([a-z]{2})-(\d{4}-\d{2}-\d{2})$/.exec(key);
    const day = article ? days.get(article[1]) : null;
    if (!day || day.date !== article[2]) {
      return null;
    }
    return articleOfTheDay(day.featured)?.page.thumbnail?.source ?? null;
  }

  gladys.onWidgetGetImage(async (key) => {
    if (images.has(key)) {
      return images.get(key);
    }
    const source = thumbnailOf(String(key));
    if (!source) {
      throw new Error(`Unknown image: ${key}`);
    }
    let base64;
    try {
      base64 = await client.image(source);
    } catch (err) {
      const smaller = err.kind === ERROR_KINDS.IMAGE ? smallerThumbnail(source) : null;
      if (!smaller) {
        throw err;
      }
      base64 = await client.image(smaller);
    }
    images.set(key, base64);
    while (images.size > IMAGE_CACHE) {
      images.delete(images.keys().next().value);
    }
    return base64;
  });

  // --- Scene actions ------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.ON_THIS_DAY, async (fields = {}) => {
    const lang = textLanguage();
    const day = await ensureDay(lang);
    const kind = KINDS.includes(fields.kind) ? fields.kind : 'selected';
    const count = Math.min(10, Math.max(1, Math.round(Number(fields.count) || 3)));
    const entries = day.onThisDay[kind].slice(0, count);
    const date = formatDayOfYear(day.date, lang);
    const sentences = entries.map((entry) =>
      entry.year === null ? entry.text : t('inYear', lang, { year: entry.year, text: entry.text }),
    );
    const summary =
      entries.length === 0
        ? t('nothing', lang)
        : t(kind === 'holidays' ? 'holidaysIntro' : 'onThisDayIntro', lang, {
            date,
            entries: sentences.join(' '),
          });
    return {
      summary: summary.slice(0, 10_000),
      count: entries.length,
      first_year: entries[0]?.year ?? null,
      first_text: entries[0]?.text ?? '',
      page_url: dayPageUrl(lang, day.date),
    };
  });

  gladys.onSceneAction(SCENE_ACTIONS.PICTURE, async () => {
    const day = await ensureDay(textLanguage());
    const picture = day.featured.picture;
    if (!picture) {
      throw new WikiError(ERROR_KINDS.REQUEST, 'No picture of the day');
    }
    return {
      description: picture.description,
      artist: picture.artist,
      license: picture.license,
      file_url: picture.url ?? '',
      image_url: picture.thumbnail.source.split('?')[0],
    };
  });

  gladys.onSceneAction(SCENE_ACTIONS.ARTICLE, async () => {
    const day = await ensureDay(textLanguage());
    const chosen = articleOfTheDay(day.featured);
    if (!chosen) {
      throw new WikiError(ERROR_KINDS.REQUEST, 'No article of the day');
    }
    return {
      title: chosen.page.title,
      description: chosen.page.description,
      extract: chosen.page.extract.slice(0, 10_000),
      url: chosen.page.url ?? '',
      most_read: chosen.mostRead,
    };
  });

  // --- Configuration button -----------------------------------------------------

  gladys.onAction(ACTIONS.CHECK, async () => {
    const lang = textLanguage();
    days.delete(lang);
    const ok = await refresh();
    if (!ok) {
      return JSON.parse(lastStatus ?? '[false,{}]')[1];
    }
    const day = days.get(lang);
    const article = articleOfTheDay(day.featured);
    return all((target) =>
      [
        t('statusConnected', target, { languages: lang, date: formatDayOfYear(day.date, target) }),
        day.onThisDay.selected[0]
          ? `${t('featureEvent', target)}: ${day.onThisDay.selected[0].year ?? ''} ${day.onThisDay.selected[0].text}`.slice(
              0,
              200,
            )
          : '',
        article ? `${t('featureArticle', target)}: ${article.page.title}` : '',
        day.featured.picture ? `${t('featurePicture', target)}: ${day.featured.picture.file}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  });

  // --- Devices ------------------------------------------------------------------

  gladys.onSetValue(async (device, feature) => {
    throw new Error(`Read-only feature: ${feature.external_id}`);
  });

  gladys.onScanRequest(async () => {
    await offerDevice();
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    await publishStates();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration ------------------------------------------------------------

  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    await loadConfig(raw);
    logger.info(`Configuration: language ${config.language}`);
    await offerDevice();
    await refresh();
    await publishStates();
  });

  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await refreshCreatedDevices();
      lastStatus = null;
      await offerDevice();
      await refresh();
      schedule();
    })().catch((err) => logger.error('Post-connection initialization failed', err));
  });

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    clearTimeout(tickTimer);
  });

  return {
    getConfig: () => config,
    refresh,
    days,
    whenReady: () => startup,
    stop: () => clearTimeout(tickTimer),
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS, problemOf };
