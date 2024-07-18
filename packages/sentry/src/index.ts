import * as Sentry from '@sentry/node';
import { stripUrlQueryAndFragment } from '@sentry/utils';
import { execa } from 'execa';

/**
 * A thin wrapper around {@link Sentry.init} that automatically sets `release`
 * based on the current Git revision.
 */
export async function init(options: Sentry.NodeOptions) {
  let release = options.release;

  if (!release) {
    try {
      release = (await execa('git', ['rev-parse', 'HEAD'])).stdout.trim();
    } catch (e) {
      // This most likely isn't running in an initialized git repository.
      // Default to not setting a release.
    }
  }

  Sentry.init({
    release,
    ...options,
  });
}

/**
 * Based on Sentry code that is not exported:
 * https://github.com/getsentry/sentry-javascript/blob/602703652959b581304a7849cb97117f296493bc/packages/utils/src/requestdata.ts#L102
 */
function extractTransaction(req: any) {
  const method = req.method?.toUpperCase() || '';
  const path = stripUrlQueryAndFragment(req.originalUrl || req.url || '');

  let name = '';
  if (method) {
    name += method;
  }
  if (method && path) {
    name += ' ';
  }
  if (path) {
    name += path;
  }

  return name;
}

/**
 * Sentry v8 switched from simple, manual instrumentation to "automatic"
 * instrumentation based on OpenTelemetry. However, this interferes with
 * the way that our applications asynchronously load their configuration,
 * specifically the Sentry DSN. Sentry's automatic request isolation and
 * request data extraction requires that `Sentry.init` be called before
 * any other code is loaded, but our application startup structure is such
 * that we import most of our own code before we can load the Sentry DSN.
 *
 * Rather than jumping through hoops to restructure our application to
 * support this, this small function can be added as Express middleware to
 * isolate requests and set request data for Sentry.
 */
export function requestHandler() {
  return (req: any, _res: any, next: any) => {
    Sentry.withIsolationScope((scope) => {
      scope.addEventProcessor((event) => {
        event.transaction = extractTransaction(req);
        return Sentry.addRequestDataToEvent(event, req);
      });

      next();
    });
  };
}

// We export every type and function from `@sentry/node` *except* for init,
// which we replace with our own version up above.

export {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  PolymorphicRequest,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Session,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  Span,
  NodeOptions,
} from '@sentry/node';

export {
  addEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  createTransport,
  getCurrentHub,
  Scope,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  NodeClient,
  makeNodeTransport,
  addRequestDataToEvent,
  extractRequestData,
  defaultStackParser,
  flush,
  close,
  getSentryRelease,
  getCurrentScope,
  startSpan,
  startSpanManual,
  startInactiveSpan,
  expressIntegration,
  expressErrorHandler,
  setupExpressErrorHandler,
} from '@sentry/node';
