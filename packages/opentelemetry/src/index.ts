import process from 'process';
import { Metadata, credentials } from '@grpc/grpc-js';

import { tracing } from '@opentelemetry/sdk-node';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { detectResources, Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-grpc';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Sampler } from '@opentelemetry/api';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
  AlwaysOffSampler,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';

// Instrumentations go here.
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { ConnectInstrumentation } from '@opentelemetry/instrumentation-connect';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

// Resource detectors go here.
import { awsEc2Detector } from '@opentelemetry/resource-detector-aws';
import { processDetector, envDetector } from '@opentelemetry/resources';

/**
 * Extends `BatchSpanProcessor` to give it the ability to filter out spans
 * before they're queued up to send. This enhances our samping process so
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

const instrumentations = [
  new AwsInstrumentation(),
  new ConnectInstrumentation(),
  new DnsInstrumentation(),
  new ExpressInstrumentation({
    // We use a lot of middleware; it makes the traces way too noisy. If we
    // want telementry on a particular middleware, we should instrument it
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
  new PgInstrumentation(),
  new RedisInstrumentation(),
];

// Enable all instrumentations now, even though we haven't configured our
// span processors or trace exporters yet. We'll set those up later.
instrumentations.forEach((i) => {
  i.enable();
});

export interface OpenTelemetryConfig {
  openTelemetryEnabled: boolean;
  openTelemetryExporter?: 'console' | 'honeycomb';
  openTelemetrySamplerType?: 'always-on' | 'always-off' | 'trace-id-ratio';
  openTelemetrySampleRate?: number;
  honeycombApiKey?: string;
  honeycombDataset?: string;
  serviceName?: string;
}

/**
 * Should be called once we've loaded our config; this will allow us to set up
 * the correct metadata for the Honeycomb exporter. We don't actually have that
 * information available until we've loaded our config.
 */
export async function init(config: OpenTelemetryConfig) {
  if (!config.openTelemetryEnabled) {
    // Just disable all of the OTEL instrumentations to avoid any unnecessary overhead.
    instrumentations.forEach((i) => i.disable());
    return;
  }

  let exporter: SpanExporter;
  switch (config.openTelemetryExporter) {
    case 'console': {
      // Export spans to the console for testing purposes.
      exporter = new tracing.ConsoleSpanExporter();
      break;
    }
    case 'honeycomb': {
      // Create a Honeycomb exporter with the appropriate metadata from the
      // config we've been provided with.
      const metadata = new Metadata();

      metadata.set('x-honeycomb-team', config.honeycombApiKey);
      metadata.set('x-honeycomb-dataset', config.honeycombDataset);

      exporter = new OTLPTraceExporter({
        url: 'grpc://api.honeycomb.io:443/',
        credentials: credentials.createSsl(),
        metadata,
      });
      break;
    }
    default:
      throw new Error(`Unknown OpenTelemetry exporter: ${config.openTelemetryExporter}`);
  }

  let sampler: Sampler;
  switch (config.openTelemetrySamplerType) {
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

  let resource = await detectResources({
    detectors: [awsEc2Detector, processDetector, envDetector],
  });

  if (config.serviceName) {
    resource = resource.merge(
      new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName })
    );
  }

  const tracerProvider = new NodeTracerProvider({
    sampler,
    resource,
  });
  const spanProcessor = new FilterBatchSpanProcessor(exporter, filter);
  tracerProvider.addSpanProcessor(spanProcessor);
  tracerProvider.register();

  instrumentations.forEach((i) => i.setTracerProvider(tracerProvider));

  // When the process starts shutting down, terminate OTEL stuff.
  process.on('SIGTERM', () => {
    tracerProvider.shutdown().catch((error) => console.error('Error terminating tracing', error));
  });
}

export { trace, context, SpanStatusCode } from '@opentelemetry/api';
export { suppressTracing } from '@opentelemetry/core';
