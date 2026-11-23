// -----------------------------------------------------------------------------
// Dashboard widgets of the Wikipedia integration, each in the Wikipedia of
// the language of the dashboard.
//
//   - `on_this_day`  what happened on this day: selected anniversaries,
//                    events, births, deaths or holidays (setting `kind`), one
//                    card per entry with its year, the full text and links to
//                    the articles; a link to the page of the day;
//   - `picture`      the picture of the day of Wikimedia Commons, its
//                    description and its author and licence;
//   - `article`      the featured article of the day (English and German
//                    Wikipedia), else the most read article of yesterday;
//   - `most_read`    the articles read most yesterday, with their views.
//
// Wikipedia texts are under CC BY-SA 4.0: every widget credits Wikipedia, and
// the picture its author and licence. Images are served by the integration
// (onWidgetGetImage), never loaded by the browser from a third party.
// Budget of a card: 8 components, 1 main one, 6 tiles, 2 texts, 1 status,
// 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, formatCount } from './i18n.js';
import { KINDS } from './feed.js';
import { articleOfTheDay } from './device.js';
import { formatDayOfYear } from './time.js';

const WIDGETS = {
  ON_THIS_DAY: 'on_this_day',
  PICTURE: 'picture',
  ARTICLE: 'article',
  MOST_READ: 'most_read',
};
const TTL_SECONDS = 1800;
const MAX_ITEMS = 8;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget that only says something.
 * @param {string} text - The message.
 * @param {number} [ttl] - Seconds before Gladys asks again.
 * @returns {object} The content.
 */
function messageContent(text, ttl = 60) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(text, 300) }],
  };
}

const caption = (text) => ({ type: 'text', variant: 'caption', text: clip(text, 80) });
const link = (label, url, icon = 'external-link') => ({
  type: 'button',
  label: clip(label, 24),
  icon,
  style: 'secondary',
  link: { url },
});

/**
 * @description The address of the page of a day on a Wikipedia.
 * @param {string} language - "fr".
 * @param {string} date - "2026-11-23".
 * @returns {string} "https://fr.wikipedia.org/wiki/23_novembre".
 */
function dayPageUrl(language, date) {
  let title;
  if (language === 'en') {
    const month = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );
    title = `${month} ${Number(date.slice(8, 10))}`;
  } else {
    title = formatDayOfYear(date, language);
  }
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/**
 * @description The image key of a thumbnail: it changes with the day, the
 * language and the image, so the cache of the core never serves another one.
 * @param {string} kind - "potd", "article".
 * @param {string} language - The language.
 * @param {string} date - The date.
 * @returns {string} "article-fr-2026-11-23".
 */
const imageKey = (kind, language, date) =>
  kind === 'potd' ? `potd-${date}` : `${kind}-${language}-${date}`;

/**
 * @description The "on this day" widget.
 * @param {object} options - `{ day, language, kind }`.
 * @returns {object} The content.
 */
function buildOnThisDayWidget({ day, language, kind = 'selected' }) {
  const list = day.onThisDay?.[KINDS.includes(kind) ? kind : 'selected'] ?? [];
  const more = link(t('buttonMore', language), dayPageUrl(language, day.date), 'calendar');
  if (list.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        { type: 'text', variant: 'body', text: t('nothing', language) },
        caption(t('attribution', language)),
        more,
      ],
    };
  }
  const items = list.slice(0, MAX_ITEMS).map((entry) => {
    const item = {
      title: clip(entry.year === null ? entry.text : String(entry.year), 60),
      subtitle: clip(entry.year === null ? (entry.pages[0]?.title ?? '') : entry.text, 60),
      description: clip(entry.text, 2000),
    };
    const links = entry.pages
      .filter((page) => page.url)
      .slice(0, 3)
      .map((page) => ({ url: page.url, label: clip(page.title, 24) }));
    if (links.length > 0) {
      item.links = links;
    }
    return item;
  });
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      { type: 'card-list', display: 'list', items },
      caption(
        `${t(`kind_${KINDS.includes(kind) ? kind : 'selected'}`, language)} · ${formatDayOfYear(day.date, language)}`,
      ),
      more,
    ],
  };
}

/**
 * @description The "picture of the day" widget.
 * @param {object} options - `{ day, language }`.
 * @returns {object} The content.
 */
function buildPictureWidget({ day, language }) {
  const picture = day.featured?.picture;
  if (!picture) {
    return messageContent(t('noPicture', language), 600);
  }
  const components = [
    {
      type: 'image',
      key: imageKey('potd', language, day.date),
      alt: clip(picture.description || picture.file, 100),
      fit: 'cover',
    },
  ];
  if (picture.description) {
    components.push({ type: 'text', variant: 'body', text: clip(picture.description, 300) });
  }
  components.push(
    caption(
      t('pictureCredit', language, {
        artist: clip(picture.artist || picture.credit || '?', 30),
        license: picture.license || '?',
      }),
    ),
  );
  if (picture.url) {
    components.push(link(t('buttonCommons', language), picture.url, 'image'));
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The "article of the day" widget.
 * @param {object} options - `{ day, language }`.
 * @returns {object} The content.
 */
function buildArticleWidget({ day, language }) {
  const chosen = articleOfTheDay(day.featured);
  if (!chosen) {
    return messageContent(t('nothing', language), 600);
  }
  const { page, mostRead } = chosen;
  // One card with the thumbnail and the links (the detail panel holds the
  // whole extract), the start of the extract, the credit.
  const item = {
    title: clip(page.title, 60),
    subtitle: clip(page.description || (mostRead ? t('mostReadYesterday', language) : ''), 60),
  };
  if (page.thumbnail) {
    item.image = imageKey('article', language, day.date);
  }
  if (page.extract) {
    item.description = clip(page.extract, 2000);
  }
  if (page.url) {
    item.links = [{ url: page.url, label: t('buttonRead', language) }];
  }
  const components = [{ type: 'card-list', display: 'list', items: [item] }];
  if (page.extract) {
    components.push({ type: 'text', variant: 'body', text: clip(page.extract, 300) });
  }
  components.push(
    caption(
      mostRead
        ? `${t('mostReadYesterday', language)} · ${t('attribution', language)}`
        : t('attribution', language),
    ),
  );
  if (page.url) {
    components.push(link(t('buttonRead', language), page.url, 'book-open'));
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The "most read" widget.
 * @param {object} options - `{ day, language }`.
 * @returns {object} The content.
 */
function buildMostReadWidget({ day, language }) {
  const articles = day.featured?.mostRead ?? [];
  if (articles.length === 0) {
    return messageContent(t('nothing', language), 600);
  }
  const items = articles.slice(0, MAX_ITEMS).map((page) => {
    const item = {
      title: clip(page.title, 60),
      subtitle: clip(page.description, 60),
    };
    if (page.views) {
      item.badge = {
        text: clip(t('views', language, { views: formatCount(page.views, language) }), 16),
        color: WIDGET_COLORS.INFO,
      };
    }
    if (page.extract) {
      item.description = clip(page.extract, 2000);
    }
    if (page.url) {
      item.links = [{ url: page.url, label: t('buttonRead', language) }];
    }
    return item;
  });
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      { type: 'card-list', display: 'list', items },
      caption(`${t('mostReadYesterday', language)} · ${t('attribution', language)}`),
    ],
  };
}

export {
  WIDGETS,
  TTL_SECONDS,
  imageKey,
  dayPageUrl,
  messageContent,
  buildOnThisDayWidget,
  buildPictureWidget,
  buildArticleWidget,
  buildMostReadWidget,
};
