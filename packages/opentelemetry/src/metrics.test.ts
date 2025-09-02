import { type Meter } from '@opentelemetry/api';
import {
  AggregationTemporality,
  type Histogram,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { instrumentedWithMetrics } from './metrics.js';

async function waitForMetricsExport(exporter: InMemoryMetricExporter) {
  while (exporter.getMetrics().length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('instrumentedWithMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let meterProvider: MeterProvider;
  let meter: Meter;

  beforeEach(async () => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
    meterProvider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: 50,
        }),
      ],
    });
    meter = meterProvider.getMeter('test');
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  it('records a histogram for the function duration', async () => {
    await instrumentedWithMetrics(meter, 'test', async () => {});

    await waitForMetricsExport(exporter);
    const exportedMetrics = exporter.getMetrics();
    const { scope, metrics } = exportedMetrics[0].scopeMetrics[0];

    // We won't see an exported metric for the error counter because the
    // Metrics SDK no longer exports metrics with no data points.
    // https://github.com/open-telemetry/opentelemetry-js/pull/4135
    assert.lengthOf(metrics, 1);
    const [histogramMetric] = metrics;

    assert.equal(scope.name, 'test');

    assert.ok(histogramMetric);
    assert.equal(histogramMetric.descriptor.name, 'test.duration');
    assert.equal((histogramMetric.dataPoints[0].value as Histogram).count, 1);
  });

  it('records an error count', async () => {
    await expect(
      instrumentedWithMetrics(meter, 'test', async () => {
        throw new Error('error for test');
      }),
    ).rejects.toThrow('error for test');

    await waitForMetricsExport(exporter);
    const exportedMetrics = exporter.getMetrics();
    const { metrics, scope } = exportedMetrics[0].scopeMetrics[0];

    // An error was reported above, so there will be both the error counter
    // and histogram metrics.
    assert.lengthOf(metrics, 2);
    const [counterMetric, histogramMetric] = metrics;

    assert.ok(scope);
    assert.equal(scope.name, 'test');

    assert.ok(counterMetric);
    assert.equal(counterMetric.descriptor.name, 'test.error');
    assert.equal(counterMetric.dataPoints[0].value, 1);

    assert.ok(histogramMetric);
    assert.equal(histogramMetric.descriptor.name, 'test.duration');
    assert.equal((histogramMetric.dataPoints[0].value as Histogram).count, 1);
  });
});
