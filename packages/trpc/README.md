# `@prairielearn/trpc`

Shared tRPC infrastructure for PrairieLearn applications. Import from an explicit subpath so that browser builds cannot pull in server-only dependencies.

| Subpath                      | Public API                                                           |
| ---------------------------- | -------------------------------------------------------------------- |
| `@prairielearn/trpc/server`  | `appErrorFormatter`, `throwAppError`, and application-error types    |
| `@prairielearn/trpc/client`  | `AppError`, `AppErrorRenderers`, `getAppError`, and `renderAppError` |
| `@prairielearn/trpc/react`   | `AppErrorAlert` and `QueryClientProviderDebug`                       |
| `@prairielearn/trpc/express` | `isTrpcRequest`, `isMultipartRequest`, and `formatTrpcErrorResponse` |

## Typed error maps

The server and client intentionally resolve a whole procedure error map differently:

- `throwAppError<WholeErrorMap>` accepts only variants shared by every procedure. This prevents a helper that can run for every procedure from throwing an error that some procedures did not declare.
- `getAppError<WholeErrorMap>` returns the union of all procedure variants. This supports a client component that handles failures from several procedures.

For a single procedure, pass its map entry to either helper, such as `throwAppError<WidgetError['Update']>(...)` or `getAppError<WidgetError['Update']>(error)`.

## Express errors before the adapter

`formatTrpcErrorResponse` builds the SuperJSON-wrapped tRPC error response used when authentication, authorization, CSRF, or other Express middleware fails before the tRPC adapter runs. Its numeric JSON-RPC code is sourced from tRPC's own `TRPC_ERROR_CODES_BY_KEY` constants.

Error IDs generated for normal Express errors and adapter errors remain server-side and correlate application logs with error reporting. The shared response shape does not expose an error ID to clients; doing that consistently for both pre-adapter and adapter errors would be a separate protocol change.
