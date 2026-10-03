import { httpRequestToRequestData, stripUrlQueryAndFragment } from '@sentry/core';
import * as Sentry from '@sentry/node';
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
    } catch {
      // This most likely isn't running in an initialized git repository.
      // Default to not setting a release.
    }
  }

  Sentry.init({
    release,
    // Dependencies load before configuration provides the DSN. Keep our OTel
    // instrumentation and manual Express capture instead of Sentry's module hooks.
    enableRuntimeChannelInjection: false,
    // Preserve v10's HTTP data collection policy; v11 collects more by default.
    // This controls automatic collection, not data explicitly
    // attached by requestHandler() or application event processors.
    // https://github.com/getsentry/sentry-javascript/blob/11.0.0/MIGRATION.md#senddefaultpii-is-replaced-by-datacollection
    dataCollection: {
      userInfo: false,
      cookies: false,
      // Retain v10's IP/user-related filtering alongside Sentry's built-in
      // secret filtering. Deny terms match case-insensitive key substrings.
      httpHeaders: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      httpBodies: [],
      // The same deny terms preserve v10's query parameter filtering.
      urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
    },
    // Keep the standard error handlers and diagnostic enrichment, while leaving
    // performance instrumentation to our independently configured OTel provider.
    defaultIntegrations: [
      ...Sentry.getDefaultIntegrationsWithoutPerformance().filter(
        // Framework capture would run before PL assigns error IDs and maps SQL
        // errors to HTTP status codes. Replace HTTP/fetch below with tracing off.
        (integration) =>
          !['Express', 'Fastify', 'Hapi', 'Koa', 'Http', 'NodeFetch'].includes(integration.name),
      ),
      // Retain HTTP/fetch breadcrumbs without Sentry spans or outgoing Sentry
      // trace headers; OTel owns span creation and W3C propagation.
      Sentry.httpIntegration({ spans: false, tracePropagation: false }),
      Sentry.nativeNodeFetchIntegration({ spans: false, tracePropagation: false }),
      // Link errors to the active OTel trace/span without registering a provider
      // or exporting OTel spans to Sentry.
      Sentry.openTelemetryIntegration(),
    ],
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
 * Applications load Express before their asynchronously loaded configuration
 * provides the Sentry DSN. Isolate requests explicitly instead of relying on
 * Sentry's framework instrumentation, and extract the Express request data.
 */
export function requestHandler() {
  return (req: any, _res: any, next: any) => {
    Sentry.withIsolationScope((scope) => {
      scope.addEventProcessor((event) => {
        // If an event processor throws an error, Sentry will catch it and
        // retrigger the event processor, which infinitely recurses. We'll
        // treat our event processor as a best-effort operation and silently
        // swallow any errors.
        try {
          event.transaction = extractTransaction(req);
          event.request = httpRequestToRequestData(req);
          return event;
        } catch {
          return event;
        }
      });

      next();
    });
  };
}

// We export every type and function from `@sentry/node` *except* for init,
// which we replace with our own version up above.

export type {
  Breadcrumb,
  BreadcrumbHint,
  Event,
  EventHint,
  Exception,
  NodeOptions,
  PolymorphicRequest,
  SdkInfo,
  Session,
  SeverityLevel,
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/node';

export {
  addBreadcrumb,
  addEventProcessor,
  captureEvent,
  captureException,
  captureMessage,
  close,
  createTransport,
  defaultStackParser,
  flush,
  getCurrentScope,
  getSentryRelease,
  makeNodeTransport,
  NodeClient,
  Scope,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  withIsolationScope,
  withScope,
} from '@sentry/node';

export { expressErrorHandler, setupExpressErrorHandler } from './express.js';
