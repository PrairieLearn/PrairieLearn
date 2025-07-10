import CookiesModule from 'js-cookie';

// Keep in sync with assets/scripts/navbarClient.ts
const COOKIE_EXPIRATION_DAYS = 30;

// Old cookies did not have a domain.
const OldCookies = CookiesModule.withAttributes({
  path: '/',
  expires: COOKIE_EXPIRATION_DAYS,
  secure: location.protocol === 'https:',
});

// New cookies do have a domain.
const Cookies = CookiesModule.withAttributes({
  path: '/',
  expires: COOKIE_EXPIRATION_DAYS,
  domain:
    document.querySelector('meta[name="cookie-domain"]')?.getAttribute('content') ?? undefined,
  secure: location.protocol === 'https:',
});

type OldAndNewCookieNames = [string, string];

export function setCookieClient(names: OldAndNewCookieNames, value: string) {
  OldCookies.set(names[0], value);
  Cookies.set(names[1], value);
}

// When removing cookies, we need to remove the cookies both with and without
// an explicit domain.
export function removeCookieClient(names: OldAndNewCookieNames) {
  OldCookies.remove(names[0]);
  Cookies.remove(names[1]);
}
