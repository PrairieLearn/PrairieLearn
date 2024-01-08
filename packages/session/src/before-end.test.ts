import express, { type Request, type Response, type NextFunction } from 'express';
import fetch from 'node-fetch';
import { assert } from 'chai';
import { withServer } from '@prairielearn/express-test-utils';

import { beforeEnd } from './before-end';

describe('beforeEnd', () => {
  it('handles errors correctly', async () => {
    const app = express();
    app.use((_req, res, next) => {
      beforeEnd(res, next, async () => {
        throw new Error('oops');
      });

      next();
    });

    app.get('/', (_req, res) => res.sendStatus(200));

    let error: Error | null = null;
    app.use((err: any, _req: Request, _res: Response, next: NextFunction) => {
      error = err;
      next();
    });

    await withServer(app, async ({ url }) => {
      const res = await fetch(url);

      assert.equal(res.status, 200);
      assert.equal(error?.message, 'oops');
    });
  });
});
