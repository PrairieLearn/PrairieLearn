import type { Request } from 'express';

export function getClientIpAddress(req: Request): string | undefined {
  // Node may represent IPv4 client addresses as IPv4-mapped IPv6 addresses.
  const ipAddress = req.ip;
  return ipAddress?.toLowerCase().startsWith('::ffff:') ? ipAddress.slice(7) : ipAddress;
}
