---
'@prairielearn/sentry': major
'@prairielearn/opentelemetry': patch
---

Upgrade to Sentry v11, remove the obsolete SentryContextManager export, and link errors to independently managed OpenTelemetry traces. Preserve manual Express error capture and restrictive data collection defaults.
