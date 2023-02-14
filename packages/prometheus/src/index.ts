import { register } from 'prom-client';
import { Router } from 'express';
import compression from 'compression';

export interface HandlerOptions {
  authorizationHeader?: string;
  disableCompression?: boolean;
}

export const handler = (options: HandlerOptions = {}) => {
  const router = Router();

  if (options.authorizationHeader) {
    router.use((req, res, next) => {
      if (req.headers.authorization !== options.authorizationHeader) {
        res.sendStatus(401);
      } else {
        next();
      }
    });
  }

  if (!options.disableCompression) {
    router.use(compression());
  }

  router.get('/', (_req, res, next) => {
    register
      .metrics()
      .then((metrics) => {
        res.set('Content-Type', register.contentType);
        res.send(metrics);
      })
      .catch((err) => {
        next(err);
      });
  });

  return router;
};

export * from 'prom-client';
