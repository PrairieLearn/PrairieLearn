# `@prairielearn/sentry`

Opinionated wrapper around `@sentry/core` and `@sentry/node`. The async `init` function automatically sets the release to the current Git revision, if available.

```ts
import { init } from '@prairielearn/sentry';

await init({
  dsn: 'DSN HERE',
  environment: 'ENVIRONMENT HERE',
});
```

## OpenTelemetry and request isolation

OpenTelemetry owns tracing, instrumentation, context propagation, sampling, and exporters. Initialize the application's OpenTelemetry provider before calling `init`. The default `openTelemetryIntegration` links Sentry errors to the active OTel trace without exporting spans to Sentry. Leave `tracesSampleRate` and `tracesSampler` unset. No Sentry tracer provider, span processor, propagator, or context manager is required.

Sentry v11 uses its own AsyncLocalStorage for scope isolation. Applications can continue using `requestHandler()` before Express routes and `expressErrorHandler()` after routes. Framework auto-instrumentation and runtime channel injection are disabled by default because applications load frameworks before the Sentry DSN is available. This also keeps manual error capture in charge: PrairieLearn assigns error IDs and translates Postgres errors into HTTP status codes before capture, whereas automatic Express capture would run earlier. HTTP and fetch breadcrumbs remain enabled, with Sentry spans and outgoing trace propagation disabled so they do not compete with OTel.

The wrapper preserves v10's restrictive SDK data collection defaults, while accepting v11's message stack traces and five lines of source context. Explicit request data and user information added by application middleware are still included; these defaults do not scrub manually attached event data. Callers can override SDK options when needed.

## Migrating from Sentry v10

`@sentry/node-core` was merged into `@sentry/node`. The `SentryContextManager` export was removed; use the default OTel context manager instead. The wrapper's `NodeOptions` and exported SDK types now follow Sentry v11. The local Express handler retains its `shouldHandleError` callback.

Node.js 24 satisfies Sentry v11's minimum of 20.19.0. Self-hosted Sentry must be version 26.4.2 or newer to be supported. See the [Sentry migration guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#upgrading-from-10x-to-11x) and [custom OpenTelemetry setup documentation](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/).
