const process = require('process');
const { Metadata, credentials } = require('@grpc/grpc-js');

const { NodeSDK, tracing: { ConsoleSpanExporter } } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector-grpc');
const { ExpressLayerType } = require('@opentelemetry/instrumentation-express');
const {
  ExportResultCode,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
  AlwaysOffSampler,
} = require('@opentelemetry/core');

/**
 * Will (possibly) contain a `SpanExporter` that will export to Honeycomb, the
 * console, or somewhere else, depending on what `config.openTelemetryExporter`
 * is configured as. The creation of that exporter is deferred until we've been
 * able to load the config.
 * 
 * @type {import('@opentelemetry/sdk-trace-base').SpanExporter | undefined}
 */
let maybeExporter;

/** Indicates whether trace exporting has been stopped with `shutdown()`. */
let delayedTraceExporterStopped = false;

/**
 * Stores spans that are emitted between the initialization of the SDK and
 * the point in time when we've finally loaded our config and can omit the
 * spans to the configured collector.
 * 
 * @type {[import('@opentelemetry/sdk-trace-base').ReadableSpan[], (result: import('@opentelemetry/core').ExportResult) => void][]}
 */
const bufferedSpans = [];

const MAX_BUFFERED_SPANS = 1000;

/**
 * Ideally, we'd be able to immediately load our config and create a
 * `CollectorTraceExporter` here that we can provide directly to the `NodeSDK`.
 * However, to actually load the config, we end up requiring things that
 * in turn actually require some of the modules that `NodeSDK` needs to
 * instrument, including `https` and `pg`. To work around that, we introduce a
 * custom collector that allows us to delay sending traces until we've been
 * able to load our config and create an exporter with the correct secrets from
 * our config.
 * 
 * @type {import('@opentelemetry/sdk-trace-base').SpanExporter & { flushToExporter: () => void }}
 */
const delayedTraceExporter = {
  export(spans, resultCallback) {
    if (delayedTraceExporterStopped) {
      // Drop trace; we don't need to do anything with it. We'll report success
      // so that an error doesn't get propagated.
      return resultCallback({ code: ExportResultCode.SUCCESS });
    }
    if (maybeExporter) {
      maybeExporter.export(spans, resultCallback);
    } else {
      // Buffer spans until we possibly have a honeycomb exporter to use.
      bufferedSpans.push([spans, resultCallback]);

      // Ensure we don't keep more than `MAX_BUFFERED_SPANS` in memory.
      while (bufferedSpans.length > MAX_BUFFERED_SPANS) {
        bufferedSpans.shift();
      }
    }
  },

  async shutdown() {
    if (maybeExporter) {
      // Forward shutdown to the wrapped exporter.
      await maybeExporter.shutdown();
    }
  },

  flushToExporter() {
    if (!maybeExporter) return;

    bufferedSpans.forEach(([spans, resultCallback]) => {
      maybeExporter.export(spans, resultCallback);
    });
  },
};

/** @typedef {import('@opentelemetry/api').Sampler} Sampler */

/**
 * The sample rate is configurable, but our configuration isn't actually loaded
 * until after the SDK is constructed. So that we can update the sampler and the
 * sample rate, this sampler wraps another sampler that we can adjust after it's
 * been constructed.
 *
 * @implements {Sampler}
 */
class ConfigurableSampler {
  constructor() {
    this._sampler = new AlwaysOnSampler();
  }

  shouldSample(...args) {
    return this._sampler.shouldSample(...args);
  }

  /**
   * Updates the underlying sampler that's used.
   * 
   * @param {Sampler} sampler 
   */
  setSampler(sampler) {
    this._sampler = sampler;
  }

  toString() {
    return this._sampler.toString();
  }
}

const sampler = new ConfigurableSampler();

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'prairielearn',
  }),
  traceExporter: delayedTraceExporter,
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-express': {
      // We use a lot of middleware; it makes the traces way too noisy. If we
      // want telementry on a particular middleware, we should instrument it
      // manually.
      ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
    },
  })],
  sampler,
});

/** @type {(() => void)[]} */
const startupCallbacks = [];

function onSdkStart() {
  startupCallbacks.forEach((callback) => callback());
}

sdk.start()
  .then(() => onSdkStart())
  .catch((error) => {
    console.error('Error initializing tracing', error);
    // Even if we failed to start, still inform anyone waiting on that. We can
    // run without the tracing SDK just fine.
    onSdkStart();
  });

process.on('SIGTERM', () => {
  sdk.shutdown()
    .catch((error) => console.error('Error terminating tracing', error))
    .finally(() => process.exit(0));
});

/**
 * Should be called once we've loaded our config; this will allow us to set up
 * the correct metadata for the Honeycomb exporter. We don't actually have that
 * information available until we've loaded our config.
 * 
 * @param {import('./config')} config 
 */
module.exports.init = async function init(config) {
  if (!config.openTelemetryEnabled) {
    // Shut down the SDK to remove all instrumentation.
    // It's important that we flag the delayed trace exporter as stopped here,
    // since the SDK will try to export all outstanding events here and that
    // needs to succeed. Otherwise, we get a timeout.
    delayedTraceExporterStopped = true;
    await sdk.shutdown();
  } else {
    switch (config.openTelemetryExporter) {
      case 'console': {
        // Export spans to the console for testing purposes.
        maybeExporter = new ConsoleSpanExporter();
        break;
      }
      case 'honeycomb': {
        // Create a Honeycomb exporter with the appropriate metadata from the
        // config we've been provided with.
        const metadata = new Metadata();

        metadata.set('x-honeycomb-team', config.honeycombApiKey);
        metadata.set('x-honeycomb-dataset', config.honeycombDataset);

        maybeExporter = new CollectorTraceExporter({
          url: 'grpc://api.honeycomb.io:443/',
          credentials: credentials.createSsl(),
          metadata,
        });
        break;
      }
      default:
        throw new Error(`Unknown OpenTelemetry exporter: ${config.openTelemetryExporter}`);
    }

    switch (config.openTelemetrySamplerType) {
      case 'always-on': {
        sampler.setSampler(new AlwaysOnSampler());
        break;
      }
      case 'always-off': {
        sampler.setSampler(new AlwaysOffSampler());
        break;
      }
      case 'trace-id-ratio': {
        sampler.setSampler(new ParentBasedSampler({
          root: new TraceIdRatioBasedSampler(config.openTelemetrySampleRate),
        }));
        break;
      }
      default:
        throw new Error(`Unknown OpenTelemetry sampler type: ${config.openTelemetrySamplerType}`);
    }

    // Flush any buffered traces to the newly-created exporter.
    delayedTraceExporter.flushToExporter();
  }
};

/**
 * Allows server initialization code to wait for the tracing SDK to start
 * before proceeding. This ensures that everything after that can be
 * instrumented correctly.
 * 
 * @returns {Promise<void>}
 */
module.exports.waitForStart = () => {
  return new Promise((resolve) => {
    startupCallbacks.push(resolve);
  });
};
