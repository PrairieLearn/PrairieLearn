import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { SecureContextOptions } from 'node:tls';

import ipaddr from 'ipaddr.js';
import {
  Agent,
  Request,
  type RequestInfo,
  type RequestInit,
  type Response,
  buildConnector,
  fetch as undiciFetch,
} from 'undici';

export type ResolveAddress = (hostname: string) => Promise<string>;

type LookupAddresses = (hostname: string) => Promise<readonly { address: string }[]>;

export type PublicFetchInit = Omit<RequestInit, 'dispatcher'>;
export type PublicFetch = (input: RequestInfo, init?: PublicFetchInit) => Promise<Response>;

const defaultConnector = buildConnector({});

export function isPublicIpAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export function validatePublicHttpsUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new Error('URL must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('URL must not contain credentials');
  }
}

export async function resolvePublicAddress(
  hostname: string,
  {
    lookupAddresses = async (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  }: { lookupAddresses?: LookupAddresses } = {},
): Promise<string> {
  const unwrappedHostname = unwrapHostname(hostname);
  const addresses = isIP(unwrappedHostname)
    ? [{ address: unwrappedHostname }]
    : await lookupAddresses(unwrappedHostname);

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('Host did not resolve to a public address');
  }
  return addresses[0].address;
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

function unwrapHostname(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}
