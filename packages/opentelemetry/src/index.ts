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

// Extremely stupid workaround for the fact that the OpenTelemetry instrumentations
// don't currently have robust support for ESM. This hack ensures that instrumented
// packages are loaded for the first time via CJS, which the OpenTelemetry
// instrumentation can intercept and patch. Subsequent imports can be ESM, but that
// doesn't matter because the instrumentation has already been applied.
//
// OpenTelemetry introduced experimental support for ESM in
// https://github.com/open-telemetry/opentelemetry-js/pull/3698. This requires
// the usage of `--experimental-loader` to load the instrumentations, which
// we currently want to avoid.
import './commonjs-preloads.js';
