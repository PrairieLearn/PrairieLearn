export const LTI_USER_AGENT = 'PrairieLearn (prairielearn.com; support@prairielearn.com)';

type LtiRequestInit = Omit<RequestInit, 'body'> & {
  body?: RequestInit['body'] | Uint8Array<ArrayBufferLike>;
};

export function fetchWithLtiUserAgent(
  input: RequestInfo | URL,
  init?: LtiRequestInit,
): Promise<Response> {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set('User-Agent', LTI_USER_AGENT);

  const body = init?.body instanceof Uint8Array ? new Uint8Array(init.body) : init?.body;
  return fetch(input, { ...init, body, headers });
}
