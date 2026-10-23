const REDACTED = 'REDACTED';

export function redactSensitiveRequestBody(path: string, body: unknown): unknown {
  if (
    path === '/bootstrap' &&
    body != null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.hasOwn(body, 'jwt')
  ) {
    return { ...body, jwt: REDACTED };
  }
  return body;
}
