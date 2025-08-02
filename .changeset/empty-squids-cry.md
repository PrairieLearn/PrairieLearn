---
'@prairielearn/opentelemetry': major
---

Always configure `NodeTracerProvider`, even when `openTelemetryEnabled === false`.

This change is being made to ensure that Sentry's request isolation works correctly, as it relies on the `NodeTracerProvider` being set up.
