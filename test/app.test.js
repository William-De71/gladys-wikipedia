// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`) and a fake Wikipedia serving
// real answers of the feeds (test/helpers/fake-api.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { fakeWikipedia, rootOf, silent, NOW, TZ, THUMBNAIL } from './helpers/fake-api.js';

const DEVICE = 'ext:test-integration:device:today';

async function startApp({ config = { language: 'fr' }, api = fakeWikipedia(), now = NOW } = {}) {
  const clock = { now };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetchImpl: api,
    rootOf,
    now: () => clock.now,
    sleep: async () => {},
    timeZone: TZ,
    timer: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, clock };
}

test('reads the Wikipedia of the configuration once, offers one device, names the client', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(api.calls.map((call) => `${call.host}${call.path}`).sort(), [
    'fr.wikipedia.test/api/rest_v1/feed/featured/2026/11/23',
    'fr.wikipedia.test/api/rest_v1/feed/onthisday/all/11/23',
  ]);
  assert.match(
    api.calls[0].headers['User-Agent'],
    /^gladys-wikipedia\/0\.1\.0 \(\+https:\/\/github\.com\/William-De71\/gladys-wikipedia\)$/,
  );
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [[DEVICE, 'Wikipédia du jour']],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.connectionStatus.message.fr, 'Wikipédia (fr) lue pour le 23 novembre.');
});

test('the device gets the anniversary, the article (most read in French) and the picture', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const device = gladys.fake.discoveredDevices[0];
  await gladys.fake.deviceCreated(device);
  assert.match(
    gladys.fake.lastState(`${DEVICE}:event`),
    /^1980 : tremblement de terre dans l’Irpinia, en Italie\.$|^1980 : tremblement de terre dans l'Irpinia, en Italie\.$/,
  );
  assert.equal(gladys.fake.lastState(`${DEVICE}:article`), 'Hunger Games (série de films)');
  assert.match(gladys.fake.lastState(`${DEVICE}:picture`), /^Le sémaphore, l'abbaye Saint-Mathieu/);
});

test('the widgets follow the language of the dashboard, valid in every language', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of Object.values(WIDGETS)) {
      const ack = await gladys.fake.widgetGet(key, { language });
      assert.equal(ack.success, true, `${key} ${language}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  // One reading per language and day, whatever the number of widgets.
  const onThisDay = api.calls.filter((call) => call.path.includes('/onthisday/'));
  assert.deepEqual(onThisDay.map((call) => call.host.split('.')[0]).sort(), [
    'de',
    'en',
    'es',
    'fr',
  ]);
  const article = (await gladys.fake.widgetGet(WIDGETS.ARTICLE, { language: 'en' })).data.content;
  assert.equal(article.components[0].items[0].title, 'Ice Warrior');
  assert.equal(article.components[0].items[0].image, 'article-en-2026-11-23');
  const births = (
    await gladys.fake.widgetGet(WIDGETS.ON_THIS_DAY, {
      language: 'fr',
      settings: { kind: 'births' },
    })
  ).data.content;
  assert.match(births.components[1].text, /^Naissances · 23 novembre$/);
});

test('the images of the widgets are served by the integration, a smaller one when too large', async (t) => {
  const api = fakeWikipedia();
  const { gladys } = await startApp({ api });
  t.after(() => gladys.fake.shutdown());
  const picture = (await gladys.fake.widgetGet(WIDGETS.PICTURE, { language: 'fr' })).data.content;
  const key = picture.components[0].key;
  assert.equal(key, 'potd-2026-11-23');
  api.bigImage = true;
  const ack = await gladys.fake.widgetGetImage(key);
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.equal(ack.data.image ?? ack.data, THUMBNAIL.toString('base64'));
  const images = api.calls
    .filter((call) => call.host.endsWith('wikimedia.org'))
    .map((call) => call.path);
  assert.match(images[0], /\/960px-/);
  assert.match(images[1], /\/500px-/);
  assert.deepEqual(validateWidgetImage(THUMBNAIL.toString('base64')), []);
  const unknown = await gladys.fake.widgetGetImage('potd-1999-01-01');
  assert.equal(unknown.success, false);
});

test('the scene actions give texts ready to send or to speak', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const day = await gladys.fake.sceneAction(SCENE_ACTIONS.ON_THIS_DAY, {
    kind: 'selected',
    count: 2,
  });
  assert.equal(day.success, true, JSON.stringify(day));
  assert.equal(day.data.outputs.count, 2);
  assert.equal(day.data.outputs.first_year, 1980);
  assert.match(day.data.outputs.summary, /^Un 23 novembre : en 1980, tremblement de terre/);
  assert.equal(day.data.outputs.page_url, 'https://fr.wikipedia.org/wiki/23_novembre');
  const picture = await gladys.fake.sceneAction(SCENE_ACTIONS.PICTURE, {});
  assert.equal(picture.data.outputs.artist, 'JackyM59');
  assert.equal(picture.data.outputs.license, 'CC BY-SA 4.0');
  assert.doesNotMatch(picture.data.outputs.image_url, /\?/);
  const article = await gladys.fake.sceneAction(SCENE_ACTIONS.ARTICLE, {});
  assert.equal(article.data.outputs.most_read, true, 'no featured article on the French Wikipedia');
  assert.match(article.data.outputs.url, /^https:\/\/fr\.wikipedia\.org\/wiki\//);
});

test('a new day is read again; the featured feed of the day not out yet gives the day before', async (t) => {
  const api = fakeWikipedia();
  const { gladys, app, clock } = await startApp({ api });
  t.after(() => gladys.fake.shutdown());
  // 00:30 in Paris on the 24th is still the 23rd in UTC.
  clock.now = Date.parse('2026-11-23T23:30:00Z');
  api.answers.missingFeatured.add('2026-11-24');
  assert.equal(await app.refresh(), true);
  const paths = api.calls.map((call) => call.path);
  assert.ok(paths.includes('/api/rest_v1/feed/onthisday/all/11/24'));
  assert.ok(paths.includes('/api/rest_v1/feed/featured/2026/11/24'));
  assert.ok(
    paths.at(-1).endsWith('/feed/featured/2026/11/23') ||
      paths.includes('/api/rest_v1/feed/featured/2026/11/23'),
  );
  assert.equal(app.days.get('fr').date, '2026-11-24');
  assert.equal(app.days.get('fr').partial, true);
  // 30 minutes later the feed of the 24th is out: read again, complete.
  api.answers.missingFeatured.delete('2026-11-24');
  clock.now += 31 * 60 * 1000;
  assert.equal(await app.refresh(), true);
  assert.equal(app.days.get('fr').partial, false);
  const calls = api.calls.length;
  clock.now += 31 * 60 * 1000;
  assert.equal(await app.refresh(), true);
  assert.equal(api.calls.length, calls, 'nothing read twice the same day');
});

test('the check button reads now; an unreachable Wikipedia shows on the status', async (t) => {
  const api = fakeWikipedia();
  const { gladys } = await startApp({ api });
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.action(ACTIONS.CHECK, {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.en, /^Wikipedia \(fr\) read for 23 November\.\nOn this day: 1980 /);
  api.offline = true;
  const failed = await gladys.fake.action(ACTIONS.CHECK, {});
  assert.match(failed.data.message.fr, /Impossible de joindre wikipedia\.org/);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  // A widget still shows the last good reading of its language.
  const widget = await gladys.fake.widgetGet(WIDGETS.MOST_READ, { language: 'en' });
  assert.match(widget.data.content.components[0].text, /Cannot reach wikipedia\.org/);
});
