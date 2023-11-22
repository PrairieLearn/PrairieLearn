import { Span, SpanStatusCode, trace } from '@opentelemetry/api';

export async function instrumented<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  return trace
    .getTracer('default')
    .startActiveSpan<(span: Span) => Promise<T>>(name, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (e: any) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e.message,
        });
        span.recordException(e);
        throw e;
      } finally {
        span.end();
      }
    });
}
