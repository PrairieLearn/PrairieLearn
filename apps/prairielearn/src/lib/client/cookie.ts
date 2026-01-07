import CookiesModule from 'js-cookie';

const COOKIE_EXPIRATION_DAYS = 30;

let OldCookies: Cookies.CookiesStatic<string> | undefined;
let Cookies: Cookies.CookiesStatic<string> | undefined;

// Allows for server-side rendering.
if (typeof location !== 'undefined') {
  OldCookies = CookiesModule.withAttributes({
    path: '/',
    expires: COOKIE_EXPIRATION_DAYS,
    secure: location.protocol === 'https:',
  });

  // New cookies do have a domain.
  Cookies = CookiesModule.withAttributes({
    path: '/',
    expires: COOKIE_EXPIRATION_DAYS,
    domain:
      document.querySelector('meta[name="cookie-domain"]')?.getAttribute('content') ?? undefined,
    secure: location.protocol === 'https:',
  });
}

type OldAndNewCookieNames = [string, string];

export function setCookieClient(names: OldAndNewCookieNames, value: string) {
  if (!OldCookies || !Cookies) {
    throw new Error('Cannot be used outside a browser environment');
  }
  OldCookies.set(names[0], value);
  Cookies.set(names[1], value);
}

/**
 * When removing cookies, we need to remove the cookies both with and without
 * an explicit domain.
 */
export function removeCookieClient(names: OldAndNewCookieNames) {
  if (!OldCookies || !Cookies) {
    throw new Error('Cannot be used outside a browser environment');
  }
  OldCookies.remove(names[0]);
  Cookies.remove(names[1]);
}
