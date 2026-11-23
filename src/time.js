// -----------------------------------------------------------------------------
// The day of the instance: the feeds are read for the date of Gladys (TZ,
// given by the supervisor), not for the date of UTC. Intl only.
// -----------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * @description The timezone of the instance.
 * @returns {string|undefined} An IANA name, undefined for the system one.
 */
function defaultTimeZone() {
  return process.env.TZ || undefined;
}

/**
 * @description The local date of an instant in a timezone.
 * @param {number} instant - The instant (ms).
 * @param {string} [zone] - An IANA name.
 * @returns {string} "YYYY-MM-DD".
 */
function localDate(instant, zone = defaultTimeZone()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/**
 * @description The month and day of a date.
 * @param {string} date - "2026-11-23".
 * @returns {{ month: number, day: number }} `{ month: 11, day: 23 }`.
 */
function monthDay(date) {
  const [, month, day] = date.split('-').map(Number);
  return { month, day };
}

/**
 * @description "23 November" / "23 novembre" / "23. November" / "23 de noviembre".
 * @param {string} date - "2026-11-23".
 * @param {string} language - The language.
 * @returns {string} The day of the year.
 */
function formatDayOfYear(date, language) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
}

export { MINUTE_MS, HOUR_MS, defaultTimeZone, localDate, monthDay, formatDayOfYear };
