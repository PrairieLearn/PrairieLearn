import {
  CourseAgentCapabilitySchema,
  CourseAgentControlCapabilitySchema,
  type CourseAgentStartRunRequest,
} from '@prairielearn/course-agent-protocol';

export function githubRepositoryUrl(repository: string) {
  const sshMatch = /^git@github\.com:(.+?)(?:\.git)?$/.exec(repository);
  const sshUrlMatch = /^ssh:\/\/git@github\.com\/(.+?)(?:\.git)?$/.exec(repository);
  const httpsMatch = /^https:\/\/github\.com\/(.+?)(?:\.git)?\/?$/.exec(repository);
  const path = sshMatch?.[1] ?? sshUrlMatch?.[1] ?? httpsMatch?.[1];
  if (!path || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(path)) {
    throw new Error('Course-agent repositories must be hosted on github.com');
  }
  return `https://x-access-token:proxy-injected@github.com/${path}.git`;
}

export function publicGithubRepositoryUrl(repository: string) {
  return githubRepositoryUrl(repository).replace('x-access-token:proxy-injected@', '');
}

export async function decodeAndVerifyToken(token: string, secret: string) {
  const [encodedSignature, date, encodedData, ...rest] = token.split('.');
  if (!encodedSignature || !date || !encodedData || rest.length > 0) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${date}.${encodedData}`)),
  );
  const hex = [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const expected = btoa(hex).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  if (expected.length !== encodedSignature.length) return null;
  let matches = 0;
  for (let i = 0; i < expected.length; i++) {
    matches |= expected.charCodeAt(i) ^ encodedSignature.charCodeAt(i);
  }
  if (matches !== 0) return null;
  try {
    const paddedData = encodedData
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(encodedData.length / 4) * 4, '=');
    return JSON.parse(atob(paddedData)) as unknown;
  } catch {
    return null;
  }
}

async function sha256Hex(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function authorizeRun(request: CourseAgentStartRunRequest, secret: string) {
  const capability = CourseAgentCapabilitySchema.parse(
    await decodeAndVerifyToken(request.capability, secret),
  );
  if (
    capability.conversationId !== request.conversationId ||
    capability.runId !== request.runId ||
    capability.sandboxId !== request.sandboxId ||
    capability.courseId !== request.course.id ||
    capability.repository !== request.course.repository ||
    capability.branch !== request.course.branch ||
    capability.callbackOrigin !== request.callbackOrigin ||
    capability.promptDigest !== (await sha256Hex(request.prompt)) ||
    new Date(capability.expiresAt) <= new Date()
  ) {
    throw new Error('Run capability does not authorize this request');
  }
}

export async function authorizeControl({
  token,
  conversationId,
  sandboxId,
  secret,
}: {
  token: string;
  conversationId: string;
  sandboxId: string;
  secret: string;
}) {
  const capability = CourseAgentControlCapabilitySchema.parse(
    await decodeAndVerifyToken(token, secret),
  );
  if (
    capability.action !== 'kill' ||
    capability.conversationId !== conversationId ||
    capability.sandboxId !== sandboxId ||
    new Date(capability.expiresAt) <= new Date()
  ) {
    throw new Error('Control capability does not authorize this request');
  }
}
