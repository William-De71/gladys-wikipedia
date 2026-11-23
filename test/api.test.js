import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWikiClient,
  ERROR_KINDS,
  kindOf,
  MAX_IMAGE_BYTES,
  smallerThumbnail,
  wikipediaRoot,
} from '../src/wiki-api.js';
import { fakeWikipedia, rootOf, THUMBNAIL } from './helpers/fake-api.js';

const client = (api) =>
  createWikiClient({
    userAgent: 'test/1 (+https://e.x)',
    rootOf,
    fetchImpl: api,
    sleep: async () => {},
  });

test('the feeds of a language, with the User-Agent of the integration', async () => {
  const api = fakeWikipedia();
  const wiki = client(api);
  assert.ok((await wiki.onThisDay('fr', 11, 3)).selected.length > 0);
  assert.ok((await wiki.featured('en', '2026-11-23')).tfa);
  assert.deepEqual(
    api.calls.map((call) => `${call.host}${call.path}`),
    [
      'fr.wikipedia.test/api/rest_v1/feed/onthisday/all/11/03',
      'en.wikipedia.test/api/rest_v1/feed/featured/2026/11/23',
    ],
  );
  assert.equal(api.calls[0].headers['User-Agent'], 'test/1 (+https://e.x)');
  assert.equal(api.calls[0].headers['Api-User-Agent'], 'test/1 (+https://e.x)');
  assert.equal(wikipediaRoot('de'), 'https://de.wikipedia.org/api/rest_v1');
});

test('errors: a 5xx is tried once more, a 429 is named, the network is named', async () => {
  const api = fakeWikipedia();
  api.failNext = 503;
  assert.ok(await client(api).onThisDay('fr', 11, 23));
  assert.equal(api.calls.length, 2);
  api.failNext = 429;
  await assert.rejects(client(api).featured('fr', '2026-11-23'), { kind: ERROR_KINDS.RATE_LIMIT });
  api.offline = true;
  await assert.rejects(client(api).onThisDay('fr', 11, 23), { kind: ERROR_KINDS.UNREACHABLE });
  assert.equal(kindOf(404), 'request');
  assert.equal(kindOf(502), 'server');
});

test('images: Wikimedia hosts only, without the tracking query, 300 KB at most', async () => {
  const api = fakeWikipedia();
  const wiki = client(api);
  const base64 = await wiki.image(
    'https://upload.wikimedia.org/wikipedia/en/5/5d/Ice_Warriors.jpg?utm_source=en.wikipedia.org',
  );
  assert.equal(base64, THUMBNAIL.toString('base64'));
  assert.equal(api.calls[0].path, '/wikipedia/en/5/5d/Ice_Warriors.jpg');
  await assert.rejects(wiki.image('https://example.com/x.jpg'), { kind: ERROR_KINDS.IMAGE });
  await assert.rejects(wiki.image('http://upload.wikimedia.org/x.jpg'), {
    kind: ERROR_KINDS.IMAGE,
  });
  await assert.rejects(wiki.image('not a url'), { kind: ERROR_KINDS.IMAGE });
  api.bigImage = true;
  await assert.rejects(
    wiki.image('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/960px-X.jpg'),
    { kind: ERROR_KINDS.IMAGE, message: `Image too large: ${400 * 1024} bytes` },
  );
  assert.ok(400 * 1024 > MAX_IMAGE_BYTES);
  assert.equal(
    smallerThumbnail('https://thumb.wikimedia.org/a/960px-X.jpg?x=1'),
    'https://thumb.wikimedia.org/a/500px-X.jpg?x=1',
  );
  assert.equal(smallerThumbnail('https://upload.wikimedia.org/a/X.jpg'), null);
});
