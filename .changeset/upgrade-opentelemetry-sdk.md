---
'@prairielearn/opentelemetry': major
---

Upgrade to OpenTelemetry SDK 3, API 1.10, and the latest instrumentation packages. Replace the deprecated trace SDK packages with `@opentelemetry/sdk-trace` and retain W3C trace context and baggage propagation with an AsyncLocalStorage context manager. Custom span exporters and processors must be compatible with SDK 3. Trace limits and batch processor settings now use SDK defaults rather than `OTEL_SPAN_*`, `OTEL_ATTRIBUTE_*`, and `OTEL_BSP_*` environment variables.
