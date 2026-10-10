import type { CodexState } from './codex.js';
import source from './receipts.sql';

// The Worker bundles SQLite queries as text; PL's filesystem/Postgres loader cannot run here.
const queries = Object.fromEntries(
  [...source.matchAll(/-- BLOCK (\w+)\n([\s\S]*?)(?=-- BLOCK|$)/g)].map(([, name, sql]) => [
    name,
    sql,
  ]),
);
type Execution = NonNullable<CodexState['executions']>[string];

/** Archive receipts outside broadcast state without expiring dispatch fences or usage evidence. */
export class ReceiptStore {
  constructor(private sql: SqlStorage) {
    sql.exec(queries.create);
  }

  saveExecutions(receipts: Record<string, Execution>) {
    this.sql.exec(queries.save_executions, JSON.stringify(receipts));
  }

  saveRejections(ids: string[]) {
    this.sql.exec(queries.save_rejections, JSON.stringify(ids));
  }

  executions(ids: string[]): Record<string, Execution> {
    return Object.fromEntries(
      this.sql
        .exec<{ operation_id: string; receipt: string }>(queries.executions, JSON.stringify(ids))
        .toArray()
        .map((row) => [row.operation_id, JSON.parse(row.receipt)]),
    );
  }

  rejected(id: string) {
    return this.sql.exec(queries.rejected, id).toArray().length > 0;
  }

  unstarted(after: string): Record<string, Execution> {
    return Object.fromEntries(
      this.sql
        .exec<{ operation_id: string; receipt: string }>(queries.unstarted, after)
        .toArray()
        .map((row) => [row.operation_id, JSON.parse(row.receipt)]),
    );
  }
}
