import {
  InMemoryMetricExporter,
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader,
  Histogram,
} from '@opentelemetry/sdk-metrics';
import { Meter } from '@opentelemetry/api';
import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { instrumentedWithMetrics } from './metrics';

chai.use(chaiAsPromised);

async function waitForMetricsExport(exporter: InMemoryMetricExporter) {
  while (exporter.getMetrics().length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('instrumentedWithMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let metricReader: PeriodicExportingMetricReader;
  let meter: Meter;

  beforeEach(async () => {
    const meterProvider = new MeterProvider();
    meter = meterProvider.getMeter('test');
    exporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
    metricReader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 50,
    });
    meterProvider.addMetricReader(metricReader);
  });

  afterEach(async () => {
    await exporter.shutdown();
    await metricReader.shutdown();
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
    await assert.isRejected(
      instrumentedWithMetrics(meter, 'test', async () => {
        throw new Error('error for test');
      }),
      'error for test',
    );

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
