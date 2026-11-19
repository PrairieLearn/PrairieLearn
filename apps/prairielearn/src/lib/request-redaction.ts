const REDACTED = 'REDACTED';

export function redactSensitiveRequestBody(path: string, body: unknown): unknown {
  if (
    path === '/bootstrap' &&
    body != null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.hasOwn(body, 'token')
  ) {
    return { ...body, token: REDACTED };
  }
  return body;
}
