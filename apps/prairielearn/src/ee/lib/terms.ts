import { type Response } from 'express';
import { type User } from '../../lib/db-types';

export function hasUserAcceptedTerms(user: User): boolean {
  // At the moment, we only have one revision of our terms and conditions, so
  // all we care about is whether the user has accepted the terms at any point.
  // In the future, if we add revisions, we could change this to check for
  // acceptance after the date that the most recent revision went into effect.
  return user.terms_accepted_at !== null;
}

/**
 * Redirects the response to the terms acceptance page. If a `redirectUrl` is
 * provided, the original URL will be stored in a cookie and the user will be
 * redirected to the terms page. After accepting the terms, the user will be
 * redirected back to the original URL.
 */
export function redirectToTermsPage(res: Response, redirectUrl?: string): void {
  if (redirectUrl) {
    res.cookie('preTermsUrl', redirectUrl, { maxAge: 1000 * 60 * 60 });
  }
  res.redirect('/pl/terms');
}
