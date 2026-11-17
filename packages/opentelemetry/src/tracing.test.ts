import { propagation } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { afterAll, afterEach, assert, beforeAll, describe, it } from 'vitest';

import { SpanStatusCode, context, init, instrumented, shutdown, trace } from './index.js';

describe('instrumented', () => {
  const exporter = new InMemorySpanExporter();

  beforeAll(async () => {
    await init({
      openTelemetryEnabled: true,
      openTelemetryExporter: exporter,
      openTelemetrySamplerType: 'always-on',
      openTelemetrySpanProcessor: 'simple',
    });
  });

  afterEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await shutdown();
    context.disable();
    trace.disable();
    propagation.disable();
  });

  it('returns the value from the function', async () => {
    const res = await instrumented('test', () => 'foo');
    assert.equal(res, 'foo');
  });

  it('records a span on success', async () => {
    await instrumented('test-success', () => 'foo');

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
    const spans = exporter.getFinishedSpans();
    assert.lengthOf(spans, 1);
    assert.equal(spans[0].name, 'test-failure');
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR);
    assert.equal(spans[0].status.message, 'foo');
    assert.equal(spans[0].events[0].name, 'exception');
  });

  it('preserves parent spans across asynchronous work', async () => {
    await instrumented('parent', async (parent) => {
      await Promise.resolve();
      assert.strictEqual(trace.getSpan(context.active()), parent);
      await instrumented('child', async () => {
        await Promise.resolve();
      });
      assert.strictEqual(trace.getSpan(context.active()), parent);
    });

    const [child, parent] = exporter.getFinishedSpans();
    assert.equal(child.parentSpanContext?.spanId, parent.spanContext().spanId);
    assert.equal(child.spanContext().traceId, parent.spanContext().traceId);
  });

  it('propagates W3C trace context and baggage', async () => {
    const headers = {
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      baggage: 'example=value',
    };
    const extracted = propagation.extract(context.active(), headers);
    await context.with(extracted, async () => {
      await instrumented('incoming', async (span) => {
        const carrier: Record<string, string> = {};
        propagation.inject(context.active(), carrier);
        assert.include(carrier.traceparent, span.spanContext().spanId);
        assert.equal(carrier.baggage, headers.baggage);
      });
    });
    const [span] = exporter.getFinishedSpans();
    assert.equal(span.parentSpanContext?.spanId, 'b7ad6b7169203331');
    assert.equal(span.spanContext().traceId, '0af7651916cd43dd8448eb211c80319c');
  });
});
