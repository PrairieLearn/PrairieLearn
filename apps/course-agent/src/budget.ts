import {
  type BlockedReason,
  type BudgetRequest,
  type BudgetResponse,
  BudgetResponseSchema,
  type UsageDelta,
  addUsage,
  budgetResponseStatus,
  emptyUsage,
} from '@prairielearn/course-agent-types';

export interface BudgetBlock {
  reason: Extract<
    BlockedReason,
    'budget_exhausted' | 'budget_unavailable' | 'usage_unavailable' | 'access_revoked'
  >;
  retryAt?: string;
}
export interface BudgetState {
  balanceMilliDollars: number;
  creditExpiresAt: string | null;
  unreportedUsage: UsageDelta;
  lastAcknowledgedSequence: number;
  pendingRequest: BudgetRequest | null;
  inFlightRequestId: string | null;
  blocked: BudgetBlock | null;
}

/** One persisted balance and one immutable report awaiting acknowledgement. */
export class ConversationBudget {
  private delivery: Promise<void> | null = null;
  private state: BudgetState;

  constructor(
    private storage: DurableObjectStorage,
    private env: Pick<Env, 'PL_SERVICE_URL' | 'PL_SERVICE_TOKEN'>,
    private conversationId: string,
    private changed: () => void,
  ) {
    this.state = storage.kv.get<BudgetState>('budget') ?? {
      balanceMilliDollars: 0,
      creditExpiresAt: null,
      unreportedUsage: emptyUsage(),
      lastAcknowledgedSequence: 0,
      pendingRequest: null,
      inFlightRequestId: null,
      blocked: null,
    };
  }

  get blocked() {
    return this.state.blocked;
  }

  private save(next: BudgetState) {
    this.storage.kv.put('budget', next);
    this.state = next;
    this.changed();
  }

  fail(reason: BudgetBlock['reason'], retryAt?: string) {
    this.save({ ...this.state, blocked: { reason, ...(retryAt ? { retryAt } : {}) } });
  }

  recover() {
    if (this.state.inFlightRequestId) this.fail('usage_unavailable');
  }

  private expire() {
    if (this.state.creditExpiresAt && Date.parse(this.state.creditExpiresAt) <= Date.now()) {
      this.save({
        ...this.state,
        balanceMilliDollars: Math.min(0, this.state.balanceMilliDollars),
        creditExpiresAt: null,
      });
    }
  }

  async ensureCredit(): Promise<boolean> {
    this.expire();
    if (this.blocked) return false;
    if (this.state.balanceMilliDollars > 0) return true;
    if (this.delivery) await this.delivery;
    if (this.state.pendingRequest) await this.report(false);
    if (this.blocked) return false;
    if (this.state.pendingRequest) {
      this.fail('budget_unavailable');
      return false;
    }
    this.expire();
    while (!this.blocked && this.state.balanceMilliDollars <= 0) {
      await this.report(true);
      this.expire();
    }
    return !this.blocked;
  }

  async resume(): Promise<boolean> {
    if (this.blocked?.reason === 'usage_unavailable' || this.blocked?.reason === 'access_revoked') {
      return false;
    }
    if (this.blocked?.retryAt && Date.parse(this.blocked.retryAt) > Date.now()) return false;
    this.save({ ...this.state, blocked: null });
    // Replaying an old denial acknowledges its report, not a fresh policy decision.
    if (this.state.pendingRequest) {
      await this.report(false);
      if (
        this.blocked?.reason === 'budget_exhausted' &&
        Date.parse(this.blocked.retryAt!) <= Date.now()
      ) {
        this.save({ ...this.state, blocked: null });
      }
    }
    return this.ensureCredit();
  }

  begin(requestId: string) {
    if (this.state.inFlightRequestId) throw new Error('A model request is already running');
    this.save({ ...this.state, inFlightRequestId: requestId });
  }

  settle(requestId: string, usage: UsageDelta) {
    if (this.state.inFlightRequestId !== requestId) return;
    this.expire();
    this.save({
      ...this.state,
      inFlightRequestId: null,
      balanceMilliDollars: this.state.balanceMilliDollars - usage.costMilliDollars,
      unreportedUsage: addUsage(this.state.unreportedUsage, usage),
    });
  }

  async reportCompletedRequest() {
    this.expire();
    // At zero, the next inference combines this delta with its refill. Turn completion
    // still flushes report-only if no further inference is needed.
    if (this.state.balanceMilliDollars > 0) await this.report(false);
  }

  async report(requestCredit: boolean): Promise<void> {
    if (this.delivery) {
      await this.delivery;
      if (this.state.pendingRequest) return;
    }
    if (!this.state.pendingRequest) {
      if (
        !requestCredit &&
        Object.values(this.state.unreportedUsage).every((value) => value === 0)
      ) {
        return;
      }
      this.save({
        ...this.state,
        pendingRequest: {
          sequence: this.state.lastAcknowledgedSequence + 1,
          usageDelta: this.state.unreportedUsage,
          requestCredit,
        },
        unreportedUsage: emptyUsage(),
      });
    }
    this.delivery = this.deliver();
    try {
      await this.delivery;
    } finally {
      this.delivery = null;
    }
  }

  private async deliver() {
    const request = this.state.pendingRequest!;
    let result: BudgetResponse;
    try {
      const url = new URL(
        `pl/api/course-agent/conversations/${this.conversationId}/usage`,
        this.env.PL_SERVICE_URL.endsWith('/')
          ? this.env.PL_SERVICE_URL
          : `${this.env.PL_SERVICE_URL}/`,
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.PL_SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10_000),
      });
      if ([400, 404, 409].includes(response.status)) {
        this.fail(response.status === 404 ? 'access_revoked' : 'usage_unavailable');
        return;
      }
      if (![200, 403, 429].includes(response.status)) {
        throw new Error(`Usage report returned ${response.status}`);
      }
      const parsed = BudgetResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        this.fail('usage_unavailable');
        return;
      }
      result = parsed.data;
      const allocation = result.allocation;
      const expectedStatus = budgetResponseStatus(result);
      const requestedCredit = allocation.status !== 'not_requested';
      if (
        result.sequence !== request.sequence ||
        response.status !== expectedStatus ||
        request.requestCredit !== requestedCredit
      ) {
        this.fail('usage_unavailable');
        return;
      }
    } catch (error) {
      console.error('Course agent usage report failed', error);
      // A report-only failure may lag behind funded work. Keep its payload for replay.
      if (request.requestCredit) this.fail('budget_unavailable');
      return;
    }
    this.expire();
    const allocation = result.allocation;
    const next = {
      ...this.state,
      lastAcknowledgedSequence: request.sequence,
      pendingRequest: null,
    };
    if (allocation.status === 'granted' && Date.parse(allocation.expiresAt) > Date.now()) {
      next.balanceMilliDollars += allocation.grantedMilliDollars;
      next.creditExpiresAt = allocation.expiresAt;
    } else if (allocation.status === 'denied') {
      next.blocked =
        allocation.reason === 'hourly_limit'
          ? { reason: 'budget_exhausted', retryAt: allocation.retryAt }
          : { reason: 'access_revoked' };
    }
    this.save(next);
  }
}
