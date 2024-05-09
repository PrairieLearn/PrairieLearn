export {
  trace,
  metrics,
  context,
  SpanStatusCode,
  ValueType,
  TraceFlags,
  type Meter,
  type Counter,
  type Histogram,
  type UpDownCounter,
  type ObservableCounter,
  type ObservableUpDownCounter,
  type ObservableGauge,
  type ObservableResult,
} from '@opentelemetry/api';
export { suppressTracing } from '@opentelemetry/core';

export { init, shutdown, disableInstrumentations } from './init.js';
export { instrumented } from './tracing.js';
export {
  instrumentedWithMetrics,
  getCounter,
  getUpDownCounter,
  getHistogram,
  getObservableCounter,
  getObservableUpDownCounter,
  getObservableGauge,
  createObservableValueGauges,
  type CreateObservableValueGaugesOptions,
} from './metrics.js';
