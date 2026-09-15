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
