import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import {
  type ToolOutcome,
  approvalSchema,
  executionAuthorizationSchema,
  modelReservationSchema,
} from '@prairielearn/course-agent-contract';

// An HTTP contract double only. The production PL API and financial ledger
// have separate tests against real PostgreSQL/Redis; this fixture makes no paid calls.
export class TestPLAPI extends DurableObject {
  async contextStatus(status: string) {
    await this.ctx.storage.put(
      'contextStatus',
      z.enum(['present', 'soft_deleted', 'absent', 'unavailable', 'conflict']).parse(status),
    );
  }

  async releasedAuthorizations() {
    return (await this.ctx.storage.get<string[]>('releasedAuthorizations')) ?? [];
  }

  async settlements() {
    return (await this.ctx.storage.get<unknown[]>('settlements')) ?? [];
  }

  async failSettlement(enabled: boolean) {
    await this.ctx.storage.put('failSettlement', enabled);
  }

  async delaySettlement(milliseconds: number) {
    await this.ctx.storage.put(
      'settlementDelay',
      z.number().int().min(0).max(1000).parse(milliseconds),
    );
  }

  async settlementAttempts() {
    return (await this.ctx.storage.get<number>('settlementAttempts')) ?? 0;
  }

  async delayModelGrant(milliseconds: number) {
    await this.ctx.storage.put(
      'modelGrantDelay',
      z.number().int().min(0).max(1000).parse(milliseconds),
    );
  }

  async setPublicationOrigin(origin: string) {
    await this.ctx.storage.put(
      'publicationOrigin',
      z
        .string()
        .regex(/^http:\/\/localhost:3\d{3}$/)
        .parse(origin),
    );
  }

  async complete(result: ToolOutcome) {
    await this.ctx.storage.put('result', result);
  }

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    const origin = await this.ctx.storage.get<string>('publicationOrigin');
    if (origin && path.includes('/publications')) {
      return fetch(new Request(new URL(path, origin), request));
    }
    const body = await request.json();
    if (path.endsWith('/context-status')) {
      const status = (await this.ctx.storage.get<string>('contextStatus')) ?? 'present';
      if (status === 'unavailable' || status === 'conflict') {
        return Response.json(
          {
            code: status,
            message: 'Fixture context check failed.',
            retryable: status === 'unavailable',
            requestId: crypto.randomUUID(),
          },
          { status: status === 'unavailable' ? 503 : 409 },
        );
      }
      return Response.json({ status });
    }
    if (path.endsWith('/permissions')) return Response.json({ allowed: true });
    if (path.endsWith('/model/reserve')) {
      const input = modelReservationSchema.parse(body);
      const delay = await this.ctx.storage.get<number>('modelGrantDelay');
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return Response.json({
        reservationId: input.modelRequestId,
        reservedCostUnits: 100000,
        maxOutputTokens: 32,
        expiresAt: input.createdAt + 120000,
      });
    }
    if (path.endsWith('/model/settle')) {
      await this.ctx.storage.put('settlementAttempts', (await this.settlementAttempts()) + 1);
      const delay = await this.ctx.storage.get<number>('settlementDelay');
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (await this.ctx.storage.get('failSettlement')) {
        return Response.json(
          {
            code: 'settlement_conflict',
            message: 'Fixture receipt mismatch.',
            retryable: false,
            requestId: crypto.randomUUID(),
          },
          { status: 409 },
        );
      }
      await this.ctx.storage.put('settlements', [...(await this.settlements()), body]);
      return Response.json({ accepted: true });
    }
    if (path.endsWith('/execution/authorize')) {
      const { actionId, commandId, createdAt } = executionAuthorizationSchema.parse(body);
      return Response.json({
        id: commandId,
        actionId,
        expiresAt: createdAt + 1800000,
        maxToolCalls: 100,
        maxRuntimeMs: 1800000,
        maxModelRequests: 200,
      });
    }
    if (path.endsWith('/execution/release')) {
      const { grantId } = z.object({ grantId: z.uuid() }).parse(body);
      await this.ctx.storage.put('releasedAuthorizations', [
        ...new Set([...(await this.releasedAuthorizations()), grantId]),
      ]);
      return Response.json({ accepted: true });
    }
    if (path.endsWith('/conversations/finished')) {
      return Response.json({ accepted: true });
    }
    if (path.endsWith('/publications/status')) {
      const result = await this.ctx.storage.get<ToolOutcome>('result');
      if (result) return Response.json({ status: 'complete', result });
      const capture = await this.ctx.storage.get('capture');
      return Response.json(
        capture
          ? { status: 'awaiting_approval', error: null, digest: 'fixture' }
          : { status: 'absent' },
      );
    }
    if (path.endsWith('/publications/advance')) return Response.json({ accepted: true });
    if (path.endsWith('/publications')) {
      const input = z.object({ id: z.uuid(), capture: approvalSchema }).parse(body);
      await this.ctx.storage.put('capture', input.capture);
      return Response.json({ id: input.id }, { status: 202 });
    }
    return new Response('Not found', { status: 404 });
  }
}
