import {
  Meter,
  ValueType,
  MetricOptions,
  Histogram,
  Counter,
  UpDownCounter,
  ObservableCounter,
  ObservableUpDownCounter,
  ObservableGauge,
} from '@opentelemetry/api';

const histogramCache = new WeakMap<Meter, Map<string, Histogram>>();
const counterCache = new WeakMap<Meter, Map<string, Counter>>();
const upDownCounterCache = new WeakMap<Meter, Map<string, UpDownCounter>>();
const observableCounterCache = new WeakMap<Meter, Map<string, ObservableCounter>>();
const observableUpDownCounterCache = new WeakMap<Meter, Map<string, ObservableUpDownCounter>>();
const observableGaugeCache = new WeakMap<Meter, Map<string, ObservableGauge>>();

function getCachedMetric<T>(
  cache: WeakMap<Meter, Map<string, T>>,
  meter: Meter,
  name: string,
  create: () => T
): T {
  let meterCache = cache.get(meter);
  if (!meterCache) {
    meterCache = new Map();
    cache.set(meter, meterCache);
  }

  let metric = meterCache.get(name);
  if (!metric) {
    metric = create();
    meterCache.set(name, metric);
  }

  return metric;
}

export function getHistogram(meter: Meter, name: string, options?: MetricOptions): Histogram {
  return getCachedMetric(histogramCache, meter, name, () => meter.createHistogram(name, options));
}

export function getCounter(meter: Meter, name: string, options?: MetricOptions) {
  return getCachedMetric(counterCache, meter, name, () => meter.createCounter(name, options));
}

export function getUpDownCounter(meter: Meter, name: string, options?: MetricOptions) {
  return getCachedMetric(upDownCounterCache, meter, name, () =>
    meter.createUpDownCounter(name, options)
  );
}

export function getObservableCounter(meter: Meter, name: string, options?: MetricOptions) {
  return getCachedMetric(observableCounterCache, meter, name, () =>
    meter.createObservableCounter(name, options)
  );
}

export function getObservableUpDownCounter(meter: Meter, name: string, options?: MetricOptions) {
  return getCachedMetric(observableUpDownCounterCache, meter, name, () =>
    meter.createObservableUpDownCounter(name, options)
  );
}

export function getObservableGauge(meter: Meter, name: string, options?: MetricOptions) {
  return getCachedMetric(observableGaugeCache, meter, name, () =>
    meter.createObservableGauge(name, options)
  );
}

export async function instrumentedWithMetrics<T>(
  meter: Meter,
  name: string,
  fn: () => Promise<T> | T
): Promise<T> {
  const error = getCounter(meter, `${name}.error`, { valueType: ValueType.INT });
  const histogram = getHistogram(meter, `${name}.duration`, {
    unit: 'milliseconds',
    valueType: ValueType.DOUBLE,
  });

  const start = performance.now();
  try {
    return await fn();
  } catch (e) {
    error.add(1);
    throw e;
  } finally {
    histogram.record(performance.now() - start);
  }
}
