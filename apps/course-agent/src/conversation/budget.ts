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

type AccountingState =
  | { phase: 'idle'; usage: UsageDelta }
  | { phase: 'running'; requestId: string; usage: UsageDelta }
  | { phase: 'reporting'; request: BudgetRequest };

export interface BudgetState {
  balanceMilliDollars: number;
  creditExpiresAt: string | null;
  lastAcknowledgedSequence: number;
  accounting: AccountingState;
  blocked: BudgetBlock | null;
}

/** Requests spend local credit; only refills submit accumulated usage to PL. */
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
      lastAcknowledgedSequence: 0,
      accounting: { phase: 'idle', usage: emptyUsage() },
      blocked: null,
    };
    if (this.state.accounting.phase === 'running') this._fail('usage_unavailable');
  }

  public get blocked() {
    return this.state.blocked;
  }

  public async tryStartRequest(requestId: string): Promise<boolean> {
    if (!(await this._ensureCredit())) return false;
    const accounting = this.state.accounting;
    if (accounting.phase !== 'idle') return false;
    this._save({
      ...this.state,
      accounting: { phase: 'running', requestId, usage: accounting.usage },
    });
    return true;
  }

  /** Null means final provider usage is unknown; zero usage means no generation occurred. */
  public recordRequestUsage(requestId: string, usage: UsageDelta | null) {
    const accounting = this.state.accounting;
    if (accounting.phase !== 'running' || accounting.requestId !== requestId) return;
    if (!usage) {
      this._fail('usage_unavailable');
      return;
    }
    this._expireCredit();
    this._save({
      ...this.state,
      balanceMilliDollars: this.state.balanceMilliDollars - usage.costMilliDollars,
      accounting: { phase: 'idle', usage: addUsage(accounting.usage, usage) },
    });
  }

  /** Explicit Resume can obtain credit without admitting a model request. */
  public async resume(): Promise<boolean> {
    if (this.blocked?.reason === 'usage_unavailable' || this.blocked?.reason === 'access_revoked') {
      return false;
    }
    if (this.blocked?.retryAt && Date.parse(this.blocked.retryAt) > Date.now()) return false;
    this._save({ ...this.state, blocked: null });
    return this._ensureCredit();
  }

  private _save(next: BudgetState) {
    this.storage.kv.put('budget', next);
    this.state = next;
    this.changed();
  }

  private _fail(reason: BudgetBlock['reason']) {
    this._save({ ...this.state, blocked: { reason } });
  }

  private _expireCredit() {
    if (this.state.creditExpiresAt && Date.parse(this.state.creditExpiresAt) <= Date.now()) {
      this._save({
        ...this.state,
        balanceMilliDollars: Math.min(0, this.state.balanceMilliDollars),
        creditExpiresAt: null,
      });
    }
  }

  private async _ensureCredit(): Promise<boolean> {
    if (this.delivery) await this.delivery;
    this._expireCredit();
    while (
      !this.blocked &&
      (this.state.accounting.phase === 'reporting' || this.state.balanceMilliDollars <= 0)
    ) {
      const accounting = this.state.accounting;
      if (accounting.phase === 'running') return false;
      const request: BudgetRequest =
        accounting.phase === 'reporting'
          ? accounting.request
          : {
              sequence: this.state.lastAcknowledgedSequence + 1,
              usageDelta: accounting.usage,
              requestCredit: true,
            };
      this._save({ ...this.state, accounting: { phase: 'reporting', request } });
      this.delivery = this._submitUsageReport(request);
      try {
        await this.delivery;
      } finally {
        this.delivery = null;
      }
      this._expireCredit();
    }
    return !this.blocked;
  }

  private async _submitUsageReport(request: BudgetRequest) {
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
        this._fail(response.status === 404 ? 'access_revoked' : 'usage_unavailable');
        return;
      }
      if (![200, 403, 429].includes(response.status)) {
        throw new Error(`Usage report returned ${response.status}`);
      }
      const parsed = BudgetResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        this._fail('usage_unavailable');
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
        this._fail('usage_unavailable');
        return;
      }
    } catch (error) {
      console.error('Course agent usage report failed', error);
      // A retry can succeed only if PL has not committed the frozen report.
      this._fail('budget_unavailable');
      return;
    }
    this._expireCredit();
    const allocation = result.allocation;
    const next: BudgetState = {
      ...this.state,
      lastAcknowledgedSequence: request.sequence,
      accounting: { phase: 'idle', usage: emptyUsage() },
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
    this._save(next);
  }
}
