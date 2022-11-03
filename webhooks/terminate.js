// @ts-check
const router = require('express').Router();
const asyncHandler = require('express-async-handler');
const jose = require('jose');
const crypto = require('crypto');

const config = require('../lib/config');
const error = require('../prairielib/lib/error');
const logger = require('../lib/logger');

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
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const jwt = req.headers['prairielearn-signature'];
    if (!jwt) {
      throw error.make(403, 'Missing PrairieLearn-Signature header');
    }
    if (Array.isArray(jwt)) {
      throw error.make(400, 'Multiple PrairieLearn-Signature headers');
    }

    try {
      const key = crypto.createSecretKey(config.secretKey, 'utf-8');
      await jose.jwtVerify(jwt, key);
    } catch (err) {
      logger.error(err);
      throw error.make(403, `Invalid PrairieLearn-Signature header: ${err.message}`);
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
      socket.end(() => {
        socket.destroy();
        process.kill(process.pid, 'SIGTERM');
      });
    });

    res.sendStatus(200);
  })
);

module.exports = router;
