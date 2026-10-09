import { isIP } from 'node:net';

import ipaddr from 'ipaddr.js';

export type LookupAddresses = (hostname: string) => Promise<readonly { address: string }[]>;

export function isPublicIpAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export async function resolvePublicAddressWithLookup(
  hostname: string,
  lookupAddresses: LookupAddresses,
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

export function unwrapHostname(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}
