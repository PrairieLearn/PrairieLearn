---
'@prairielearn/opentelemetry': minor
---

- Add support for an `incomingHttpRequestHook` function that can be used to add specific attributes to the root span of an incoming HTTP request
- Add `ForceSampleSampler`
  - When using the `id-trace-ratio` sampler, if a span contains a `force_sample` attribute with value `true`, the span will be forcibly sampled
