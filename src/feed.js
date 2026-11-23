// -----------------------------------------------------------------------------
// The feeds of Wikipedia, read into what the integration shows.
//
// On this day (`/feed/onthisday/all`): five lists of entries
// `{ text, year?, pages: [summary…] }` — `selected` (the anniversaries the
// editors of that Wikipedia chose for its main page), `events`, `births`,
// `deaths` and `holidays` (no year). Some days a Wikipedia selects nothing:
// `selected` then falls back to `events`.
//
// Featured (`/feed/featured`): `tfa` (today's featured article: English and
// German Wikipedia only), `image` (the picture of the day of Wikimedia
// Commons, the same file in every language with a translated description),
// `mostread` (the articles read most the day before, with their views).
//
// Only what is shown is kept: a page is its title, short description,
// extract, address and thumbnail. Texts are plain: the feeds give the HTML
// apart.
// -----------------------------------------------------------------------------

export const KINDS = ['selected', 'events', 'births', 'deaths', 'holidays'];
const MAX_ENTRIES = 30;
const MAX_PAGES = 3;

/**
 * @description A plain text: no tags, single spaces.
 * @param {unknown} value - A text, maybe with HTML or line breaks.
 * @returns {string} The text.
 */
export function plain(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|­/g, (match) => (match === '&nbsp;' ? ' ' : ''))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, '’')
    .replace(/\s*\n+\s*/g, ' — ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @description A thumbnail of a summary, when it has one.
 * @param {object} thumbnail - `{ source, width, height }`.
 * @returns {object|null} The thumbnail.
 */
function thumbnailOf(thumbnail) {
  return typeof thumbnail?.source === 'string' && /^https:\/\//.test(thumbnail.source)
    ? { source: thumbnail.source, width: thumbnail.width ?? null, height: thumbnail.height ?? null }
    : null;
}

/**
 * @description The part of a page summary kept.
 * @param {object} page - A summary of the REST API.
 * @returns {object|null} `{ title, description, extract, url, thumbnail }`.
 */
export function readPage(page) {
  const title = plain(page?.titles?.normalized ?? page?.normalizedtitle ?? page?.title ?? '');
  if (!title) {
    return null;
  }
  const url = page?.content_urls?.desktop?.page;
  return {
    title,
    description: plain(page.description),
    extract: plain(page.extract),
    url: typeof url === 'string' && url.startsWith('https://') ? url : null,
    thumbnail: thumbnailOf(page.thumbnail),
  };
}

/**
 * @description One entry of an "on this day" list.
 * @param {object} entry - `{ text, year?, pages }`.
 * @returns {object|null} `{ year, text, pages }`.
 */
function readEntry(entry) {
  const text = plain(entry?.text);
  if (!text) {
    return null;
  }
  const year = Number.isInteger(entry.year) ? entry.year : null;
  return {
    year,
    text,
    pages: (Array.isArray(entry.pages) ? entry.pages : [])
      .map(readPage)
      .filter(Boolean)
      .slice(0, MAX_PAGES),
  };
}

/**
 * @description The "on this day" feed.
 * @param {object} raw - The answer of /feed/onthisday/all.
 * @returns {object} The five lists; `selected` falls back to `events`.
 */
export function readOnThisDay(raw) {
  const lists = Object.fromEntries(
    KINDS.map((kind) => [
      kind,
      (Array.isArray(raw?.[kind]) ? raw[kind] : [])
        .map(readEntry)
        .filter(Boolean)
        .slice(0, MAX_ENTRIES),
    ]),
  );
  // Births and deaths: the most recent first, as the main pages list them.
  for (const kind of ['births', 'deaths', 'events']) {
    lists[kind].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }
  if (lists.selected.length === 0) {
    lists.selected = lists.events.slice(0, 10);
  }
  return lists;
}

/**
 * @description The featured feed.
 * @param {object} raw - The answer of /feed/featured.
 * @returns {object} `{ article, picture, mostRead }`.
 */
export function readFeatured(raw) {
  const image = raw?.image;
  const picture =
    image && thumbnailOf(image.thumbnail)
      ? {
          file: plain(image.title).replace(/^File:/, ''),
          description: plain(image.description?.text ?? image.description?.html),
          artist: plain(image.artist?.text ?? image.artist?.name),
          credit: plain(image.credit?.text),
          license: plain(image.license?.type),
          licenseUrl:
            typeof image.license?.url === 'string' && image.license.url.startsWith('https://')
              ? image.license.url
              : null,
          url:
            typeof image.file_page === 'string' && image.file_page.startsWith('https://')
              ? image.file_page
              : null,
          thumbnail: thumbnailOf(image.thumbnail),
        }
      : null;
  return {
    article: raw?.tfa ? readPage(raw.tfa) : null,
    picture,
    mostRead: (Array.isArray(raw?.mostread?.articles) ? raw.mostread.articles : [])
      .map((article) => {
        const page = readPage(article);
        return page ? { ...page, views: Number(article.views) || null } : null;
      })
      .filter(Boolean)
      // Special pages and the main page are not articles.
      .filter((page) => !/:/.test(page.title) || page.description)
      .slice(0, 10),
  };
}

/**
 * @description An entry as one sentence: "1980: an earthquake…".
 * @param {object} entry - `{ year, text }`.
 * @param {string} separator - ": " or " : " (French).
 * @returns {string} The sentence.
 */
export const entryText = (entry, separator = ': ') =>
  entry.year === null ? entry.text : `${entry.year}${separator}${entry.text}`;
