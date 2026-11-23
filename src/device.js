// -----------------------------------------------------------------------------
// The device of the integration, offered on the Discovery screen.
//
// "Wikipedia today" (`today`): three texts, in the Wikipedia of the language
// of the configuration, renewed every day:
//   - `event`    the first selected anniversary: "1980: an earthquake…";
//   - `article`  the featured article of the day (English and German), else
//                the most read article of yesterday;
//   - `picture`  the description of the picture of the day.
// They show on a dashboard and give their text to the scenes (a morning
// message, a spoken greeting).
//
// External id: `ext:wikipedia:today`. `should_poll` stays false: the
// integration reads on its own timer, once a day.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';
import { entryText } from './feed.js';

const DEVICE_ID = 'today';
const FEATURES = { EVENT: 'event', ARTICLE: 'article', PICTURE: 'picture' };
const TEXT_MAX = 250;

const clip = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * @description The external ids of the device.
 * @param {object} gladys - The GladysIntegration instance.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys) => gladys.externalIds('device', DEVICE_ID);

/**
 * @description The device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} language - Language of the names.
 * @returns {object} The discovered device.
 */
function buildDevice(gladys, language) {
  const ids = idsOf(gladys);
  const text = (key, name) => ({
    name: t(name, language),
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    keep_history: false,
    min: 0,
    max: 0,
  });
  return {
    name: t('deviceName', language),
    external_id: ids.device,
    model: 'Wikipedia',
    should_poll: false,
    params: [],
    features: [
      text(FEATURES.EVENT, 'featureEvent'),
      text(FEATURES.ARTICLE, 'featureArticle'),
      text(FEATURES.PICTURE, 'featurePicture'),
    ],
  };
}

/**
 * @description The article of the day: the featured one, else the most read.
 * @param {object} featured - `readFeatured()`.
 * @returns {{ page: object, mostRead: boolean }|null} The article.
 */
function articleOfTheDay(featured) {
  if (featured?.article) {
    return { page: featured.article, mostRead: false };
  }
  const first = featured?.mostRead?.[0];
  return first ? { page: first, mostRead: true } : null;
}

/**
 * @description The states of the device; a text the feeds do not give is not
 * published.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} day - `{ onThisDay, featured }` of the language.
 * @param {string} language - The language.
 * @returns {Array<object>} `{ device_feature_external_id, text }`.
 */
function buildStates(gladys, day, language) {
  const ids = idsOf(gladys);
  const states = [];
  const event = day?.onThisDay?.selected?.[0];
  if (event) {
    states.push({
      device_feature_external_id: ids.feature(FEATURES.EVENT),
      text: clip(entryText(event, t('yearSeparator', language)), TEXT_MAX),
    });
  }
  const article = articleOfTheDay(day?.featured);
  if (article) {
    states.push({
      device_feature_external_id: ids.feature(FEATURES.ARTICLE),
      text: clip(article.page.title, TEXT_MAX),
    });
  }
  const picture = day?.featured?.picture;
  if (picture?.description || picture?.file) {
    states.push({
      device_feature_external_id: ids.feature(FEATURES.PICTURE),
      text: clip(picture.description || picture.file, TEXT_MAX),
    });
  }
  return states;
}

export { DEVICE_ID, FEATURES, idsOf, buildDevice, buildStates, articleOfTheDay };
