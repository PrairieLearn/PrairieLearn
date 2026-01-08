---
'@prairielearn/ui': minor
---

Add accessible OtpInput component for alphanumeric code entry inputs. Features include:

- Single hidden input with visual character boxes (React Spectrum pattern)
- Configurable visual grouping via `groupPattern` (e.g., [3, 3, 4] for ABC-DEF-GHIJ format)
- Focus ring stays on last box when code is complete (addresses accessibility review)
- Keyboard navigation support
- Integration with `autoComplete="one-time-code"` for browser autofill
