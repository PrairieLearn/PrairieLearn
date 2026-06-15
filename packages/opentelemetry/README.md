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

You can manually create counters and other metrics with the following functions

- `getHistogram`
- `getCounter`
- `getUpDownCounter`
- `getObservableCounter`
- `getObservableUpDownCounter`
- `getObservableGauge`

```ts
import { metrics, getCounter, ValueType } from '@prairielearn/opentelemetry';

function handleRequest(req, res) {
  const meter = metrics.getMeter('meter-name');
  const requestCounter = getCounter(meter, 'request.count', {
    valueType: ValueType.INT,
  });
  requestCounter.add(1);
}
```

You can also use the `instrumentedWithMetrics` helper to automatically capture a duration histogram and error count:

```ts
import { metrics, instrumentedWithMetrics } from '@prairielearn/opentelemetry';

const meter = metrics.getMeter('meter-name');
await instrumentedWithMetrics(meter, 'operation.name', async () => {
  const random = Math.random() * 1000;
  await new Promise((resolve) => setTimeout(resolve, random));
  if (random > 900) {
    throw new Error('Failed!');
  }
});
```

To capture statistics about a constantly changing value (for instance, the size of a database connection pool), you can use `createObservableValueGauges`. This will "observe" your chosen value on a regular interval and collect the min/max/average of that value for each metrics collection interval.

```ts
import { metrics, createObservableValueGauges } from '@prairielearn/opentelemetry';

const meter = metrics.getMeter('meter-name');
createObservableValueGauges(
  meter,
  'db.pool.size',
  {
    // The interval that your value will be observed, in milliseconds.
    interval: 1000,
  },
  () => pool.size,
);
```
