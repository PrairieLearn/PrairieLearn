import { z } from 'zod';

const databaseId = z.string().regex(/^[1-9]\d*$/);
export const serviceScopeSchema = z.object({
  conversationId: z.uuid(),
  courseId: databaseId,
  userId: databaseId,
  authnUserId: databaseId,
});
export type ServiceScope = z.infer<typeof serviceScopeSchema>;

export const modelPriceSchema = z.object({
  input: z.number().finite().nonnegative(),
  cachedInput: z.number().finite().nonnegative(),
  cacheWrite: z.number().finite().nonnegative(),
  output: z.number().finite().positive(),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;
export const conversationBindingSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  branch: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
    .refine((s) => !s.includes('..')),
  modelPrices: z.record(z.string(), modelPriceSchema).optional(),
});
export const executionAuthorizationSchema = z.object({
  actionId: z.uuid(),
  commandId: z.uuid(),
  createdAt: z.number().int().positive(),
});
export const executionGrantSchema = z.object({
  id: z.uuid(),
  actionId: z.uuid(),
  expiresAt: z.number().int().positive(),
  maxToolCalls: z.number().int().positive(),
  maxRuntimeMs: z.number().int().positive(),
  maxModelRequests: z.number().int().positive(),
});
export type ExecutionGrant = z.infer<typeof executionGrantSchema>;

export const modelReservationSchema = z.object({
  modelRequestId: z.uuid(),
  actionId: z.uuid(),
  capacityGrantId: z.uuid(),
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1).max(100),
  inputTokenUpperBound: z.number().int().nonnegative().max(1_000_000),
  requestedMaxOutputTokens: z.number().int().min(16).max(1_000_000),
  createdAt: z.number().int().positive(),
});
export type ModelReservation = z.infer<typeof modelReservationSchema>;
export const modelGrantSchema = z.object({
  reservationId: z.uuid(),
  reservedCostUnits: z.number().int().nonnegative(),
  maxOutputTokens: z.number().int().min(16),
  expiresAt: z.number().int().positive(),
});
export type ModelGrant = z.infer<typeof modelGrantSchema>;

export const modelUsageSchema = z
  .object({
    input: z.number().int().nonnegative(),
    cached: z.number().int().nonnegative(),
    cacheWrite: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  })
  .refine((v) => v.cached + v.cacheWrite <= v.input);
export const modelSettlementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('measured'),
    reservationId: z.uuid(),
    responseId: z.string().min(1),
    usage: modelUsageSchema,
  }),
  z.object({ kind: z.literal('unknown'), reservationId: z.uuid() }),
  z.object({ kind: z.literal('not_sent'), reservationId: z.uuid() }),
]);
export type ModelSettlement = z.infer<typeof modelSettlementSchema>;

export const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  requestId: z.string(),
});

export async function digestBody(body: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('');
}

function signedContent(
  audience: string,
  method: string,
  path: string,
  scope: ServiceScope,
  at: string,
  digest: string,
) {
  return new TextEncoder().encode(
    JSON.stringify([
      'course-agent-v1',
      audience,
      method,
      path,
      scope.conversationId,
      scope.courseId,
      scope.userId,
      scope.authnUserId,
      at,
      digest,
    ]),
  );
}

async function signingKey(secret: string) {
  if (!secret) throw new Error('Course agent signing key is missing.');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function serviceHeaders(
  secret: string,
  audience: 'agent-api' | 'pl-api',
  method: string,
  path: string,
  scope: ServiceScope,
  { body = '', now = Date.now() }: { body?: string; now?: number } = {},
) {
  const at = String(now);
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    signedContent(audience, method, path, scope, at, await digestBody(body)),
  );
  return {
    'Content-Type': 'application/json',
    'X-Course-Agent-Scope': JSON.stringify(scope),
    'X-Course-Agent-Time': at,
    'X-Course-Agent-Signature': Array.from(new Uint8Array(signature), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join(''),
  };
}

export async function verifyServiceRequest(
  request: Request,
  secret: string,
  audience: 'agent-api' | 'pl-api',
  body: string,
  now = Date.now(),
): Promise<ServiceScope | null> {
  const at = request.headers.get('X-Course-Agent-Time') ?? '';
  const signature = request.headers.get('X-Course-Agent-Signature') ?? '';
  const raw = request.headers.get('X-Course-Agent-Scope') ?? '';
  if (
    !secret ||
    !/^\d+$/.test(at) ||
    Math.abs(now - Number(at)) > 60_000 ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    raw.length > 2048
  ) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = serviceScopeSchema.safeParse(value);
  if (!parsed.success) return null;
  const url = new URL(request.url);
  const bytes = Uint8Array.from(signature.match(/../g)!, (v) => Number.parseInt(v, 16));
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(secret),
    bytes,
    signedContent(
      audience,
      request.method,
      url.pathname + url.search,
      parsed.data,
      at,
      await digestBody(body),
    ),
  );
  return valid ? parsed.data : null;
}

/** Bound bytes while reading; Content-Length is not trustworthy for streamed bodies. */
export async function readServiceBody(
  request: { body: ReadableStream<Uint8Array> | null },
  limit = 3_000_000,
) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error('Request too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export const runtimeSchema = z.object({
  running: z.boolean(),
  finishedAt: z.number().int().positive().nullable(),
});
export type ConversationRuntime = z.infer<typeof runtimeSchema>;
