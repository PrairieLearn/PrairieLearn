import { createHmac } from 'node:crypto';

import { parse } from 'uri-js';

export function encodeOAuth1Component(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Signs OAuth 1.0 HMAC-SHA1 requests with consumer-only credentials for LTI 1.x. */
export function generateOAuth1Signature({
  method,
  url,
  parameters,
  consumerSecret,
}: {
  method: string;
  url: string;
  parameters: Record<string, string | string[]>;
  consumerSecret: string;
}): string {
  const pairs: [string, string][] = [];
  for (const [name, value] of Object.entries(parameters)) {
    // oauth-signature sorted repeated values before encoding them.
    const values = Array.isArray(value) ? [...value].sort() : [value];
    if (values.length === 0) values.push('');
    for (const entry of values) {
      pairs.push([encodeOAuth1Component(name), encodeOAuth1Component(entry)]);
    }
  }

  const normalizedParameters = pairs
    .sort(([nameA], [nameB]) => (nameA < nameB ? -1 : nameA > nameB ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');

  const baseString = [method.toUpperCase(), normalizeOAuth1Url(url), normalizedParameters]
    .map(encodeOAuth1Component)
    .join('&');

  // The separator is required even though LTI does not use a token secret.
  return createHmac('sha1', `${encodeOAuth1Component(consumerSecret)}&`)
    .update(baseString)
    .digest('base64');
}

function normalizeOAuth1Url(url: string): string {
  if (!url) return '';
  const qualifiedUrl = url.includes('://') ? url : `http://${url}`;
  const parsed = parse(qualifiedUrl);
  const scheme = (parsed.scheme || 'http').toLowerCase();
  const host = (parsed.host || '').toLowerCase();
  const port = parsed.port || '';
  const isDefaultPort = (scheme === 'http' && port === 80) || (scheme === 'https' && port === 443);
  const origin = `${scheme}://${host}${port && !isDefaultPort ? `:${port}` : ''}`;
  let pathname = parsed.path || '';

  // Preserve oauth-signature's treatment of absent slashes and normalized origins.
  if (pathname === '/' && !qualifiedUrl.includes(`${origin}/`)) pathname = '';

  // Callers supply all signed parameters explicitly, including any query parameters.
  return `${origin}${pathname}`;
}
