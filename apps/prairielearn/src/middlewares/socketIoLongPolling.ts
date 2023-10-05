import asyncHandler = require('express-async-handler');
import { features } from '../lib/features';

const REFRESH_INTERVAL_MS = 10_000;

let enabled = false;
let lastRefreshTime: number | null = null;

export default asyncHandler(async (req, res, next) => {
  // We'll cache the result of this check for a short period to avoid having
  // to check for it on every single request.
  if (lastRefreshTime == null || lastRefreshTime + REFRESH_INTERVAL_MS < Date.now()) {
    enabled = await features.enabled('socket-io-long-polling-only');
    lastRefreshTime = Date.now();
  }

  res.locals.socket_io_long_polling_only = enabled;

  next();
});
