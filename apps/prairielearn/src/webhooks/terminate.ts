import { Router } from 'express';
import * as jose from 'jose';
import * as crypto from 'crypto';
import { logger } from '@prairielearn/logger';

import { config } from '../lib/config';

const router = Router();

/**
 * This is a webhook that can be called when infrastructure wants this instance
 * of the app to terminate. This is useful e.g. as part of deploy tooling. It
 * will send SIGTERM to the current process, which will cause it to exit
 * gracefully.
 *
 * This app requires a signed `PrairieLearn-Signature` JWT header to be present,
 * so it's safe to publicly expose this endpoint if needed. However, it's
 * recommended that this endpoint be blocked at your load balancer or firewall
 * for extra security.
 */
router.post('/', async (req, res) => {
  try {
    const jwt = req.headers['prairielearn-signature'];
    if (!jwt) {
      res.status(403).send('Missing PrairieLearn-Signature header');
      return;
    }
    if (Array.isArray(jwt)) {
      res.status(403).send('Multiple PrairieLearn-Signature headers');
      return;
    }

    try {
      const key = crypto.createSecretKey(config.secretKey, 'utf-8');
      await jose.jwtVerify(jwt, key, {
        maxTokenAge: 60,
        issuer: 'PrairieLearn',
        subject: 'terminate',
      });
    } catch (err) {
      logger.error('Error decoding PrairieLearn-Signature header', err);
      res.status(403).send(`Invalid PrairieLearn-Signature header: ${err.message}`);
      return;
    }

    // If a client uses a keepalive connection, we'd be temporarily deadlocked
    // if we waited for the client to close the connection, as `server.close()`
    // in `server.js` won't finish until all connections have closed. To work
    // around this, we'll explicitly close the underlying socket once we've sent
    // the response.
    //
    // TODO: Once we have a minimum Node version of 18.2, we should use
    // `server.closeIdleConnections` in `server.js` instead of this.
    const socket = res.socket;
    res.on('close', () => {
      socket?.end(() => {
        socket.destroy();
        logger.info('Terminating server due to webhook request');
        process.kill(process.pid, 'SIGTERM');
      });
    });

    res.status(200).send('Terminating');
  } catch (err) {
    logger.error('Error in terminate webhook', err);
    res.status(500).send(err.message);
  }
});

export default router;
