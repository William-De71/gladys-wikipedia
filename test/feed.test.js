import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryText, plain, readFeatured, readOnThisDay, readPage } from '../src/feed.js';
import { normalizeConfig, readLanguage } from '../src/config.js';
import { fixture } from './helpers/fake-api.js';

test('on this day: five lists, years, plain texts, at most three pages per entry', () => {
  const day = readOnThisDay(fixture('onthisday-fr-11-23.json'));
  assert.deepEqual(Object.keys(day), ['selected', 'events', 'births', 'deaths', 'holidays']);
  const [first] = day.selected;
  assert.equal(first.year, 1980);
  assert.match(first.text, /^tremblement de terre dans l.Irpinia, en Italie\.$/);
  assert.ok(first.pages.length >= 1 && first.pages.length <= 3);
  assert.match(first.pages[0].url, /^https:\/\/fr\.wikipedia\.org\/wiki\//);
  assert.equal(day.holidays[0].year, null);
  const years = day.births.map((entry) => entry.year);
  assert.deepEqual(
    years,
    [...years].sort((a, b) => b - a),
    'the most recent first',
  );
  assert.equal(entryText(first, ' : ').slice(0, 7), '1980 : ');
});

test('no selected anniversary: the events take their place', () => {
  const raw = fixture('onthisday-en-11-23.json');
  const day = readOnThisDay({ ...raw, selected: [] });
  assert.deepEqual(day.selected, day.events.slice(0, 10));
  assert.deepEqual(readOnThisDay(null).selected, []);
});

test('featured: the article only where it exists, the picture with its credit, most read', () => {
  const en = readFeatured(fixture('featured-en-2026-11-23.json'));
  assert.equal(en.article.title, 'Ice Warrior');
  assert.match(en.article.extract, /^The Ice Warriors are/);
  const fr = readFeatured(fixture('featured-fr-2026-11-23.json'));
  assert.equal(fr.article, null);
  assert.deepEqual(
    {
      file: fr.picture.file,
      artist: fr.picture.artist,
      license: fr.picture.license,
      url: fr.picture.url,
    },
    {
      file: 'Pointe Saint Mathieu - Phare.jpg',
      artist: 'JackyM59',
      license: 'CC BY-SA 4.0',
      url: 'https://commons.wikimedia.org/wiki/File:Pointe_Saint_Mathieu_-_Phare.jpg',
    },
  );
  assert.equal(fr.mostRead[0].title, 'Hunger Games (série de films)');
  assert.ok(fr.mostRead[0].views > 1000);
  assert.deepEqual(readFeatured({}), { article: null, picture: null, mostRead: [] });
});

test('plain texts and pages without a title', () => {
  assert.equal(
    plain('<b>Christian</b> feast&nbsp;day:\nAlexander'),
    'Christian feast day: — Alexander',
  );
  assert.equal(plain('a­b &amp; c'), 'ab & c');
  assert.equal(readPage({}), null);
  assert.equal(readPage({ title: 'X', content_urls: { desktop: { page: 'http://x' } } }).url, null);
});

test('the configuration: the language, automatic by default', () => {
  assert.deepEqual(normalizeConfig(), { language: 'auto' });
  assert.deepEqual(normalizeConfig({ language: 'de' }), { language: 'de' });
  assert.deepEqual(normalizeConfig({ language: 'it' }), { language: 'auto' });
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'it' }, 'en'), 'en');
});
