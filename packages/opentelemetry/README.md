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
  openTelemetryMetricExporter: 'honeycomb',
  openTelemetryMetricExportIntervalMillis: 30_000,
  openTelemetrySamplerType: 'always-on',
  openTelemetrySampleRate: 0.1,
  honeycombApiKey: 'KEY',
  honeycombDataset: 'DATASET',
});
```

This will automatically instrument a variety of commonly-used Node packages.

When using code from the OpenTelemetry libraries, make sure you import it via `@prairielearn/opentelemetry` instead of installing it separately to ensure that there is only one version of each OpenTelemetry package in use at once. If the desired functionality is not yet exported, please add it!

## Traces

To easily instrument individual pieces of functionality, you can use the `instrumented()` helper function:

```ts
import { instrumented } from '@prairielearn/opentelemetry';

async function doThing() {
  return instrumented('span.name', async (span) => {
    span.setAttribute('attribute.name', 'value');
    await doThing();
  });
}
```

This will automatically set the span status and record any exceptions that occur.

If you have a more complex use case, you can manually instrument code with the `trace` export:

```ts
import { trace, SpanStatusCode } from '@prairielearn/opentelemetry';

const tracer = trace.getTracer('default');
await tracer.startActiveSpan('span.name', async (span) => {
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

## Metrics

You can also use the `instrumentedWithMetrics` helper to automatically capture a duration histogram and error count:

```ts
import { instrumentedWithMetrics } from '@prairielearn/opentelemetry';

await instrumentedWithMetrics('operation.name', async () => {
  const random = Math.random() * 1000;
  await new Promise(resolve => setTimeout(resolve, random));
  if (random > 900) {
    throw new Error('Failed!');
  }
});
```
