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
  create: () => T,
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
    meter.createUpDownCounter(name, options),
  );
}

export function getObservableCounter(meter: Meter, name: string, options?: MetricOptions) {
  return getCachedMetric(observableCounterCache, meter, name, () =>
    meter.createObservableCounter(name, options),
  );
}

export function getObservableUpDownCounter(meter: Meter, name: string, options?: MetricOptions) {
  return getCachedMetric(observableUpDownCounterCache, meter, name, () =>
    meter.createObservableUpDownCounter(name, options),
  );
}

export function getObservableGauge(meter: Meter, name: string, options?: MetricOptions) {
  return getCachedMetric(observableGaugeCache, meter, name, () =>
    meter.createObservableGauge(name, options),
  );
}

export async function instrumentedWithMetrics<T>(
  meter: Meter,
  name: string,
  fn: () => Promise<T> | T,
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

export interface createObservableValueGaugesOptions extends MetricOptions {
  interval: number;
}

/**
 * Creates a set of gauges that track the min, max, and average of a value over
 * time. The value is observed on a regular interval.
 *
 * The provided {@link name} is used as the base name for the three gauges. The
 * names of the individual gauges are:
 *
 * - `${name}.min`
 * - `${name}.max`
 * - `${name}.avg`
 */
export function createObservableValueGauges(
  meter: Meter,
  name: string,
  options: createObservableValueGaugesOptions,
  observe: () => number,
) {
  const { interval, ...metricOptions } = options;

  let min = 0;
  let max = 0;
  let sum = 0;
  let count = 0;

  // Observe the value on a regular interval. Black-hole any errors.
  const intervalId = setInterval(() => {
    Promise.resolve(observe())
      .then((value) => {
        min = count === 0 ? value : Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
        count += 1;
      })
      .catch(() => {});
  }, interval);

  // Don't let this keep the process alive.
  intervalId.unref();

  const minGauge = getObservableGauge(meter, `${name}.min`, metricOptions);
  const maxGauge = getObservableGauge(meter, `${name}.max`, metricOptions);
  const averageGauge = getObservableGauge(meter, `${name}.avg`, {
    ...metricOptions,
    // Average is always a double, even if the observed value is an int.
    valueType: ValueType.DOUBLE,
  });

  minGauge.addCallback((observableResult) => {
    observableResult.observe(min);

    min = 0;
  });

  maxGauge.addCallback((observableResult) => {
    observableResult.observe(max);

    max = 0;
  });

  averageGauge.addCallback((observableResult) => {
    const avg = sum / count;
    observableResult.observe(avg);

    sum = 0;
    count = 0;
  });

  return { minGauge, maxGauge, averageGauge, stop: () => clearInterval(intervalId) };
}
