import type { NextFunction, Request, Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { checkSignedToken, generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';

export default (req: Request, res: Response, next: NextFunction): void => {
  const tokenData = {
    url: req.originalUrl,
    authn_user_id: res.locals.authn_user?.user_id,
  };

  res.locals.__csrf_token = generateSignedToken(tokenData, config.secretKey);

  if (req.method === 'POST') {
    // NOTE: If you are trying to debug a "CSRF Fail" in a form with file
    // upload, you may have forgotten to special-case the file upload path.
    // Search for "upload.single('file')" in server.js, for example.

    const __csrf_token = req.headers['x-csrf-token'] ?? req.body.__csrf_token;
    if (!checkSignedToken(__csrf_token, tokenData, config.secretKey)) {
      throw new HttpStatusError(403, 'CSRF fail');
    }
  }
  next();
};
