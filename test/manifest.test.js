// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { KINDS } from '../src/feed.js';
import { AUTO_LANGUAGE, INTERNAL_KEYS } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Wikipedia');
  assert.equal(manifest.version, pkg.version);
  assert.match(pkg.version, /^0\./);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-wikipedia:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-wikipedia/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-wikipedia');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the cloud transport only: wikipedia.org and Wikimedia images, one module', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.match(
    source('../src/wiki-api.js'),
    /https:\/\/\$\{language\}\.wikipedia\.org\/api\/rest_v1/,
  );
  for (const file of ['app', 'device', 'widgets', 'feed', 'config']) {
    assert.doesNotMatch(source(`../src/${file}.js`), /fetch\(|node:https?|node:net/, file);
  }
});

test('requires Gladys 5.3.0, asks for no permission, no key', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  assert.ok(!manifest.config_schema.some((field) => field.type === 'secret'));
  assert.deepEqual(manifest.categories, ['leisure', 'services']);
  assert.equal(manifest.countries, undefined);
});

test('declares exactly the actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_actions.map((x) => x.key),
    Object.values(SCENE_ACTIONS),
  );
  assert.deepEqual(
    manifest.widgets.map((x) => x.key),
    Object.values(WIDGETS),
  );
  assert.deepEqual(
    manifest.actions.map((x) => x.key),
    Object.values(ACTIONS),
  );
  assert.equal(manifest.scene_triggers, undefined, 'nothing happens that a schedule cannot catch');
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  assert.match(app, /onWidgetGetImage\(/);
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  for (const action of manifest.scene_actions) {
    for (const { key } of action.outputs) {
      assert.match(app, new RegExp(`\\b${key}:`), `${action.key}.${key}`);
    }
  }
  const kindOptions = (list) => values(byKey(list).get('kind'));
  assert.deepEqual(kindOptions(byKey(manifest.widgets).get('on_this_day').settings), KINDS);
  assert.deepEqual(kindOptions(byKey(manifest.scene_actions).get('on_this_day').fields), KINDS);
});

test('the configuration: the language only', () => {
  const config = byKey(manifest.config_schema);
  assert.deepEqual(values(config.get('language')), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(config.get(INTERNAL_KEYS.language), undefined);
});

test('limits of the store: counts, timeouts, sizes', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024);
  assert.equal(cover.readUInt16BE(0), 0xffd8);
});

test('catalog of Gladys 5.3.0: search keywords within the store bounds', () => {
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(normalized.length >= 1 && normalized.length <= 10);
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  assert.equal(new Set(normalized).size, normalized.length);
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'never the name itself');
});
