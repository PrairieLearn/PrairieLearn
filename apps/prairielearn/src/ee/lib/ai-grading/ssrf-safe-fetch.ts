import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blockedV4 = new BlockList();
blockedV4.addSubnet('0.0.0.0', 8, 'ipv4');
blockedV4.addSubnet('10.0.0.0', 8, 'ipv4');
blockedV4.addSubnet('100.64.0.0', 10, 'ipv4');
blockedV4.addSubnet('127.0.0.0', 8, 'ipv4');
blockedV4.addSubnet('169.254.0.0', 16, 'ipv4');
blockedV4.addSubnet('172.16.0.0', 12, 'ipv4');
blockedV4.addSubnet('192.168.0.0', 16, 'ipv4');
blockedV4.addSubnet('198.18.0.0', 15, 'ipv4');

const blockedV6 = new BlockList();
blockedV6.addAddress('::', 'ipv6');
blockedV6.addAddress('::1', 'ipv6');
blockedV6.addSubnet('fc00::', 7, 'ipv6');
blockedV6.addSubnet('fe80::', 10, 'ipv6');
blockedV6.addSubnet('2001:db8::', 32, 'ipv6');

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

export class UnsafeAiEndpointUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeAiEndpointUrlError';
  }
}

function ipv4FromMappedIpv6(address: string): string | null {
  const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  return match?.[1] ?? null;
}

export function isBlockedIpAddress(address: string): boolean {
  const mapped = ipv4FromMappedIpv6(address);
  const checkAddress = mapped ?? address;
  const version = isIP(checkAddress);
  if (version === 4) return blockedV4.check(checkAddress, 'ipv4');
  if (version === 6) return blockedV6.check(checkAddress, 'ipv6');
  return true;
}

function parseAiEndpointUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeAiEndpointUrlError('Enter a valid HTTPS URL, including https://.');
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeAiEndpointUrlError('Custom endpoints must use HTTPS.');
  }
  if (url.username || url.password) {
    throw new UnsafeAiEndpointUrlError('Custom endpoint URLs cannot include credentials.');
  }
  if (!url.hostname) {
    throw new UnsafeAiEndpointUrlError('Enter a valid HTTPS URL, including https://.');
  }
  return url;
}

export function normalizeAiEndpointBaseUrl(raw: string): string {
  const url = parseAiEndpointUrl(raw);
  // Instructors should include the API root (typically /v1). Drop only a trailing slash.
  const normalized = url.href.replace(/\/+$/, '');
  return normalized;
}

type LookupFn = (hostname: string) => Promise<readonly { address: string; family: number }[]>;

async function defaultLookup(hostname: string) {
  return await dnsLookup(hostname, { all: true, verbatim: true });
}

export async function assertSafeAiEndpointUrl(
  raw: string,
  lookup: LookupFn = defaultLookup,
): Promise<URL> {
  const url = parseAiEndpointUrl(raw);
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new UnsafeAiEndpointUrlError('This hostname cannot be used as a custom AI endpoint.');
  }

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new UnsafeAiEndpointUrlError('This address cannot be used as a custom AI endpoint.');
    }
    return url;
  }

  let records: readonly { address: string; family: number }[];
  try {
    records = await lookup(hostname);
  } catch {
    throw new UnsafeAiEndpointUrlError('Could not resolve the custom endpoint hostname.');
  }

  if (records.length === 0) {
    throw new UnsafeAiEndpointUrlError('Could not resolve the custom endpoint hostname.');
  }

  for (const record of records) {
    if (isBlockedIpAddress(record.address)) {
      throw new UnsafeAiEndpointUrlError('This hostname cannot be used as a custom AI endpoint.');
    }
  }

  return url;
}

/**
 * Fetch wrapper that rejects private, loopback, and link-local destinations
 * before connecting. Redirects are not followed, so a later hop cannot land
 * on an internal address.
 */
export function createSsrfSafeFetch({
  lookup = defaultLookup,
  fetchFunction = fetch,
}: {
  lookup?: LookupFn;
  fetchFunction?: typeof fetch;
} = {}): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    await assertSafeAiEndpointUrl(url, lookup);
    return await fetchFunction(input, { ...init, redirect: 'error' });
  };
}
