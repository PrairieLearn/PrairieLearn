/**
 * Normalizes a base URL path and appends '/trpc' to construct the tRPC endpoint URL.
 * Strips query parameters and trailing slashes to prevent path mismatches
 * between client and server CSRF token generation.
 */
export function buildTrpcUrl(basePath: string): string {
  return basePath.split('?')[0].replace(/\/$/, '') + '/trpc';
}
