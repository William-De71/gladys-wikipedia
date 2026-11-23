// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The four widgets on Monday 23 November 2026: the real answers of the feeds
// kept in test/fixtures (French and English Wikipedia, CC BY-SA 4.0, Wikipedia
// contributors; German and Spanish show the English ones) go through the real
// parsers (src/feed.js) and widget builders (src/widgets.js). The picture of
// the day is the real one (potd.jpg: "Pointe Saint Mathieu - Phare.jpg",
// JackyM59, CC BY-SA 4.0, Wikimedia Commons, 500 px); the thumbnail of the
// article is a drawn gradient (article.jpg), the real ones being often
// non-free.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const {
  buildOnThisDayWidget,
  buildPictureWidget,
  buildArticleWidget,
  buildMostReadWidget,
  imageKey,
} = await load('src/widgets.js');
const { readOnThisDay, readFeatured } = await load('src/feed.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));
const fixture = (name) => JSON.parse(readFileSync(`${repo}/test/fixtures/${name}`, 'utf8'));
const dataUri = (file) =>
  `data:image/jpeg;base64,${readFileSync(`${repo}/docs/illustrations/${file}`).toString('base64')}`;

// Monday 23 November 2026, 09:00 in Paris.
const NOW = Date.parse('2026-11-23T08:00:00Z');
const DATE = '2026-11-23';

const contents = {};
const images = { [imageKey('potd', 'en', DATE)]: dataUri('potd.jpg') };
for (const language of LANGUAGES) {
  const source = language === 'fr' ? 'fr' : 'en';
  const day = {
    date: DATE,
    onThisDay: readOnThisDay(fixture(`onthisday-${source}-11-23.json`)),
    featured: readFeatured(fixture(`featured-${source}-2026-11-23.json`)),
  };
  images[imageKey('article', language, DATE)] = dataUri('article.jpg');
  contents[language] = {
    on_this_day: buildOnThisDayWidget({ day, language }),
    picture: buildPictureWidget({ day, language }),
    article: buildArticleWidget({ day, language }),
    most_read: buildMostReadWidget({ day, language }),
  };
}

const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents, images }));
