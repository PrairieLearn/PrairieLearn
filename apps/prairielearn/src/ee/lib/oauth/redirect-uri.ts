const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Schemes a browser would run or open locally instead of handing to an app.
const FORBIDDEN_SCHEMES = new Set([
  // oxlint-disable-next-line no-script-url -- Named here so it can be refused.
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'blob:',
  'about:',
]);

function parseUrl(uri: string) {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

function isLoopback(url: URL) {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Whether a client may register this redirect URI: HTTPS, a loopback address for an app on the
 * user's computer, or an app's own URL scheme such as `cursor://` (RFC 8252).
 */
export function isAllowedRedirectUri(uri: string) {
  const url = parseUrl(uri);
  if (!url || url.hash) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return isLoopback(url);
  return !FORBIDDEN_SCHEMES.has(url.protocol);
}

/**
 * Whether the redirect URI in a request is one the client registered. The match is exact, except
 * that a loopback URI may use any port, because desktop apps listen on whichever port is free.
 */
export function isRegisteredRedirectUri(registered: string[], requested: string) {
  const requestedUrl = parseUrl(requested);
  if (!requestedUrl) return false;
  return registered.some((uri) => {
    if (uri === requested) return true;
    const url = parseUrl(uri);
    return (
      url != null &&
      isLoopback(url) &&
      isLoopback(requestedUrl) &&
      url.hostname === requestedUrl.hostname &&
      url.pathname === requestedUrl.pathname &&
      url.search === requestedUrl.search
    );
  });
}

/** Where approving sends the user, in words for the approval page. */
export function describeRedirectUri(uri: string) {
  const url = parseUrl(uri);
  if (!url) return 'an unknown location';
  if (url.protocol === 'https:') return url.host;
  return 'an app on this computer';
}
