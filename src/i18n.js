// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, statuses, scene texts.
// The content itself (events, articles, descriptions) comes from the
// Wikipedia of the language and is never translated here. German says "du",
// Spanish "usted", like Gladys.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // device
  deviceName: {
    en: 'Wikipedia today',
    fr: 'Wikipédia du jour',
    de: 'Wikipedia heute',
    es: 'Wikipedia hoy',
  },
  featureEvent: {
    en: 'On this day',
    fr: 'Éphéméride',
    de: 'An diesem Tag',
    es: 'Efeméride',
  },
  featureArticle: {
    en: 'Article of the day',
    fr: 'Article du jour',
    de: 'Artikel des Tages',
    es: 'Artículo del día',
  },
  featurePicture: {
    en: 'Picture of the day',
    fr: 'Image du jour',
    de: 'Bild des Tages',
    es: 'Imagen del día',
  },

  // kinds of "on this day"
  kind_selected: {
    en: 'Selected anniversaries',
    fr: 'Éphéméride',
    de: 'Jahrestage',
    es: 'Efemérides',
  },
  kind_events: { en: 'Events', fr: 'Événements', de: 'Ereignisse', es: 'Acontecimientos' },
  kind_births: { en: 'Births', fr: 'Naissances', de: 'Geboren', es: 'Nacimientos' },
  kind_deaths: { en: 'Deaths', fr: 'Décès', de: 'Gestorben', es: 'Fallecimientos' },
  kind_holidays: {
    en: 'Holidays and observances',
    fr: 'Fêtes et célébrations',
    de: 'Feier- und Gedenktage',
    es: 'Celebraciones',
  },

  // scene texts
  yearSeparator: { en: ': ', fr: ' : ', de: ': ', es: ': ' },
  onThisDayIntro: {
    en: 'On {date}: {entries}',
    fr: 'Un {date} : {entries}',
    de: 'Am {date}: {entries}',
    es: 'Un {date}: {entries}',
  },
  holidaysIntro: {
    en: 'Today, {date}: {entries}',
    fr: 'Aujourd’hui, {date} : {entries}',
    de: 'Heute, am {date}: {entries}',
    es: 'Hoy, {date}: {entries}',
  },
  inYear: {
    en: 'in {year}, {text}',
    fr: 'en {year}, {text}',
    de: '{year}: {text}',
    es: 'en {year}, {text}',
  },
  noArticle: {
    en: 'This Wikipedia has no featured article of the day: the most read article of yesterday is given instead.',
    fr: 'Cette Wikipédia n’a pas d’article du jour : l’article le plus lu d’hier est donné à la place.',
    de: 'Diese Wikipedia hat keinen Artikel des Tages: Stattdessen kommt der meistgelesene Artikel von gestern.',
    es: 'Esta Wikipedia no tiene artículo del día: se da en su lugar el artículo más leído de ayer.',
  },

  // statuses
  statusConnected: {
    en: 'Wikipedia ({languages}) read for {date}.',
    fr: 'Wikipédia ({languages}) lue pour le {date}.',
    de: 'Wikipedia ({languages}) für den {date} gelesen.',
    es: 'Wikipedia ({languages}) leída para el {date}.',
  },
  statusRateLimited: {
    en: 'Wikipedia asks to slow down: the next reading will try again.',
    fr: 'Wikipédia demande de ralentir : la prochaine lecture réessaiera.',
    de: 'Wikipedia bittet, langsamer zu werden: Die nächste Abfrage versucht es erneut.',
    es: 'Wikipedia pide ir más despacio: la próxima lectura lo volverá a intentar.',
  },
  statusUnreachable: {
    en: 'Cannot reach wikipedia.org: check the internet access of Gladys.',
    fr: 'Impossible de joindre wikipedia.org : vérifiez l’accès Internet de Gladys.',
    de: 'wikipedia.org ist nicht erreichbar: Prüfe den Internetzugang von Gladys.',
    es: 'No se puede acceder a wikipedia.org: compruebe el acceso a Internet de Gladys.',
  },
  statusApiError: {
    en: 'Wikipedia error: {detail}',
    fr: 'Erreur de Wikipédia : {detail}',
    de: 'Wikipedia-Fehler: {detail}',
    es: 'Error de Wikipedia: {detail}',
  },
  notReadYet: {
    en: 'Wikipedia has not been read yet: try again in a moment.',
    fr: 'Wikipédia n’a pas encore été lue : réessayez dans un instant.',
    de: 'Wikipedia wurde noch nicht gelesen: Versuche es gleich noch einmal.',
    es: 'Wikipedia aún no se ha leído: inténtelo de nuevo en un momento.',
  },

  // widgets
  attribution: {
    en: 'From Wikipedia, CC BY-SA 4.0',
    fr: 'Source : Wikipédia, CC BY-SA 4.0',
    de: 'Aus Wikipedia, CC BY-SA 4.0',
    es: 'De Wikipedia, CC BY-SA 4.0',
  },
  pictureCredit: {
    en: '{artist} · {license} · Wikimedia Commons',
    fr: '{artist} · {license} · Wikimedia Commons',
    de: '{artist} · {license} · Wikimedia Commons',
    es: '{artist} · {license} · Wikimedia Commons',
  },
  buttonRead: {
    en: 'Read on Wikipedia',
    fr: 'Lire sur Wikipédia',
    de: 'Auf Wikipedia lesen',
    es: 'Leer en Wikipedia',
  },
  buttonCommons: {
    en: 'See on Commons',
    fr: 'Voir sur Commons',
    de: 'Auf Commons ansehen',
    es: 'Ver en Commons',
  },
  buttonMore: {
    en: 'More of this day',
    fr: 'Tout ce jour-là',
    de: 'Mehr zu diesem Tag',
    es: 'Más de este día',
  },
  mostReadYesterday: {
    en: 'Most read yesterday',
    fr: 'Le plus lu hier',
    de: 'Gestern am meisten gelesen',
    es: 'Lo más leído ayer',
  },
  views: { en: '{views} views', fr: '{views} vues', de: '{views} Aufrufe', es: '{views} visitas' },
  nothing: {
    en: 'Nothing for this day on this Wikipedia.',
    fr: 'Rien pour ce jour sur cette Wikipédia.',
    de: 'Nichts für diesen Tag in dieser Wikipedia.',
    es: 'Nada para este día en esta Wikipedia.',
  },
  noPicture: {
    en: 'No picture of the day yet.',
    fr: 'Pas encore d’image du jour.',
    de: 'Noch kein Bild des Tages.',
    es: 'Todavía no hay imagen del día.',
  },
};

/**
 * @description Whether a value is a language of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The values of the `{placeholders}`.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - A TEXTS key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description A count in the format of a language, short: "384 249", "1.2 M".
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function formatCount(value, language) {
  const locale = isLanguage(language) ? language : 'en';
  if (value >= 1_000_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1e6)} M`;
  }
  return new Intl.NumberFormat(locale).format(value);
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatCount };
