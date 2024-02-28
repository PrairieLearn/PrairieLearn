import { type Request, type Response } from 'express';
import { type User } from '../../lib/db-types';

export function hasUserAcceptedTerms(user: User): boolean {
  // At the moment, we only have one revision of our terms and conditions, so
  // all we care about is whether the user has accepted the terms at any point.
  // In the future, if we add revisions, we could change this to check for
  // acceptance after the date that the most recent revision went into effect.
  return user.terms_accepted_at !== null;
}

export function redirectToTermsPage(req: Request, res: Response): void {
  res.cookie('preTermsUrl', req.originalUrl, { maxAge: 1000 * 60 * 60 });
  res.redirect('/pl/terms');
}
