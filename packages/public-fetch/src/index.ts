import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { SecureContextOptions } from 'node:tls';

import {
  Agent,
  Request,
  type RequestInfo,
  type RequestInit,
  type Response,
  buildConnector,
  fetch as undiciFetch,
} from 'undici';

import { resolvePublicAddressWithLookup, unwrapHostname } from './network.js';

export type ResolveAddress = (hostname: string) => Promise<string>;

export type PublicFetchInit = Omit<RequestInit, 'dispatcher'>;
export type PublicFetch = (input: RequestInfo, init?: PublicFetchInit) => Promise<Response>;

const defaultConnector = buildConnector({});

export function validatePublicHttpsUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new Error('URL must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('URL must not contain credentials');
  }
}

async function resolvePublicAddress(hostname: string): Promise<string> {
  return resolvePublicAddressWithLookup(hostname, (hostname) =>
    dnsLookup(hostname, { all: true, verbatim: true }),
  );
}

/**
 * Creates a Fetch-compatible function that only connects to public HTTPS destinations.
 *
 * The resolver is injectable so callers can use controlled DNS behavior in tests. Production
 * callers should generally use {@link publicFetch} instead.
 */
export function createPublicFetch({
  resolveAddress = resolvePublicAddress,
  ca,
}: { resolveAddress?: ResolveAddress; ca?: SecureContextOptions['ca'] } = {}): PublicFetch {
  const connector = ca == null ? defaultConnector : buildConnector({ ca });
  const dispatcher = new Agent({
    connect(options, callback) {
      if (options.protocol !== 'https:') {
        callback(new Error('URL must use HTTPS'), null);
        return;
      }

      const originalHostname = unwrapHostname(options.hostname);
      void resolveAddress(originalHostname).then(
        (address) => {
          connector(
            {
              ...options,
              hostname: address,
              ...(!isIP(originalHostname) && { servername: originalHostname }),
            },
            callback,
          );
        },
        (error: unknown) => {
          callback(error instanceof Error ? error : new Error(String(error)), null);
        },
      );
    },
  });

  return async (input, init) => {
    const request = new Request(input, init);
    validatePublicHttpsUrl(new URL(request.url));

    // Undici allows overriding Host, unlike browsers. Always derive it from the validated URL.
    request.headers.delete('host');
    return undiciFetch(request, { dispatcher });
  };
}

export const publicFetch = createPublicFetch();

/** Thrown when a response body exceeds the caller's byte limit. */
export class ResponseTooLargeError extends Error {
  constructor() {
    super('The response body exceeds the byte limit.');
    this.name = 'ResponseTooLargeError';
  }
}

/** Reads a response body with a byte limit, canceling the stream if it is exceeded. */
export async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a nonnegative safe integer.');
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new ResponseTooLargeError();
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response.body ?? []) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw new ResponseTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes);
}
