import { TRPC_ERROR_CODES_BY_KEY, type TRPC_ERROR_CODE_KEY } from '@trpc/server/rpc';

export interface TrpcRequestLike {
  header(name: string): string | undefined;
  originalUrl: string;
}

export interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Returns true for a tRPC HTTP-link request whose procedure is mounted below a `trpc` path segment.
 */
export function isTrpcRequest(req: TrpcRequestLike): boolean {
  // This header is spoofable; the URL path is what Express actually uses to dispatch.
  if (req.header('X-TRPC') !== 'true') return false;
  const pathOnly = req.originalUrl.split('?')[0];
  const segments = pathOnly.split('/');
  return segments.at(-2) === 'trpc';
}

/**
 * Returns true when a request has a multipart/form-data content type.
 *
 * Use this to skip JSON and URL-encoded body parsers for file uploads and tRPC `FormData` inputs.
 * Even when those parsers do not consume multipart data, they can assign an empty `req.body` that
 * prevents the tRPC Express adapter from reading the original stream.
 */
export function isMultipartRequest(req: RequestWithHeaders): boolean {
  const contentTypeEntry = Object.entries(req.headers).find(
    ([headerName]) => headerName.toLowerCase() === 'content-type',
  );
  const contentType = contentTypeEntry?.[1];
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return value?.toLowerCase().startsWith('multipart/form-data') ?? false;
}

const HTTP_STATUS_TO_TRPC_ERROR_CODE: Partial<Record<number, TRPC_ERROR_CODE_KEY>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  402: 'PAYMENT_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_SUPPORTED',
  408: 'TIMEOUT',
  409: 'CONFLICT',
  412: 'PRECONDITION_FAILED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_CONTENT',
  428: 'PRECONDITION_REQUIRED',
  429: 'TOO_MANY_REQUESTS',
  499: 'CLIENT_CLOSED_REQUEST',
  500: 'INTERNAL_SERVER_ERROR',
  501: 'NOT_IMPLEMENTED',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

export interface TrpcErrorResponse {
  error: {
    json: {
      message: string;
      code: number;
      data: {
        code: TRPC_ERROR_CODE_KEY;
        httpStatus: number;
        stack?: string;
      };
    };
  };
}

/**
 * Formats an error thrown before the tRPC adapter as a SuperJSON-compatible tRPC response.
 */
export function formatTrpcErrorResponse({
  status,
  message,
  stack,
}: {
  status: number;
  message: string;
  stack?: string;
}): TrpcErrorResponse {
  const code = HTTP_STATUS_TO_TRPC_ERROR_CODE[status] ?? 'INTERNAL_SERVER_ERROR';

  return {
    error: {
      json: {
        message,
        code: TRPC_ERROR_CODES_BY_KEY[code],
        data: {
          code,
          httpStatus: status,
          ...(stack === undefined ? {} : { stack }),
        },
      },
    },
  };
}
