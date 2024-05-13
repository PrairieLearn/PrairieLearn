import * as Sentry from '@sentry/node';
import execa from 'execa';

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

// We export every type and function from `@sentry/node` *except* for init,
// which we replace with our own version up above.

export {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Session,
  Severity,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  AddRequestDataToEventOptions,
  PolymorphicRequest,
  NodeOptions,
} from '@sentry/node';

export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  createTransport,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  makeMain,
  Scope,
  startTransaction,
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
  defaultIntegrations,
  defaultStackParser,
  lastEventId,
  flush,
  close,
  getSentryRelease,
  deepReadDirSync,
  Integrations,
  Handlers,
  runWithAsyncContext,
  getCurrentScope,
} from '@sentry/node';
