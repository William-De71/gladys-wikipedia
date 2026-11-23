// -----------------------------------------------------------------------------
// Client of the Wikipedia REST API (https://<language>.wikipedia.org/api/rest_v1),
// the "feed" endpoints of the Wikimedia Foundation, without a key:
//   - GET /feed/onthisday/all/{MM}/{DD}       selected anniversaries, events,
//                                              births, deaths, holidays
//   - GET /feed/featured/{YYYY}/{MM}/{DD}     today's featured article (some
//                                              languages only), picture of the
//                                              day, most read articles
// and the thumbnails of Wikimedia Commons (upload / thumb.wikimedia.org).
//
// The Wikimedia API etiquette asks for a User-Agent that names the client and
// a way to contact its author: the repository URL, never a user detail. The
// feeds are cached by Wikimedia; the integration reads each language once a
// day. Checked on 2026-11-23 for en, fr, de and es.
// -----------------------------------------------------------------------------

const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 2000;
/** The core refuses a widget image over 300 KB. */
export const MAX_IMAGE_BYTES = 300 * 1024;
const IMAGE_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const ERROR_KINDS = {
  RATE_LIMIT: 'rate_limit',
  REQUEST: 'request',
  SERVER: 'server',
  UNREACHABLE: 'unreachable',
  IMAGE: 'image',
};

export class WikiError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - What went wrong.
   * @param {number|null} [status] - The HTTP status.
   */
  constructor(kind, message, status = null) {
    super(message);
    this.name = 'WikiError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The kind of an HTTP failure.
 * @param {number} status - The status.
 * @returns {string} One of ERROR_KINDS.
 */
export function kindOf(status) {
  if (status === 429) {
    return ERROR_KINDS.RATE_LIMIT;
  }
  return status >= 500 ? ERROR_KINDS.SERVER : ERROR_KINDS.REQUEST;
}

const two = (value) => String(value).padStart(2, '0');

/**
 * @description The default root of a Wikipedia.
 * @param {string} language - "fr".
 * @returns {string} "https://fr.wikipedia.org/api/rest_v1".
 */
export const wikipediaRoot = (language) => `https://${language}.wikipedia.org/api/rest_v1`;

/**
 * @description Build a client.
 * @param {object} options - Options.
 * @param {string} options.userAgent - "gladys-wikipedia/0.1.0 (+https://…)".
 * @param {(language: string) => string} [options.rootOf] - The API root of a language.
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Wait before the retry.
 * @returns {object} `{ onThisDay, featured, image }`.
 */
export function createWikiClient({
  userAgent,
  rootOf = wikipediaRoot,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  async function once(url, accept) {
    try {
      return await fetchImpl(url, {
        headers: { Accept: accept, 'User-Agent': userAgent, 'Api-User-Agent': userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new WikiError(
        ERROR_KINDS.UNREACHABLE,
        `Cannot reach Wikipedia (${err?.cause?.code ?? err?.name ?? 'network error'})`,
      );
    }
  }

  /**
   * @description One GET of JSON, tried once more after a network error or a 5xx.
   * @param {string} url - The URL.
   * @returns {Promise<object>} The parsed body.
   */
  async function getJson(url) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await once(url, 'application/json');
        const text = await response.text().catch(() => '');
        if (!response.ok) {
          throw new WikiError(
            kindOf(response.status),
            `HTTP ${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`,
            response.status,
          );
        }
        try {
          return JSON.parse(text);
        } catch {
          throw new WikiError(ERROR_KINDS.SERVER, 'Wikipedia answered something that is not JSON');
        }
      } catch (err) {
        const retryable = err.kind === ERROR_KINDS.SERVER || err.kind === ERROR_KINDS.UNREACHABLE;
        if (!retryable || attempt >= 2) {
          throw err;
        }
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  return {
    /**
     * @description What happened on a day of the year.
     * @param {string} language - "fr".
     * @param {number} month - 1 to 12.
     * @param {number} day - 1 to 31.
     * @returns {Promise<object>} `{ selected, events, births, deaths, holidays }`.
     */
    onThisDay(language, month, day) {
      return getJson(`${rootOf(language)}/feed/onthisday/all/${two(month)}/${two(day)}`);
    },
    /**
     * @description The featured content of a date.
     * @param {string} language - "fr".
     * @param {string} date - "2026-11-23".
     * @returns {Promise<object>} `{ tfa?, mostread?, image?, news? }`.
     */
    featured(language, date) {
      return getJson(`${rootOf(language)}/feed/featured/${date.replaceAll('-', '/')}`);
    },
    /**
     * @description A Wikimedia thumbnail, as raw base64 for a widget.
     * @param {string} source - Its URL (upload or thumb.wikimedia.org).
     * @returns {Promise<string>} The base64.
     */
    async image(source) {
      let url;
      try {
        url = new URL(source);
      } catch {
        throw new WikiError(ERROR_KINDS.IMAGE, 'Not an image URL');
      }
      if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname)) {
        throw new WikiError(ERROR_KINDS.IMAGE, `Not a Wikimedia image: ${url.hostname}`);
      }
      // The tracking parameters added by the API are not needed.
      url.search = '';
      const response = await once(url, 'image/webp,image/jpeg,image/png');
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!response.ok || !IMAGE_TYPES.has(type)) {
        throw new WikiError(ERROR_KINDS.IMAGE, `Image HTTP ${response.status} (${type})`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new WikiError(ERROR_KINDS.IMAGE, `Image too large: ${bytes.length} bytes`);
      }
      return bytes.toString('base64');
    },
  };
}

/**
 * @description A smaller standard thumbnail of the same Commons file:
 * Wikimedia serves fixed widths only (500 px is one, 640 px is not).
 * @param {string} source - A thumbnail URL with "/960px-".
 * @returns {string|null} The 500 px one, null when the URL has no width.
 */
export function smallerThumbnail(source) {
  return /\/\d+px-/.test(source) ? source.replace(/\/\d+px-/, '/500px-') : null;
}
