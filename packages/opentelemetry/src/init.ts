import { Metadata, credentials } from '@grpc/grpc-js';
import { type ContextManager, metrics } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { ConnectInstrumentation } from '@opentelemetry/instrumentation-connect';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import { ExpressLayerType, ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { awsEc2Detector } from '@opentelemetry/resource-detector-aws';
import {
  detectResourcesSync,
  processDetector,
  envDetector,
  Resource,
} from '@opentelemetry/resources';
import {
  PeriodicExportingMetricReader,
  MeterProvider,
  type PushMetricExporter,
  ConsoleMetricExporter,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
import {
  type SpanExporter,
  type ReadableSpan,
  type SpanProcessor,
  SimpleSpanProcessor,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
  AlwaysOffSampler,
  type Sampler,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * Extends `BatchSpanProcessor` to give it the ability to filter out spans
 * before they're queued up to send. This enhances our sampling process so
 * that we can filter spans _after_ they've been emitted.
 */
class FilterBatchSpanProcessor extends BatchSpanProcessor {
  private filter: (span: ReadableSpan) => boolean;

  constructor(exporter: SpanExporter, filter: (span: ReadableSpan) => boolean) {
    super(exporter);
    this.filter = filter;
  }

  /**
   * This is invoked after a span is "finalized". `super.onEnd` will queue up
   * the span to be exported, but if we don't call that, we can just drop the
   * span and the parent will be none the wiser!
   */
  onEnd(span: ReadableSpan) {
    if (!this.filter(span)) return;

    super.onEnd(span);
  }
}

/**
 * This will be used with our {@link FilterBatchSpanProcessor} to filter out
 * events that we're not interested in. This helps reduce our event volume
 * but still gives us fine-grained control over which events we keep.
 */
function filter(span: ReadableSpan) {
  if (span.name === 'pg-pool.connect') {
    // Looking at historical data, this generally happens in under a millisecond,
    // precisely because we maintain a pool of long-lived connections. The only
    // time obtaining a client should take longer than that is if we're
    // establishing a connection for the first time, which should happen only at
    // bootup, or if a connection errors out. Those are the cases we're
    // interested in, so we'll filter accordingly.
    return hrTimeToMilliseconds(span.duration) > 1;
  }

  // Always return true so that we default to including a span.
  return true;
}

// When adding new instrumentation here, add the corresponding packages to
// `commonjs-preloads.ts` so that we can ensure that they're loaded via CJS
// before anything tries to load them via CJS. This is necessary because the
// instrumentations can't hook into the ESM loader.
const instrumentations = [
  new AwsInstrumentation(),
  new ConnectInstrumentation(),
  new DnsInstrumentation(),
  new ExpressInstrumentation({
    // We use a lot of middleware; it makes the traces way too noisy. If we
    // want telemetry on a particular middleware, we should instrument it
    // manually.
    ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
    ignoreLayers: [
      // These don't provide useful information to us.
      'router - /',
      'request handler - /*',
    ],
  }),
  new HttpInstrumentation({
    ignoreIncomingPaths: [
      // socket.io requests are generally just long-polling; they don't add
      // useful information for us.
      /\/socket.io\//,
      // We get several of these per second; they just chew through our event quota.
      // They don't really do anything interesting anyways.
      /\/pl\/webhooks\/ping/,
    ],
  }),
  new IORedisInstrumentation(),
  new PgInstrumentation(),
  new RedisInstrumentation(),
];

// Enable all instrumentations now, even though we haven't configured our
// span processors or trace exporters yet. We'll set those up later.
instrumentations.forEach((i) => {
  i.enable();
});

let tracerProvider: NodeTracerProvider | null;

interface OpenTelemetryConfigEnabled {
  openTelemetryEnabled: boolean;
  openTelemetryExporter?: 'console' | 'honeycomb' | 'jaeger' | SpanExporter | null;
  openTelemetryMetricExporter?: 'console' | 'honeycomb' | PushMetricExporter | null;
  openTelemetryMetricExportIntervalMillis?: number;
  openTelemetrySamplerType: 'always-on' | 'always-off' | 'trace-id-ratio';
  openTelemetrySampleRate?: number;
  openTelemetrySpanProcessor?: 'batch' | 'simple' | SpanProcessor;
  contextManager?: ContextManager;
  honeycombApiKey?: string | null;
  honeycombDataset?: string | null;
  serviceName?: string;
}

// When we know for sure that OpenTelemetry is disabled, we won't require
// any other attributes to be set.
interface OpenTelemetryConfigDisabled extends Partial<OpenTelemetryConfigEnabled> {
  openTelemetryEnabled: false;
}

export type OpenTelemetryConfig = OpenTelemetryConfigEnabled | OpenTelemetryConfigDisabled;

function getHoneycombMetadata(config: OpenTelemetryConfig, datasetSuffix = ''): Metadata {
  if (!config.honeycombApiKey) throw new Error('Missing Honeycomb API key');
  if (!config.honeycombDataset) throw new Error('Missing Honeycomb dataset');

  const metadata = new Metadata();

  metadata.set('x-honeycomb-team', config.honeycombApiKey);
  metadata.set('x-honeycomb-dataset', config.honeycombDataset + datasetSuffix);

  return metadata;
}

function getTraceExporter(config: OpenTelemetryConfig): SpanExporter | null {
  if (!config.openTelemetryExporter) return null;

  if (typeof config.openTelemetryExporter === 'object') {
    return config.openTelemetryExporter;
  }

  switch (config.openTelemetryExporter) {
    case 'console':
      return new ConsoleSpanExporter();
    case 'honeycomb':
      return new OTLPTraceExporter({
        url: 'grpc://api.honeycomb.io:443/',
        credentials: credentials.createSsl(),
        metadata: getHoneycombMetadata(config),
      });
      break;
    case 'jaeger':
      return new OTLPTraceExporterHttp();
    default:
      throw new Error(`Unknown OpenTelemetry exporter: ${config.openTelemetryExporter}`);
  }
}

function getMetricExporter(config: OpenTelemetryConfig): PushMetricExporter | null {
  if (!config.openTelemetryMetricExporter) return null;

  if (typeof config.openTelemetryMetricExporter === 'object') {
    return config.openTelemetryMetricExporter;
  }

  switch (config.openTelemetryMetricExporter) {
    case 'console':
      return new ConsoleMetricExporter();
    case 'honeycomb':
      return new OTLPMetricExporter({
        url: 'grpc://api.honeycomb.io:443/',
        credentials: credentials.createSsl(),
        // Honeycomb recommends using a separate dataset for metrics, so we'll
        // adopt the convention of appending '-metrics' to the dataset name.
        metadata: getHoneycombMetadata(config, '-metrics'),
        // Delta temporality means that sums, histograms, etc. will reset each
        // time data is collected. This more closely matches how we want to
        // observe our metrics than the default cumulative temporality.
        temporalityPreference: AggregationTemporality.DELTA,
      });
    default:
      throw new Error(
        `Unknown OpenTelemetry metric exporter: ${config.openTelemetryMetricExporter}`,
      );
  }
}

function getSpanProcessor(config: OpenTelemetryConfig): SpanProcessor | null {
  if (typeof config.openTelemetrySpanProcessor === 'object') {
    return config.openTelemetrySpanProcessor;
  }

  const traceExporter = getTraceExporter(config);
  if (!traceExporter) return null;

  switch (config.openTelemetrySpanProcessor ?? 'batch') {
    case 'batch': {
      return new FilterBatchSpanProcessor(traceExporter, filter);
    }
    case 'simple': {
      return new SimpleSpanProcessor(traceExporter);
    }
    default: {
      throw new Error(`Unknown OpenTelemetry span processor: ${config.openTelemetrySpanProcessor}`);
    }
  }
}

/**
 * Should be called once we've loaded our config; this will allow us to set up
 * the correct metadata for the Honeycomb exporter. We don't actually have that
 * information available until we've loaded our config.
 */
export async function init(config: OpenTelemetryConfig) {
  if (!config.openTelemetryEnabled) {
    // If not enabled, do nothing. We used to disable the instrumentations, but
    // per maintainers, that can actually be problematic. See the comments on
    // https://github.com/open-telemetry/opentelemetry-js-contrib/issues/970
    // The Express instrumentation also logs a benign error, which can be
    // confusing to users. There's a fix in progress if we want to switch back
    // to disabling instrumentations in the future:
    // https://github.com/open-telemetry/opentelemetry-js-contrib/pull/972
    return;
  }

  const metricExporter = getMetricExporter(config);
  const spanProcessor = getSpanProcessor(config);

  let sampler: Sampler;
  switch (config.openTelemetrySamplerType ?? 'always-on') {
    case 'always-on': {
      sampler = new AlwaysOnSampler();
      break;
    }
    case 'always-off': {
      sampler = new AlwaysOffSampler();
      break;
    }
    case 'trace-id-ratio': {
      sampler = new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(config.openTelemetrySampleRate),
      });
      break;
    }
    default:
      throw new Error(`Unknown OpenTelemetry sampler type: ${config.openTelemetrySamplerType}`);
  }

  // Much of this functionality is copied from `@opentelemetry/sdk-node`, but
  // we can't use the SDK directly because of the fact that we load our config
  // asynchronously. We need to initialize our instrumentations first; only
  // then can we actually start requiring all of our code that loads our config
  // and ultimately tells us how to configure OpenTelemetry.

  let resource = detectResourcesSync({
    // The AWS resource detector always tries to reach out to the EC2 metadata
    // service endpoint. When running locally, or otherwise in a non-AWS environment,
    // this will typically fail immediately wih `EHOSTDOWN`, but will sometimes wait
    // 5 seconds before failing with a network timeout error. This causes problems
    // when running tests, as 5 seconds is longer than Mocha lets tests and hooks run
    // for by default. This causes nondeterministic test failures when the EC2 metadata
    // request fails with a network timeout.
    //
    // To work around this, the AWS resource detector is only enabled when running in
    // a production environment. In general this is reasonable, as we only care about
    // AWS resource detection in production-like environments.
    detectors: [
      process.env.NODE_ENV === 'production' ? awsEc2Detector : null,
      processDetector,
      envDetector,
    ].filter((d) => !!d),
  });

  if (config.serviceName) {
    resource = resource.merge(
      new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName }),
    );
  }

  // Set up tracing instrumentation.
  const nodeTracerProvider = new NodeTracerProvider({
    sampler,
    resource,
  });
  if (spanProcessor) {
    nodeTracerProvider.addSpanProcessor(spanProcessor);
  }
  nodeTracerProvider.register({
    contextManager: config.contextManager,
  });
  instrumentations.forEach((i) => i.setTracerProvider(nodeTracerProvider));

  // Save the provider so we can shut it down later.
  tracerProvider = nodeTracerProvider;

  // Set up metrics instrumentation if it's enabled.
  if (metricExporter) {
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: config.openTelemetryMetricExportIntervalMillis ?? 30_000,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(meterProvider);
  }
}

/**
 * Gracefully shuts down the OpenTelemetry instrumentation. Should be called
 * when a `SIGTERM` signal is handled.
 */
export async function shutdown(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
  }
}

/**
 * Disables all OpenTelemetry instrumentations. This is useful for tests that
 * need to access the unwrapped modules.
 */
export function disableInstrumentations() {
  instrumentations.forEach((i) => i.disable());
}
