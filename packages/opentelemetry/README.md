# `@prairielearn/opentelemetry`

Opinionated wrapper around various `@opentelemetry/*` packages.

## Usage

You should require this package as early as possible during application initialization and call `init()` once the application configuration is available.

```ts
import { init } from '@prairielearn/opentelemetry';

// ...

await init({
  openTelemetryEnabled: true,
  openTelemetryExporter: 'honeycomb',
  openTelemetrySamplerType: 'always-on',
  openTelemetrySampleRate: 0.1,
  honeycombApiKey: 'KEY',
  honeycombDataset: 'DATASET',
});
```

This will automatically instrument a variety of commonly-used Node packages.

To manually instrument code, you can use the `trace` export:

```ts
import { trace } from '@prairielearn/opentelemetry';

const tracer = trace.getTracer('lib-name');
await tracer.startActiveSpan('span-name', async (span) => {
  try {
    await doWork();
    span.setStatus({ status: SpanStatusCode.OK });
  } catch (err) {
    span.recordException(err);
    span.setStatus({
      status: SpanStatusCode.ERROR,
      message: err.message,
    });
    throw err;
  }
});
```

When using code from the OpenTelemetry libraries, make sure you import it via `@prairielearn/opentelemetry` instead of installing it separately to ensure that there is only one version of each OpenTelemetry package in use at once. If the desired functionality is not yet exported, please add it!
