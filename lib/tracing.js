const process = require('process');
const { Metadata, credentials } = require('@grpc/grpc-js');

const { NodeSDK, tracing: { ConsoleSpanExporter } } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector-grpc');

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
let traceExporterStopped = false;

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
    if (traceExporterStopped) {
      // Drop trace; we don't need to do anything with it.
      return resultCallback({});
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
    traceExporterStopped = true;
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

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'prairietest',
  }),
  traceExporter: delayedTraceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start()
  .then(() => console.log('Tracing initialized'))
  .catch((error) => console.log('Error initializing tracing', error));

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
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
    await sdk.shutdown();
  } else {
    if (config.openTelemetryExporter === 'console') {
      // Export spans to the console for testing purposes.
      maybeExporter = new ConsoleSpanExporter();
    } else if (config.openTelemetryExporter === 'honeycomb') {
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
    } else {
      throw new Error(`Unknown OpenTelemetry exporter: ${config.openTelemetryExporter}`);
    }

    // Flush any buffered traces to the newly-created exporter.
    delayedTraceExporter.flushToExporter();
  }
};
