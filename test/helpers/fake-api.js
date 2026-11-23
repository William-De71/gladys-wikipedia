// A fake Wikipedia for the tests, served through the `fetchImpl` option of the
// integration. Its answers are real ones, captured on 2026-11-23 from the
// feeds of the French and English Wikipedia and cut down to a few entries
// (test/fixtures, CC BY-SA 4.0, Wikipedia contributors); German and Spanish
// get the English answers. The thumbnail is a 64 × 36 gradient made for the
// tests. Tests never touch the network.

import { readFileSync } from 'node:fs';

// Monday 23 November 2026, 09:00 in Paris.
const NOW = Date.parse('2026-11-23T08:00:00Z');
const TZ = 'Europe/Paris';
const silent = { info() {}, warn() {}, error() {}, debug() {} };

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const THUMBNAIL = readFileSync(new URL('../fixtures/thumbnail.jpg', import.meta.url));

/** The API root of a language, as the fake serves it. */
const rootOf = (language) => `https://${language}.wikipedia.test/api/rest_v1`;

/**
 * @description The fake API.
 * @returns {Function & { calls: object[], answers: object, offline: boolean, bigImage: boolean }} A `fetch`.
 */
function fakeWikipedia() {
  const answers = {
    onthisday: { fr: fixture('onthisday-fr-11-23.json'), en: fixture('onthisday-en-11-23.json') },
    featured: {
      fr: fixture('featured-fr-2026-11-23.json'),
      en: fixture('featured-en-2026-11-23.json'),
    },
    missingFeatured: new Set(),
  };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const target = new URL(url);
    calls.push({ host: target.hostname, path: target.pathname, headers: init.headers ?? {} });
    if (fetch.offline) {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    }
    const json = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (target.hostname.endsWith('wikimedia.org')) {
      const big = fetch.bigImage && /\/960px-/.test(target.pathname);
      return new Response(big ? Buffer.alloc(400 * 1024) : THUMBNAIL, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }
    const language = target.hostname.split('.')[0];
    const source = ['fr', 'en'].includes(language) ? language : 'en';
    if (fetch.failNext) {
      const status = fetch.failNext;
      fetch.failNext = null;
      return json(status, { type: 'error', title: 'Error' });
    }
    if (/\/feed\/onthisday\/all\/\d{2}\/\d{2}$/.test(target.pathname)) {
      return json(200, answers.onthisday[source]);
    }
    const featured = /\/feed\/featured\/(\d{4})\/(\d{2})\/(\d{2})$/.exec(target.pathname);
    if (featured) {
      const date = `${featured[1]}-${featured[2]}-${featured[3]}`;
      if (answers.missingFeatured.has(date)) {
        return json(404, { type: 'not_found', title: 'Not found.' });
      }
      return json(200, answers.featured[source]);
    }
    return json(404, { type: 'not_found' });
  };
  fetch.calls = calls;
  fetch.answers = answers;
  fetch.offline = false;
  fetch.bigImage = false;
  fetch.failNext = null;
  return fetch;
}

export { NOW, TZ, silent, rootOf, fixture, fakeWikipedia, THUMBNAIL };
