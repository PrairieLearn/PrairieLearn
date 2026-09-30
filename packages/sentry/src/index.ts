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
    enableRuntimeChannelInjection: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      httpBodies: [],
      urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
    // Keep manual Express error capture and OTel instrumentation in charge.
    defaultIntegrations: [
      ...Sentry.getDefaultIntegrationsWithoutPerformance().filter(
        (integration) =>
          !['Express', 'Fastify', 'Hapi', 'Koa', 'Http', 'NodeFetch'].includes(integration.name),
      ),
      Sentry.httpIntegration({ spans: false, tracePropagation: false }),
      Sentry.nativeNodeFetchIntegration({ spans: false, tracePropagation: false }),
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
