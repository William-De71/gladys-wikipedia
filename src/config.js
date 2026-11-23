// -----------------------------------------------------------------------------
// Configuration of the Wikipedia integration.
//
// One field of the config_schema:
//   - `language`  the Wikipedia of the texts Gladys does not ask for in a
//                 language (the device, the scene actions): `auto` follows the
//                 language of the last widget request. The widgets always use
//                 the Wikipedia of their own language.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language` language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {{ language: string }} The config.
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return { language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return isLanguage(language) ? language : fallback;
}

export { AUTO_LANGUAGE, INTERNAL_KEYS, normalizeConfig, readLanguage };
