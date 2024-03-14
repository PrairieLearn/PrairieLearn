export {
  trace,
  metrics,
  context,
  SpanStatusCode,
  ValueType,
  TraceFlags,
  Meter,
  Counter,
  Histogram,
  UpDownCounter,
  ObservableCounter,
  ObservableUpDownCounter,
  ObservableGauge,
  ObservableResult,
} from '@opentelemetry/api';
export { suppressTracing } from '@opentelemetry/core';

export { init, shutdown, disableInstrumentations } from './init';
export { instrumented } from './tracing';
export {
  instrumentedWithMetrics,
  getCounter,
  getUpDownCounter,
  getHistogram,
  getObservableCounter,
  getObservableUpDownCounter,
  getObservableGauge,
  createObservableValueGauges,
  createObservableValueGaugesOptions,
} from './metrics';
