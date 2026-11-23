import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buildArticleWidget,
  buildMostReadWidget,
  buildOnThisDayWidget,
  buildPictureWidget,
  dayPageUrl,
  imageKey,
} from '../src/widgets.js';
import { buildDevice, buildStates } from '../src/device.js';
import { readFeatured, readOnThisDay, KINDS } from '../src/feed.js';
import { LANGUAGES } from '../src/i18n.js';
import { fixture } from './helpers/fake-api.js';

const dayOf = (lang) => ({
  date: '2026-11-23',
  onThisDay: readOnThisDay(fixture(`onthisday-${lang}-11-23.json`)),
  featured: readFeatured(fixture(`featured-${lang}-2026-11-23.json`)),
});
const empty = {
  date: '2026-11-23',
  onThisDay: readOnThisDay({}),
  featured: readFeatured({}),
};

const budget = (content) => {
  const count = (types) => content.components.filter((c) => types.includes(c.type)).length;
  assert.ok(content.components.length <= 8);
  assert.ok(count(['text']) <= 2);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1);
  assert.ok(count(['button']) <= 4);
};

test('every widget, every kind, full or empty, is valid within the budget in every language', () => {
  for (const language of LANGUAGES) {
    for (const day of [dayOf(language === 'fr' ? 'fr' : 'en'), empty]) {
      const contents = [
        ...KINDS.map((kind) => buildOnThisDayWidget({ day, language, kind })),
        buildOnThisDayWidget({ day, language, kind: 'nonsense' }),
        buildPictureWidget({ day, language }),
        buildArticleWidget({ day, language }),
        buildMostReadWidget({ day, language }),
      ];
      for (const content of contents) {
        assert.deepEqual(validateWidgetContent(content), [], language);
        budget(content);
      }
    }
  }
});

test('on this day: the year as title, the text in the detail panel, links to the articles', () => {
  const content = buildOnThisDayWidget({ day: dayOf('fr'), language: 'fr' });
  const [first] = content.components[0].items;
  assert.equal(first.title, '1980');
  assert.match(first.description, /^tremblement de terre/);
  assert.ok(first.links.every((entry) => entry.url.startsWith('https://fr.wikipedia.org/')));
  assert.equal(content.components[1].text, 'Éphéméride · 23 novembre');
  assert.equal(content.components[2].link.url, 'https://fr.wikipedia.org/wiki/23_novembre');
});

test('picture: the image by key, its description, the author and licence credited', () => {
  const content = buildPictureWidget({ day: dayOf('fr'), language: 'de' });
  assert.equal(content.components[0].key, 'potd-2026-11-23');
  assert.equal(content.components[2].text, 'JackyM59 · CC BY-SA 4.0 · Wikimedia Commons');
  assert.match(content.components[3].link.url, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
});

test('article: the featured one in English, the most read one in French, said so', () => {
  const en = buildArticleWidget({ day: dayOf('en'), language: 'en' });
  assert.equal(en.components[0].items[0].title, 'Ice Warrior');
  assert.equal(en.components[2].text, 'From Wikipedia, CC BY-SA 4.0');
  const fr = buildArticleWidget({ day: dayOf('fr'), language: 'fr' });
  assert.equal(fr.components[0].items[0].title, 'Hunger Games (série de films)');
  assert.equal(
    fr.components.find((c) => c.variant === 'caption').text,
    'Le plus lu hier · Source : Wikipédia, CC BY-SA 4.0',
  );
});

test('most read: views in the language, credited', () => {
  const content = buildMostReadWidget({ day: dayOf('en'), language: 'fr' });
  const [first] = content.components[0].items;
  assert.equal(first.title, 'Ramayana: Part 1');
  assert.match(first.badge.text, /^384\s249 vues$/);
});

test('addresses of the day pages and image keys', () => {
  assert.equal(dayPageUrl('en', '2026-11-03'), 'https://en.wikipedia.org/wiki/November_3');
  assert.equal(dayPageUrl('de', '2026-11-23'), 'https://de.wikipedia.org/wiki/23._November');
  assert.equal(dayPageUrl('es', '2026-11-23'), 'https://es.wikipedia.org/wiki/23_de_noviembre');
  assert.equal(imageKey('potd', 'fr', '2026-11-23'), 'potd-2026-11-23');
  assert.equal(imageKey('article', 'fr', '2026-11-23'), 'article-fr-2026-11-23');
});

test('the device: three texts, valid for Gladys, states only for what exists', () => {
  const gladys = createFakeGladys();
  const device = buildDevice(gladys, 'es');
  assert.equal(device.name, 'Wikipedia hoy');
  assert.equal(device.should_poll, false);
  for (const feature of device.features) {
    for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, key);
    }
    assert.equal(feature.category, 'text');
  }
  assert.deepEqual(
    buildStates(gladys, dayOf('en'), 'en').map((state) =>
      state.device_feature_external_id.split(':').pop(),
    ),
    ['event', 'article', 'picture'],
  );
  assert.equal(buildStates(gladys, dayOf('en'), 'en')[1].text, 'Ice Warrior');
  assert.deepEqual(buildStates(gladys, empty, 'en'), []);
});
