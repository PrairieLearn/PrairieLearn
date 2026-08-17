import { lookup as dnsLookup } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';

import ipaddr from 'ipaddr.js';

export type ResolveAddress = (hostname: string) => Promise<string>;

type LookupAddresses = (hostname: string) => Promise<readonly { address: string }[]>;

export interface PublicUrlRequestOptions {
  headers?: http.OutgoingHttpHeaders;
  maxRedirects?: number;
  timeoutMs?: number;
  /**
   * Overrides public DNS resolution. This is primarily intended for tests; implementations are
   * responsible for returning only validated public addresses.
   */
  resolveAddress?: ResolveAddress;
}

const SENSITIVE_REDIRECT_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

export function isPublicIpAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export function validatePublicHttpUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must use HTTP or HTTPS');
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
 * Makes a streaming GET request to an untrusted public HTTP(S) URL.
 *
 * Every redirect is revalidated and resolved independently. Connections are pinned to the
 * validated address while preserving the original hostname for HTTP and TLS verification.
 */
export async function requestFromPublicUrl(
  initialUrl: URL,
  {
    headers = {},
    maxRedirects = 0,
    timeoutMs = 10_000,
    resolveAddress = resolvePublicAddress,
  }: PublicUrlRequestOptions = {},
): Promise<http.IncomingMessage> {
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new Error('maxRedirects must be a nonnegative integer');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be positive');
  }

  const deadline = Date.now() + timeoutMs;
  let url = initialUrl;
  let requestHeaders = withoutHostHeader(headers);

  for (let redirectCount = 0; ; redirectCount += 1) {
    validatePublicHttpUrl(url);
    const address = await withDeadline(resolveAddress(url.hostname), deadline);
    const response = await requestUrlAtAddress(url, address, requestHeaders, deadline);

    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location;
      response.destroy();
      if (!location || redirectCount >= maxRedirects) {
        throw new Error('Request exceeded the redirect limit');
      }

      const redirectUrl = new URL(location, url);
      if (redirectUrl.origin !== url.origin) {
        requestHeaders = withoutSensitiveHeaders(requestHeaders);
      }
      url = redirectUrl;
      continue;
    }

    return response;
  }
}

function unwrapHostname(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}

function withoutHostHeader(headers: http.OutgoingHttpHeaders): http.OutgoingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'host'),
  );
}

function withoutSensitiveHeaders(headers: http.OutgoingHttpHeaders): http.OutgoingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !SENSITIVE_REDIRECT_HEADERS.has(name.toLowerCase())),
  );
}

function requestUrlAtAddress(
  url: URL,
  address: string,
  headers: http.OutgoingHttpHeaders,
  deadline: number,
): Promise<http.IncomingMessage> {
  const transport = url.protocol === 'https:' ? https : http;
  const originalHostname = unwrapHostname(url.hostname);
  const timeout = Math.max(1, deadline - Date.now());

  return new Promise((resolve, reject) => {
    function clearRequestTimeout() {
      clearTimeout(timeoutId);
    }

    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: address,
        port: url.port || undefined,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        headers: {
          ...headers,
          Host: url.host,
        },
        agent: false,
        ...(url.protocol === 'https:' &&
          !isIP(originalHostname) && { servername: originalHostname }),
      },
      (response) => {
        response.once('end', clearRequestTimeout);
        response.once('close', clearRequestTimeout);
        resolve(response);
      },
    );
    const timeoutId = setTimeout(() => {
      request.destroy(new Error('Request timed out'));
    }, timeout);
    request.once('error', (error) => {
      clearRequestTimeout();
      reject(error);
    });
    request.end();
  });
}

async function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const timeout = Math.max(1, deadline - Date.now());
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Request timed out')), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}
