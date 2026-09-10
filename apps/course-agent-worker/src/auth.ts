import {
  CourseAgentInspectCapabilitySchema,
  CourseAgentRunCapabilitySchema,
  type CourseAgentSnapshotRequest,
  type CourseAgentStartRunRequest,
} from '@prairielearn/course-agent-protocol';

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
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) {
    mismatch |= expected.charCodeAt(index) ^ encodedSignature.charCodeAt(index);
  }
  if (mismatch !== 0) return null;
  try {
    const paddedData = encodedData
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(encodedData.length / 4) * 4, '=');
    const data = Uint8Array.from(atob(paddedData), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(data)) as unknown;
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

function assertNotExpired(expiresAt: string) {
  if (new Date(expiresAt) <= new Date()) throw new Error('Course-agent capability has expired');
}

function sameAuthoringContext(
  capability: CourseAgentStartRunRequest['authoringContext'],
  request: CourseAgentStartRunRequest['authoringContext'],
) {
  if (!capability.courseInstance || !request.courseInstance) {
    return capability.courseInstance === request.courseInstance;
  }
  return (
    capability.courseInstance.id === request.courseInstance.id &&
    capability.courseInstance.shortName === request.courseInstance.shortName &&
    capability.courseInstance.longName === request.courseInstance.longName
  );
}

export async function authorizeRun(request: CourseAgentStartRunRequest, secret: string) {
  const capability = CourseAgentRunCapabilitySchema.parse(
    await decodeAndVerifyToken(request.capability, secret),
  );
  if (
    capability.conversationId !== request.conversationId ||
    capability.runId !== request.runId ||
    capability.sandboxId !== request.sandboxId ||
    capability.promptDigest !== (await sha256Hex(request.prompt)) ||
    JSON.stringify(capability.workspaceBackup) !==
      JSON.stringify(request.workspaceBackup ?? null) ||
    capability.repository !== request.course.repository ||
    capability.branch !== request.course.branch ||
    capability.expectedSha !== request.course.expectedSha ||
    !sameAuthoringContext(capability.authoringContext, request.authoringContext) ||
    capability.runtimeSettings.idleTimeoutSeconds !== request.runtimeSettings.idleTimeoutSeconds ||
    capability.runtimeSettings.backupTtlSeconds !== request.runtimeSettings.backupTtlSeconds ||
    capability.runtimeSettings.sleepAfterSeconds !== request.runtimeSettings.sleepAfterSeconds ||
    capability.runtimeSettings.turnTimeoutSeconds !== request.runtimeSettings.turnTimeoutSeconds
  ) {
    throw new Error('Run capability does not authorize this request');
  }
  assertNotExpired(capability.expiresAt);
  return capability;
}

export async function authorizeSnapshot(request: CourseAgentSnapshotRequest, secret: string) {
  const capability = CourseAgentInspectCapabilitySchema.parse(
    await decodeAndVerifyToken(request.capability, secret),
  );
  if (
    capability.conversationId !== request.conversationId ||
    capability.sandboxId !== request.sandboxId
  ) {
    throw new Error('Inspect capability does not authorize this request');
  }
  assertNotExpired(capability.expiresAt);
  return capability;
}
