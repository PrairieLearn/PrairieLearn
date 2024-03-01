import { tracing } from '@opentelemetry/sdk-node';
import { assert } from 'chai';

import { context, init, instrumented, trace, SpanStatusCode } from './index';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

describe('instrumented', () => {
  let contextManager: AsyncHooksContextManager;
  const exporter = new tracing.InMemorySpanExporter();
  const spanProcessor = new tracing.SimpleSpanProcessor(exporter);

  before(async () => {
    await init({
      openTelemetryEnabled: true,
      openTelemetryExporter: exporter,
      openTelemetrySamplerType: 'always-on',
      openTelemetrySpanProcessor: spanProcessor,
    });
  });

  beforeEach(async () => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
  });

  afterEach(async () => {
    await spanProcessor.forceFlush();
    exporter.reset();
    context.disable();
  });

  it('returns the value from the function', async () => {
    const res = await instrumented('test', () => 'foo');
    assert.equal(res, 'foo');
  });

  it('records a span on success', async () => {
    await instrumented('test-success', () => 'foo');

    await spanProcessor.forceFlush();
    const spans = exporter.getFinishedSpans();
    assert.lengthOf(spans, 1);
    assert.equal(spans[0].name, 'test-success');
    assert.equal(spans[0].status.code, SpanStatusCode.OK);
  });

  it('records a span on failure', async () => {
    let maybeError: Error | null = null;

    try {
      await instrumented('test-failure', () => {
        throw new Error('foo');
      });
    } catch (err: any) {
      maybeError = err;
    }

    // Ensure the error was propagated back to the caller.
    assert.equal(maybeError?.message, 'foo');

    // Ensure the correct span was recorded.
    await spanProcessor.forceFlush();
    const spans = exporter.getFinishedSpans();
    assert.lengthOf(spans, 1);
    assert.equal(spans[0].name, 'test-failure');
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR);
    assert.equal(spans[0].status.message, 'foo');
    assert.equal(spans[0].events[0].name, 'exception');
  });

  it('sets up context correctly', async () => {
    const tracer = trace.getTracer('default');
    const parentSpan = tracer.startSpan('parentSpan');
    const parentContext = trace.setSpan(context.active(), parentSpan);

    await instrumented('test', async () => {
      const childContext = context.active();
      assert.notStrictEqual(childContext, parentContext);
    });
  });
});
